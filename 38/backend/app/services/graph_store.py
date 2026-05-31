import logging
import time
import uuid
from neo4j import GraphDatabase, Session, ManagedTransaction
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    TransientError,
    SessionExpired,
)
from typing import Optional, Callable, Any, Dict, List, Set, Tuple
from collections import OrderedDict

from ..config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

logger = logging.getLogger(__name__)

_driver = None

_in_memory_graph: dict = {"nodes": {}, "edges": {}}

_QUERY_CACHE_TTL = 300
_query_cache: OrderedDict = OrderedDict()
_query_cache_maxsize = 500


class LRUDict(OrderedDict):
    def __init__(self, maxsize: int = 128):
        super().__init__()
        self.maxsize = maxsize

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.move_to_end(key)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]


_query_cache: LRUDict = LRUDict(maxsize=_query_cache_maxsize)


def _cache_key(query_name: str, **kwargs) -> str:
    parts = [query_name]
    for k, v in sorted(kwargs.items()):
        parts.append(f"{k}={v}")
    return ":".join(parts)


def _get_cached_query(key: str) -> Optional[Any]:
    if key in _query_cache:
        result, timestamp = _query_cache[key]
        if time.time() - timestamp < _QUERY_CACHE_TTL:
            return result
        else:
            del _query_cache[key]
    return None


def _set_cached_query(key: str, value: Any):
    _query_cache[key] = (value, time.time())


def invalidate_query_cache():
    _query_cache.clear()
    logger.info("Query cache invalidated")


def get_driver() -> Optional[GraphDatabase]:
    global _driver
    if _driver is None:
        try:
            _driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD),
                connection_acquisition_timeout=15.0,
                connection_timeout=15.0,
                max_connection_lifetime=3600,
                max_connection_pool_size=20,
            )
            _driver.verify_connectivity()
            logger.info("Connected to Neo4j successfully")
            _create_indexes()
        except Exception as e:
            logger.warning(f"Neo4j connection failed: {e}. Using in-memory fallback.")
            _driver = None
    return _driver


def _create_indexes() -> None:
    if _use_in_memory():
        return

    def op(session: Session):
        with session.begin_transaction() as tx:
            tx.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.id)")
            tx.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.doc_id)")
            tx.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.type)")
            tx.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.name)")
            tx.commit()
        logger.info("Neo4j indexes ensured")

    try:
        driver = get_driver()
        if driver:
            with driver.session() as session:
                op(session)
    except Exception as e:
        logger.debug(f"Index creation skipped: {e}")


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None
        logger.info("Neo4j driver closed")


def _use_in_memory() -> bool:
    return get_driver() is None


def _retry_neo4j_op(
    op: Callable[[Session], Any],
    max_retries: int = 2,
    base_delay: float = 0.5,
) -> Optional[Any]:
    last_exception = None
    for attempt in range(max_retries):
        try:
            driver = get_driver()
            if not driver:
                return None
            with driver.session() as session:
                result = op(session)
                return result
        except (ServiceUnavailable, TransientError, SessionExpired) as e:
            last_exception = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Neo4j transient error (attempt {attempt + 1}/{max_retries}). Retrying in {delay}s...")
                time.sleep(delay)
                global _driver
                if _driver:
                    try:
                        _driver.close()
                    except Exception:
                        pass
                    _driver = None
            else:
                logger.error(f"Neo4j operation failed after {max_retries} attempts: {e}")
        except Neo4jError as e:
            logger.error(f"Neo4j error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in Neo4j operation: {e}", exc_info=True)
            return None
    return None


def _sync_memory_to_neo4j() -> None:
    if _use_in_memory():
        return

    def op(session: Session):
        with session.begin_transaction() as tx:
            for node in _in_memory_graph["nodes"].values():
                tx.run(
                    """
                    MERGE (e:Entity {id: $id})
                    SET e.name = $name, e.type = $type,
                        e.description = $description, e.confidence = $confidence,
                        e.doc_id = $doc_id
                    """,
                    id=node["id"],
                    name=node["name"],
                    type=node["type"],
                    description=node["description"],
                    confidence=node["confidence"],
                    doc_id=node["doc_id"],
                )
            for edge in _in_memory_graph["edges"].values():
                safe_type = edge["relation_type"].replace("`", "``").replace(" ", "_")
                if not safe_type or not safe_type[0].isalpha():
                    safe_type = "RELATED_TO"
                tx.run(
                    f"""
                    MATCH (s:Entity {{id: $source_id}})
                    MATCH (t:Entity {{id: $target_id}})
                    MERGE (s)-[r:`{safe_type}` {{id: $rel_id}}]->(t)
                    SET r.description = $description, r.confidence = $confidence
                    """,
                    source_id=edge["source"],
                    target_id=edge["target"],
                    rel_id=edge["id"],
                    description=edge["description"],
                    confidence=edge["confidence"],
                )
            tx.commit()
        return True

    try:
        _retry_neo4j_op(op)
        logger.info("Synced in-memory graph to Neo4j")
    except Exception as e:
        logger.error(f"Failed to sync memory graph to Neo4j: {e}")


def save_entity(
    doc_id: str,
    entity_id: str,
    name: str,
    entity_type: str,
    description: str = "",
    confidence: float = 0.0,
) -> bool:
    if not entity_id or not name or not entity_type:
        logger.warning(f"Invalid entity data: id={entity_id}, name={name}, type={entity_type}")
        return False

    _in_memory_graph["nodes"][entity_id] = {
        "id": entity_id,
        "name": name,
        "type": entity_type,
        "description": description,
        "confidence": confidence,
        "doc_id": doc_id,
    }

    invalidate_query_cache()

    if _use_in_memory():
        return True

    def op(session: Session):
        with session.begin_transaction() as tx:
            tx.run(
                """
                MERGE (e:Entity {id: $entity_id})
                SET e.name = $name,
                    e.type = $entity_type,
                    e.description = $description,
                    e.confidence = $confidence,
                    e.doc_id = $doc_id
                RETURN e.id as id
                """,
                entity_id=entity_id,
                name=name,
                entity_type=entity_type,
                description=description,
                confidence=confidence,
                doc_id=doc_id,
            )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to save entity {entity_id} to Neo4j, kept in memory")
        return False
    return True


def save_relation(
    relation_id: str,
    source_id: str,
    target_id: str,
    relation_type: str,
    description: str = "",
    confidence: float = 0.0,
) -> bool:
    if not relation_id or not source_id or not target_id or not relation_type:
        logger.warning(f"Invalid relation data: id={relation_id}")
        return False

    if source_id not in _in_memory_graph["nodes"]:
        logger.warning(f"Source node {source_id} not in memory")
        return False
    if target_id not in _in_memory_graph["nodes"]:
        logger.warning(f"Target node {target_id} not in memory")
        return False

    _in_memory_graph["edges"][relation_id] = {
        "id": relation_id,
        "source": source_id,
        "target": target_id,
        "relation_type": relation_type,
        "description": description,
        "confidence": confidence,
    }

    invalidate_query_cache()

    if _use_in_memory():
        return True

    safe_relation_type = relation_type.replace("`", "``").replace(" ", "_")
    if not safe_relation_type or not safe_relation_type[0].isalpha():
        safe_relation_type = "RELATED_TO"

    source_name = _in_memory_graph["nodes"][source_id]["name"]
    target_name = _in_memory_graph["nodes"][target_id]["name"]

    def op(session: Session):
        with session.begin_transaction() as tx:
            tx.run(
                """
                MERGE (s:Entity {id: $source_id})
                ON CREATE SET s.name = $source_name, s.type = 'Unknown', s.doc_id = ''
                """,
                source_id=source_id,
                source_name=source_name,
            )

            tx.run(
                """
                MERGE (t:Entity {id: $target_id})
                ON CREATE SET t.name = $target_name, t.type = 'Unknown', t.doc_id = ''
                """,
                target_id=target_id,
                target_name=target_name,
            )

            tx.run(
                f"""
                MATCH (s:Entity {{id: $source_id}})
                MATCH (t:Entity {{id: $target_id}})
                MERGE (s)-[r:`{safe_relation_type}` {{id: $relation_id}}]->(t)
                SET r.description = $description,
                    r.confidence = $confidence
                """,
                source_id=source_id,
                target_id=target_id,
                relation_id=relation_id,
                description=description,
                confidence=confidence,
            )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to save relation {relation_id} to Neo4j, kept in memory")
        return False
    return True


def save_extraction_result(
    doc_id: str,
    entities: list[dict],
    relations: list[dict],
) -> tuple[bool, int, int]:
    saved_entities = 0
    saved_relations = 0

    entity_ids = set()
    for e in entities:
        success = save_entity(
            doc_id=doc_id,
            entity_id=e.get("id", ""),
            name=e.get("name", ""),
            entity_type=e.get("type", ""),
            description=e.get("description", ""),
            confidence=e.get("confidence", 0.0),
        )
        if success:
            saved_entities += 1
            entity_ids.add(e.get("id", ""))

    for r in relations:
        if r.get("source") in entity_ids and r.get("target") in entity_ids:
            success = save_relation(
                relation_id=r.get("id", ""),
                source_id=r.get("source", ""),
                target_id=r.get("target", ""),
                relation_type=r.get("relation_type", ""),
                description=r.get("description", ""),
                confidence=r.get("confidence", 0.0),
            )
            if success:
                saved_relations += 1

    all_saved = saved_entities == len(entities) and saved_relations == len(relations)

    if not _use_in_memory() and not all_saved:
        logger.warning(f"Partial save for doc {doc_id}")

    logger.info(
        f"Saved for doc {doc_id}: {saved_entities}/{len(entities)} entities, "
        f"{saved_relations}/{len(relations)} relations"
    )

    return all_saved, saved_entities, saved_relations


def batch_save_entities(doc_id: str, entities: List[dict]) -> int:
    if not entities:
        return 0

    saved_count = 0
    for e in entities:
        if save_entity(
            doc_id=doc_id,
            entity_id=e.get("id", ""),
            name=e.get("name", ""),
            entity_type=e.get("type", ""),
            description=e.get("description", ""),
            confidence=e.get("confidence", 0.0),
        ):
            saved_count += 1
    return saved_count


def batch_save_relations(relations: List[dict]) -> int:
    if not relations:
        return 0

    saved_count = 0
    for r in relations:
        if save_relation(
            relation_id=r.get("id", ""),
            source_id=r.get("source", ""),
            target_id=r.get("target", ""),
            relation_type=r.get("relation_type", ""),
            description=r.get("description", ""),
            confidence=r.get("confidence", 0.0),
        ):
            saved_count += 1
    return saved_count


def _validate_graph_integrity(nodes: list[dict], edges: list[dict]) -> None:
    node_ids = {n.get("id") for n in nodes if n.get("id")}
    orphan_edges = []
    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src not in node_ids or tgt not in node_ids:
            orphan_edges.append(edge.get("id"))
    if orphan_edges:
        logger.warning(f"Found {len(orphan_edges)} orphan edges")


def get_graph_data(doc_id: str = None) -> dict:
    cache_key = _cache_key("get_graph_data", doc_id=doc_id or "all")
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    if _use_in_memory():
        nodes = list(_in_memory_graph["nodes"].values())
        edges = list(_in_memory_graph["edges"].values())
        if doc_id:
            nodes = [n for n in nodes if n.get("doc_id") == doc_id]
            node_ids = {n["id"] for n in nodes}
            edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]
        result = {"nodes": nodes, "edges": edges}
        _set_cached_query(cache_key, result)
        return result

    def op(session: Session):
        nodes = {}
        edges = []

        if doc_id:
            result = session.run(
                """
                MATCH (e:Entity)
                WHERE e.doc_id = $doc_id
                OPTIONAL MATCH (e)-[r]->(t:Entity)
                WHERE t.doc_id = $doc_id
                RETURN e, r, t
                """,
                doc_id=doc_id,
            )
        else:
            result = session.run(
                """
                MATCH (e:Entity)
                OPTIONAL MATCH (e)-[r]->(t:Entity)
                RETURN e, r, t
                """
            )

        for record in result:
            try:
                if record["e"] is not None:
                    e = dict(record["e"])
                    eid = e.get("id")
                    if eid:
                        nodes[eid] = {
                            "id": eid,
                            "name": e.get("name", ""),
                            "type": e.get("type", ""),
                            "description": e.get("description", ""),
                            "confidence": e.get("confidence", 0),
                            "doc_id": e.get("doc_id", ""),
                        }

                if record["t"] is not None:
                    t = dict(record["t"])
                    tid = t.get("id")
                    if tid and tid not in nodes:
                        nodes[tid] = {
                            "id": tid,
                            "name": t.get("name", ""),
                            "type": t.get("type", ""),
                            "description": t.get("description", ""),
                            "confidence": t.get("confidence", 0),
                            "doc_id": t.get("doc_id", ""),
                        }

                if record["r"] is not None:
                    r = record["r"]
                    src_node = dict(record["e"]) if record["e"] else {}
                    tgt_node = dict(record["t"]) if record["t"] else {}
                    edge_id = r.get("id", "")
                    if not edge_id:
                        edge_id = f"auto_{uuid.uuid4().hex[:8]}"

                    edges.append({
                        "id": edge_id,
                        "source": src_node.get("id", ""),
                        "target": tgt_node.get("id", ""),
                        "relation_type": type(r).__name__,
                        "description": r.get("description", ""),
                        "confidence": r.get("confidence", 0),
                    })
            except Exception as e:
                logger.warning(f"Error processing Neo4j record: {e}")
                continue

        return {"nodes": list(nodes.values()), "edges": edges}

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning("Neo4j query failed, falling back to in-memory graph")
        nodes = list(_in_memory_graph["nodes"].values())
        edges = list(_in_memory_graph["edges"].values())
        if doc_id:
            nodes = [n for n in nodes if n.get("doc_id") == doc_id]
            node_ids = {n["id"] for n in nodes}
            edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]
        result = {"nodes": nodes, "edges": edges}

    _set_cached_query(cache_key, result)
    return result


def get_neighbors(entity_id: str, max_depth: int = 1, doc_id: str = None) -> dict:
    cache_key = _cache_key("get_neighbors", entity_id=entity_id, max_depth=max_depth, doc_id=doc_id or "all")
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    if _use_in_memory():
        visited = set([entity_id])
        nodes = [_in_memory_graph["nodes"].get(entity_id)] if entity_id in _in_memory_graph["nodes"] else []
        edges = []
        current_level = [entity_id]

        for _ in range(max_depth):
            next_level = []
            for edge_id, edge in _in_memory_graph["edges"].items():
                if edge["source"] in current_level and edge["target"] not in visited:
                    if doc_id and _in_memory_graph["nodes"].get(edge["target"], {}).get("doc_id") != doc_id:
                        continue
                    edges.append(edge)
                    if edge["target"] in _in_memory_graph["nodes"]:
                        nodes.append(_in_memory_graph["nodes"][edge["target"]])
                        visited.add(edge["target"])
                        next_level.append(edge["target"])
                if edge["target"] in current_level and edge["source"] not in visited:
                    if doc_id and _in_memory_graph["nodes"].get(edge["source"], {}).get("doc_id") != doc_id:
                        continue
                    edges.append(edge)
                    if edge["source"] in _in_memory_graph["nodes"]:
                        nodes.append(_in_memory_graph["nodes"][edge["source"]])
                        visited.add(edge["source"])
                        next_level.append(edge["source"])
            current_level = next_level

        result = {"nodes": [n for n in nodes if n], "edges": edges}
        _set_cached_query(cache_key, result)
        return result

    def op(session: Session):
        nodes = []
        edges = []

        if doc_id:
            result = session.run(
                f"""
                MATCH path = (start:Entity {{id: $entity_id}})-[*1..{max_depth}]-(connected:Entity)
                WHERE connected.doc_id = $doc_id AND start.doc_id = $doc_id
                UNWIND nodes(path) AS n
                UNWIND relationships(path) AS r
                WITH DISTINCT n, r
                RETURN COLLECT(DISTINCT {{id: n.id, name: n.name, type: n.type, description: n.description, confidence: n.confidence, doc_id: n.doc_id}}) AS nodes,
                       COLLECT(DISTINCT {{id: r.id, source: startNode(r).id, target: endNode(r).id, relation_type: type(r), description: r.description, confidence: r.confidence}}) AS edges
                """,
                entity_id=entity_id,
                doc_id=doc_id,
            )
        else:
            result = session.run(
                f"""
                MATCH path = (start:Entity {{id: $entity_id}})-[*1..{max_depth}]-(connected:Entity)
                UNWIND nodes(path) AS n
                UNWIND relationships(path) AS r
                WITH DISTINCT n, r
                RETURN COLLECT(DISTINCT {{id: n.id, name: n.name, type: n.type, description: n.description, confidence: n.confidence, doc_id: n.doc_id}}) AS nodes,
                       COLLECT(DISTINCT {{id: r.id, source: startNode(r).id, target: endNode(r).id, relation_type: type(r), description: r.description, confidence: r.confidence}}) AS edges
                """,
                entity_id=entity_id,
            )

        record = result.single()
        if record:
            return {"nodes": record["nodes"], "edges": record["edges"]}
        return {"nodes": [], "edges": []}

    result = _retry_neo4j_op(op)
    if result is None:
        return {"nodes": [], "edges": []}

    _set_cached_query(cache_key, result)
    return result


def get_entity_types(doc_id: str = None) -> List[dict]:
    cache_key = _cache_key("get_entity_types", doc_id=doc_id or "all")
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    if _use_in_memory():
        type_counts: Dict[str, int] = {}
        for node in _in_memory_graph["nodes"].values():
            if doc_id and node.get("doc_id") != doc_id:
                continue
            entity_type = node.get("type", "Unknown")
            type_counts[entity_type] = type_counts.get(entity_type, 0) + 1
        result = [{"type": t, "count": c} for t, c in sorted(type_counts.items(), key=lambda x: -x[1])]
        _set_cached_query(cache_key, result)
        return result

    def op(session: Session):
        if doc_id:
            result = session.run(
                """
                MATCH (e:Entity)
                WHERE e.doc_id = $doc_id
                RETURN e.type AS type, COUNT(e) AS count
                ORDER BY count DESC
                """,
                doc_id=doc_id,
            )
        else:
            result = session.run(
                """
                MATCH (e:Entity)
                RETURN e.type AS type, COUNT(e) AS count
                ORDER BY count DESC
                """
            )
        return [{"type": record["type"], "count": record["count"]} for record in result]

    result = _retry_neo4j_op(op)
    if result is None:
        return []

    _set_cached_query(cache_key, result)
    return result


def get_relation_types(doc_id: str = None) -> List[dict]:
    cache_key = _cache_key("get_relation_types", doc_id=doc_id or "all")
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    if _use_in_memory():
        type_counts: Dict[str, int] = {}
        node_ids = set()
        if doc_id:
            node_ids = {
                nid for nid, node in _in_memory_graph["nodes"].items()
                if node.get("doc_id") == doc_id
            }

        for edge in _in_memory_graph["edges"].values():
            if doc_id and (edge["source"] not in node_ids or edge["target"] not in node_ids):
                continue
            rel_type = edge.get("relation_type", "Unknown")
            type_counts[rel_type] = type_counts.get(rel_type, 0) + 1

        result = [{"type": t, "count": c} for t, c in sorted(type_counts.items(), key=lambda x: -x[1])]
        _set_cached_query(cache_key, result)
        return result

    def op(session: Session):
        if doc_id:
            result = session.run(
                """
                MATCH (s:Entity)-[r]->(t:Entity)
                WHERE s.doc_id = $doc_id AND t.doc_id = $doc_id
                RETURN type(r) AS type, COUNT(r) AS count
                ORDER BY count DESC
                """,
                doc_id=doc_id,
            )
        else:
            result = session.run(
                """
                MATCH ()-[r]->()
                RETURN type(r) AS type, COUNT(r) AS count
                ORDER BY count DESC
                """
            )
        return [{"type": record["type"], "count": record["count"]} for record in result]

    result = _retry_neo4j_op(op)
    if result is None:
        return []

    _set_cached_query(cache_key, result)
    return result


def find_path(start_id: str, end_id: str, max_depth: int = 3) -> dict:
    cache_key = _cache_key("find_path", start=start_id, end=end_id, depth=max_depth)
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    if _use_in_memory():
        from collections import deque
        queue = deque([(start_id, [start_id], [])])
        visited = set([start_id])

        while queue:
            current, path_nodes, path_edges = queue.popleft()
            if current == end_id:
                nodes = [_in_memory_graph["nodes"].get(nid) for nid in path_nodes]
                return {
                    "found": True,
                    "nodes": [n for n in nodes if n],
                    "edges": path_edges,
                    "depth": len(path_edges),
                }

            if len(path_edges) >= max_depth:
                continue

            for edge_id, edge in _in_memory_graph["edges"].items():
                if edge["source"] == current and edge["target"] not in visited:
                    visited.add(edge["target"])
                    queue.append((edge["target"], path_nodes + [edge["target"]], path_edges + [edge]))
                if edge["target"] == current and edge["source"] not in visited:
                    visited.add(edge["source"])
                    queue.append((edge["source"], path_nodes + [edge["source"]], path_edges + [edge]))

        result = {"found": False, "nodes": [], "edges": [], "depth": 0}
        _set_cached_query(cache_key, result)
        return result

    def op(session: Session):
        result = session.run(
            f"""
            MATCH path = shortestPath((start:Entity {{id: $start_id}})-[*1..{max_depth}]-(end:Entity {{id: $end_id}}))
            RETURN nodes(path) AS nodes, relationships(path) AS edges, length(path) AS depth
            """,
            start_id=start_id,
            end_id=end_id,
        )
        record = result.single()
        if record:
            nodes = [dict(n) for n in record["nodes"]]
            edges = []
            for r in record["edges"]:
                edges.append({
                    "id": r.get("id", ""),
                    "source": "",
                    "target": "",
                    "relation_type": type(r).__name__,
                    "description": r.get("description", ""),
                    "confidence": r.get("confidence", 0),
                })
            return {"found": True, "nodes": nodes, "edges": edges, "depth": record["depth"]}
        return {"found": False, "nodes": [], "edges": [], "depth": 0}

    result = _retry_neo4j_op(op)
    if result is None:
        return {"found": False, "nodes": [], "edges": [], "depth": 0}

    _set_cached_query(cache_key, result)
    return result


def suggest_entity_associations(
    entity_id: str,
    limit: int = 10,
    doc_id: str = None,
) -> List[dict]:
    cache_key = _cache_key("suggest_assoc", entity_id=entity_id, limit=limit, doc_id=doc_id or "all")
    cached = _get_cached_query(cache_key)
    if cached is not None:
        return cached

    graph_data = get_graph_data(doc_id)
    all_nodes = graph_data["nodes"]
    all_edges = graph_data["edges"]

    if len(all_nodes) < 2:
        return []

    source_node = next((n for n in all_nodes if n["id"] == entity_id), None)
    if not source_node:
        return []

    connected_ids = set([entity_id])
    for edge in all_edges:
        if edge["source"] == entity_id:
            connected_ids.add(edge["target"])
        if edge["target"] == entity_id:
            connected_ids.add(edge["source"])

    suggestions = []
    source_type = source_node.get("type", "")
    source_name = source_node.get("name", "").lower()

    for node in all_nodes:
        if node["id"] in connected_ids:
            continue
        if doc_id and node.get("doc_id") != doc_id:
            continue

        score = 0.0
        node_type = node.get("type", "")
        node_name = node.get("name", "").lower()

        if node_type == source_type:
            score += 0.3

        if any(word in node_name for word in source_name.split()):
            score += 0.4

        node_connections = 0
        for edge in all_edges:
            if edge["source"] == node["id"] or edge["target"] == node["id"]:
                node_connections += 1
        score += min(0.3, node_connections * 0.05)

        if score > 0.2:
            suggestions.append({
                "entity_id": node["id"],
                "name": node["name"],
                "type": node["type"],
                "score": round(score, 3),
                "reason": f"类型匹配: {node_type == source_type}, 名称关联: {any(word in node_name for word in source_name.split())}",
            })

    suggestions.sort(key=lambda x: x["score"], reverse=True)
    result = suggestions[:limit]
    _set_cached_query(cache_key, result)
    return result


def batch_update_entities(updates: List[dict]) -> Tuple[int, int]:
    success_count = 0
    fail_count = 0

    for update in updates:
        entity_id = update.get("id")
        if not entity_id:
            fail_count += 1
            continue

        kwargs = {}
        if "name" in update:
            kwargs["name"] = update["name"]
        if "type" in update:
            kwargs["type"] = update["type"]
        if "description" in update:
            kwargs["description"] = update["description"]

        if update_entity(entity_id, **kwargs):
            success_count += 1
        else:
            fail_count += 1

    invalidate_query_cache()
    return success_count, fail_count


def batch_update_relations(updates: List[dict]) -> Tuple[int, int]:
    success_count = 0
    fail_count = 0

    for update in updates:
        relation_id = update.get("id")
        if not relation_id:
            fail_count += 1
            continue

        kwargs = {}
        if "relation_type" in update:
            kwargs["relation_type"] = update["relation_type"]
        if "description" in update:
            kwargs["description"] = update["description"]
        if "source" in update:
            kwargs["source"] = update["source"]
        if "target" in update:
            kwargs["target"] = update["target"]

        if update_relation(relation_id, **kwargs):
            success_count += 1
        else:
            fail_count += 1

    invalidate_query_cache()
    return success_count, fail_count


def delete_document_entities(doc_id: str) -> Tuple[int, int]:
    graph_data = get_graph_data(doc_id)
    nodes = graph_data["nodes"]
    edges = graph_data["edges"]

    deleted_entities = 0
    deleted_relations = 0

    for edge in edges:
        if delete_relation(edge["id"]):
            deleted_relations += 1

    for node in nodes:
        if delete_entity(node["id"]):
            deleted_entities += 1

    invalidate_query_cache()
    return deleted_entities, deleted_relations


def update_entity(entity_id: str, **kwargs) -> bool:
    if entity_id in _in_memory_graph["nodes"]:
        _in_memory_graph["nodes"][entity_id].update(kwargs)
    else:
        logger.warning(f"Entity {entity_id} not found in memory for update")
        return False

    invalidate_query_cache()

    if _use_in_memory():
        return True

    if not kwargs:
        return True

    def op(session: Session):
        with session.begin_transaction() as tx:
            set_clause = ", ".join(f"e.{k} = ${k}" for k in kwargs)
            tx.run(
                f"MATCH (e:Entity {{id: $entity_id}}) SET {set_clause}",
                entity_id=entity_id,
                **kwargs,
            )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to update entity {entity_id} in Neo4j")
        return False
    return True


def update_relation(relation_id: str, **kwargs) -> bool:
    if relation_id in _in_memory_graph["edges"]:
        _in_memory_graph["edges"][relation_id].update(kwargs)
    else:
        logger.warning(f"Relation {relation_id} not found in memory for update")
        return False

    invalidate_query_cache()

    if _use_in_memory():
        return True

    if not kwargs:
        return True

    def op(session: Session):
        with session.begin_transaction() as tx:
            sets = []
            params = {"relation_id": relation_id}
            for k, v in kwargs.items():
                if k == "relation_type":
                    continue
                sets.append(f"r.{k} = ${k}")
                params[k] = v
            if sets:
                set_clause = ", ".join(sets)
                tx.run(
                    f"MATCH ()-[r {{id: $relation_id}}]->() SET {set_clause}",
                    **params,
                )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to update relation {relation_id} in Neo4j")
        return False
    return True


def delete_entity(entity_id: str) -> bool:
    if entity_id in _in_memory_graph["nodes"]:
        del _in_memory_graph["nodes"][entity_id]
        _in_memory_graph["edges"] = {
            k: v for k, v in _in_memory_graph["edges"].items()
            if v["source"] != entity_id and v["target"] != entity_id
        }
    else:
        logger.warning(f"Entity {entity_id} not in memory")

    invalidate_query_cache()

    if _use_in_memory():
        return True

    def op(session: Session):
        with session.begin_transaction() as tx:
            tx.run(
                "MATCH (e:Entity {id: $entity_id}) DETACH DELETE e",
                entity_id=entity_id,
            )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to delete entity {entity_id} from Neo4j")
        return False
    return True


def delete_relation(relation_id: str) -> bool:
    if relation_id in _in_memory_graph["edges"]:
        del _in_memory_graph["edges"][relation_id]

    invalidate_query_cache()

    if _use_in_memory():
        return True

    def op(session: Session):
        with session.begin_transaction() as tx:
            tx.run(
                "MATCH ()-[r {id: $relation_id}]->() DELETE r",
                relation_id=relation_id,
            )
            tx.commit()
        return True

    result = _retry_neo4j_op(op)
    if result is None:
        logger.warning(f"Failed to delete relation {relation_id} from Neo4j")
        return False
    return True


def verify_integrity(doc_id: str = None) -> dict:
    data = get_graph_data(doc_id)
    nodes = data["nodes"]
    edges = data["edges"]

    node_ids = {n["id"] for n in nodes}
    issues = []

    for edge in edges:
        if edge["source"] not in node_ids:
            issues.append({
                "type": "orphan_source",
                "edge_id": edge["id"],
                "missing_node": edge["source"],
            })
        if edge["target"] not in node_ids:
            issues.append({
                "type": "orphan_target",
                "edge_id": edge["id"],
                "missing_node": edge["target"],
            })
        if edge["source"] == edge["target"]:
            issues.append({
                "type": "self_reference",
                "edge_id": edge["id"],
            })

    for node in nodes:
        if not node.get("name"):
            issues.append({
                "type": "missing_name",
                "node_id": node["id"],
            })
        if not node.get("type"):
            issues.append({
                "type": "missing_type",
                "node_id": node["id"],
            })

    return {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "total_issues": len(issues),
        "issues": issues,
    }


def get_query_cache_stats() -> dict:
    return {
        "total_entries": len(_query_cache),
        "max_entries": _query_cache_maxsize,
        "ttl_seconds": _QUERY_CACHE_TTL,
    }
