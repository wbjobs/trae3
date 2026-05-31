using System.Collections.Generic;
using System.Linq;
using Client.CharacterEco;
using Shared.Proto;
using UnityEngine;

namespace Client.SceneLogic
{
    public class SceneEntityManager : MonoBehaviour
    {
        private readonly Dictionary<string, CreatureBase> _creatures = new Dictionary<string, CreatureBase>();
        private readonly Dictionary<string, GameObject> _entityObjects = new Dictionary<string, GameObject>();
        private readonly Queue<EntitySyncData> _pendingSpawns = new Queue<EntitySyncData>();
        private ObjectPool<GameObject> _creaturePool;

        [SerializeField] private Transform _entityRoot;
        [SerializeField] private GameObject _creaturePrefab;
        [SerializeField] private int _maxSpawnsPerFrame = 3;

        public int CreatureCount => _creatures.Count;

        private Transform EntityRoot
        {
            get
            {
                if (_entityRoot == null)
                {
                    var rootObj = GameObject.Find("EntityRoot");
                    if (rootObj == null)
                    {
                        rootObj = new GameObject("EntityRoot");
                        rootObj.transform.SetParent(transform);
                    }
                    _entityRoot = rootObj.transform;
                }
                return _entityRoot;
            }
        }

        private void Awake()
        {
            _creaturePool = new ObjectPool<GameObject>(CreatePooledCreature, 50);
        }

        private GameObject CreatePooledCreature()
        {
            var go = _creaturePrefab != null
                ? Instantiate(_creaturePrefab, EntityRoot)
                : new GameObject("Creature_Pooled");
            go.SetActive(false);
            return go;
        }

        private void Update()
        {
            int spawned = 0;
            while (_pendingSpawns.Count > 0 && spawned < _maxSpawnsPerFrame)
            {
                var data = _pendingSpawns.Dequeue();
                SpawnEntityImmediate(data);
                spawned++;
            }
        }

        public void SpawnEntity(EntitySyncData data)
        {
            if (data == null || _creatures.ContainsKey(data.EntityId)) return;
            _pendingSpawns.Enqueue(data);
        }

        public void SpawnEntityImmediate(EntitySyncData data)
        {
            if (data == null || _creatures.ContainsKey(data.EntityId)) return;

            var go = _creaturePool.Get();
            go.name = $"Creature_{data.SpeciesId}_{data.EntityId}";
            go.transform.SetParent(EntityRoot);
            go.SetActive(true);

            var creature = go.GetComponent<CreatureBase>();
            if (creature == null)
            {
                creature = go.AddComponent<CreatureBase>();
            }

            creature.IsServerControlled = true;
            creature.Initialize(data.EntityId, data.SpeciesId, data.EntityType);
            creature.ApplySyncData(data);

            _creatures[data.EntityId] = creature;
            _entityObjects[data.EntityId] = go;
        }

        public void DespawnEntity(string entityId)
        {
            if (!_creatures.TryGetValue(entityId, out var creature)) return;

            _creatures.Remove(entityId);

            if (_entityObjects.TryGetValue(entityId, out var go))
            {
                _entityObjects.Remove(entityId);
                go.SetActive(false);
                _creaturePool.Release(go);
            }
        }

        public void UpdateEntity(EntitySyncData data)
        {
            if (data == null) return;

            if (!_creatures.ContainsKey(data.EntityId))
            {
                SpawnEntity(data);
                return;
            }

            if (_creatures.TryGetValue(data.EntityId, out var creature))
            {
                creature.ApplySyncData(data);
            }
        }

        public void UpdateEntityDelta(EntityDeltaSyncData delta)
        {
            if (delta == null || delta.FieldMask == 0) return;

            if (_creatures.TryGetValue(delta.EntityId, out var creature))
            {
                creature.ApplyDeltaSyncData(delta);
            }
        }

        public void UpdateEntitiesDeltaBatch(List<EntityDeltaSyncData> deltas)
        {
            if (deltas == null || deltas.Count == 0) return;
            foreach (var delta in deltas)
                UpdateEntityDelta(delta);
        }

        public void UpdateEntitiesBatch(List<EntitySyncData> entities)
        {
            if (entities == null) return;
            foreach (var entity in entities)
                UpdateEntity(entity);
        }

        public CreatureBase GetCreature(string entityId)
        {
            _creatures.TryGetValue(entityId, out var c);
            return c;
        }

        public IEnumerable<CreatureBase> GetAllCreatures()
        {
            return _creatures.Values;
        }

        public void ClearAll()
        {
            foreach (var kvp in _entityObjects)
            {
                if (kvp.Value != null)
                {
                    kvp.Value.SetActive(false);
                    _creaturePool.Release(kvp.Value);
                }
            }
            _creatures.Clear();
            _entityObjects.Clear();
            _pendingSpawns.Clear();
        }

        public List<EntitySyncData> GetAllSyncData()
        {
            return _creatures.Values.Select(c => c.GetCurrentSyncData()).ToList();
        }
    }

    public class ObjectPool<T> where T : class
    {
        private readonly Queue<T> _pool = new Queue<T>();
        private readonly System.Func<T> _factory;
        private readonly int _maxSize;

        public ObjectPool(System.Func<T> factory, int maxSize = 100)
        {
            _factory = factory;
            _maxSize = maxSize;
        }

        public T Get()
        {
            return _pool.Count > 0 ? _pool.Dequeue() : _factory();
        }

        public void Release(T item)
        {
            if (item == null) return;
            if (_pool.Count < _maxSize)
                _pool.Enqueue(item);
        }

        public void Clear()
        {
            _pool.Clear();
        }
    }
}
