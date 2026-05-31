import json
import re
import fnmatch
from datetime import datetime, timedelta
from imgctl.registry import RegistryClient, RegistryError
from imgctl.db import Database


def _parse_semver(tag):
    m = re.match(r"v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-_.](.+))?$", tag)
    if not m:
        return (0, 0, 0, tag)
    major = int(m.group(1) or 0)
    minor = int(m.group(2) or 0)
    patch = int(m.group(3) or 0)
    pre = m.group(4) or ""
    return (major, minor, patch, pre)


def _build_digest_tag_map(client, repository, tags):
    digest_map = {}
    tag_detail_map = {}
    for tag in tags:
        try:
            detail = client.tag_detail(repository, tag)
            d = detail["digest"]
            tag_detail_map[tag] = detail
            if d not in digest_map:
                digest_map[d] = []
            digest_map[d].append(tag)
        except Exception:
            tag_detail_map[tag] = {"tag": tag, "digest": "", "total_size": 0, "layers": 0, "media_type": ""}
    return digest_map, tag_detail_map


class Cleaner:
    STRATEGIES = ("untagged", "keep_latest_n", "older_than", "duplicate_digest", "pattern")

    def __init__(self, client: RegistryClient, db: Database, dry_run=True):
        self.client = client
        self.db = db
        self.dry_run = dry_run

    def _log(self, policy_id, action, target, status, detail=None):
        self.db.add_cleanup_log(policy_id, action, target, status, detail)

    def _get_shared_digest_tags(self, repository, digest):
        try:
            all_tags = self.client.list_tags(repository)
            shared = []
            for t in all_tags:
                try:
                    d = self.client.tag_detail(repository, t)
                    if d["digest"] == digest:
                        shared.append(t)
                except Exception:
                    continue
            return shared
        except Exception:
            return []

    def find_untagged(self, repository):
        try:
            tags = self.client.list_tags(repository)
            return {
                "repository": repository,
                "untagged": [],
                "total_tags": len(tags),
                "message": "Registry V2 API does not expose untagged manifests directly; use garbage collection on the registry host" if not tags else None,
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find untagged: {e}")

    def find_keep_latest_n(self, repository, n=5):
        try:
            tags = self.client.list_tags(repository)
            if len(tags) <= n:
                return {"repository": repository, "to_remove": [], "to_keep": tags}
            tag_details = []
            for tag in tags:
                try:
                    detail = self.client.tag_detail(repository, tag)
                    tag_details.append(detail)
                except Exception:
                    tag_details.append({"tag": tag, "digest": "", "total_size": 0})
            tag_details.sort(key=lambda x: _parse_semver(x.get("tag", "")))
            to_keep = [t["tag"] for t in tag_details[-n:]]
            to_remove = [t["tag"] for t in tag_details[:-n]]
            return {
                "repository": repository,
                "to_remove": to_remove,
                "to_keep": to_keep,
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find candidates: {e}")

    def find_older_than(self, repository, days):
        try:
            tags = self.client.list_tags(repository)
            cutoff = datetime.utcnow() - timedelta(days=days)
            to_remove = []
            to_keep = []
            for tag in tags:
                try:
                    mf = self.client.manifest(repository, tag)
                    created_str = mf["manifest"].get("config", {}).get("created", "")
                    if created_str:
                        created = datetime.fromisoformat(
                            created_str.replace("Z", "+00:00")
                        ).replace(tzinfo=None)
                        if created < cutoff:
                            to_remove.append(tag)
                        else:
                            to_keep.append(tag)
                    else:
                        to_keep.append(tag)
                except Exception:
                    to_keep.append(tag)
            return {
                "repository": repository,
                "cutoff_date": cutoff.isoformat(),
                "to_remove": to_remove,
                "to_keep": to_keep,
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find old images: {e}")

    def find_duplicate_digest(self, repository):
        try:
            tags = self.client.list_tags(repository)
            digest_map, _ = _build_digest_tag_map(self.client, repository, tags)
            to_remove = []
            for d, tag_list in digest_map.items():
                if len(tag_list) > 1:
                    tag_list.sort(key=lambda x: _parse_semver(x))
                    to_remove.extend(tag_list[1:])
            return {
                "repository": repository,
                "duplicates": {
                    d: t for d, t in digest_map.items() if len(t) > 1
                },
                "to_remove": to_remove,
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find duplicates: {e}")

    def find_by_pattern(self, repository, pattern):
        try:
            tags = self.client.list_tags(repository)
            matched = [t for t in tags if fnmatch.fnmatch(t, pattern)]
            return {
                "repository": repository,
                "pattern": pattern,
                "matched": matched,
                "total": len(tags),
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find by pattern: {e}")

    def execute_cleanup(self, repository, tags, policy_id=None, respect_locks=True):
        results = []
        deleted_digests = set()
        all_repo_tags = None
        for tag in tags:
            target = f"{repository}:{tag}"
            try:
                if respect_locks and self.db.is_tag_locked(repository, tag):
                    lock_info = self.db.get_locked_tag(repository, tag)
                    reason = lock_info["reason"] or "tag is locked"
                    self._log(policy_id, "delete", target, "skipped",
                              f"Tag is locked (reason: {reason})")
                    results.append({"target": target, "status": "skipped", "reason": "locked"})
                    continue

                detail = self.client.tag_detail(repository, tag)
                digest = detail["digest"]

                if digest in deleted_digests:
                    self._log(policy_id, "delete", target, "skipped", f"Digest {digest} already deleted")
                    results.append({"target": target, "status": "skipped", "reason": "digest_already_deleted"})
                    continue

                shared_tags = self._get_shared_digest_tags(repository, digest) if not self.dry_run else [tag]

                if respect_locks:
                    locked_shared = [t for t in shared_tags if self.db.is_tag_locked(repository, t)]
                    if locked_shared:
                        self._log(policy_id, "delete", target, "skipped",
                                  f"Shared digest {digest} has locked tags: {locked_shared}")
                        results.append({
                            "target": target,
                            "status": "skipped",
                            "reason": f"shared_digest_locked:{locked_shared}",
                        })
                        continue

                if len(shared_tags) > 1:
                    protected = [t for t in shared_tags if t not in tags]
                    if protected:
                        self._log(policy_id, "delete", target, "skipped",
                                  f"Digest {digest} shared by protected tags: {protected}")
                        results.append({
                            "target": target,
                            "status": "skipped",
                            "reason": f"shared_digest_protected_tags:{protected}",
                        })
                        continue

                if self.dry_run:
                    self._log(policy_id, "delete", target, "dry_run", f"Would delete digest {digest}")
                    results.append({"target": target, "status": "dry_run"})
                else:
                    self.client.delete_manifest(repository, digest)
                    deleted_digests.add(digest)
                    img = self.db.get_image(
                        name=repository.split("/")[-1] if "/" in repository else repository,
                        repository=repository,
                    )
                    if img:
                        for shared_tag in shared_tags:
                            self.db.delete_tag(img["id"], shared_tag)
                    self._log(policy_id, "delete", target, "success", f"Deleted digest {digest}")
                    results.append({"target": target, "status": "deleted"})
            except RegistryError as e:
                self._log(policy_id, "delete", target, "error", str(e))
                results.append({"target": target, "status": "error", "error": str(e)})
        return results

    def run_policy(self, policy_name):
        policy = self.db.get_policy(name=policy_name)
        if not policy:
            raise RuntimeError(f"Policy '{policy_name}' not found")
        if not policy["enabled"]:
            raise RuntimeError(f"Policy '{policy_name}' is disabled")

        strategy = policy["strategy"]
        params = json.loads(policy["params_json"])
        policy_id = policy["id"]
        repository = params.get("repository")
        if not repository:
            raise RuntimeError("Policy params must include 'repository'")

        if strategy == "keep_latest_n":
            n = params.get("n", 5)
            candidates = self.find_keep_latest_n(repository, n)
            tags = candidates.get("to_remove", [])
        elif strategy == "older_than":
            days = params.get("days", 90)
            candidates = self.find_older_than(repository, days)
            tags = candidates.get("to_remove", [])
        elif strategy == "duplicate_digest":
            candidates = self.find_duplicate_digest(repository)
            tags = candidates.get("to_remove", [])
        elif strategy == "pattern":
            pattern = params.get("pattern", "*")
            candidates = self.find_by_pattern(repository, pattern)
            tags = candidates.get("matched", [])
        elif strategy == "untagged":
            candidates = self.find_untagged(repository)
            tags = candidates.get("untagged", [])
        else:
            raise RuntimeError(f"Unknown strategy: {strategy}")

        if not tags:
            return {"policy": policy_name, "candidates": 0, "results": []}

        return {
            "policy": policy_name,
            "strategy": strategy,
            "repository": repository,
            "candidates": len(tags),
            "results": self.execute_cleanup(repository, tags, policy_id),
        }

    def list_policies(self):
        return self.db.list_policies()

    def add_policy(self, name, strategy, params):
        if strategy not in self.STRATEGIES:
            raise RuntimeError(f"Invalid strategy: {strategy}. Must be one of {self.STRATEGIES}")
        return self.db.add_policy(name, strategy, params)

    def remove_policy(self, name):
        return self.db.delete_policy(name)

    def toggle_policy(self, name, enabled):
        return self.db.toggle_policy(name, enabled)

    def cleanup_logs(self, limit=50):
        return self.db.list_cleanup_logs(limit)
