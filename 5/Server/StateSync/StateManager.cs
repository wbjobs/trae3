using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Shared.Proto;

namespace Server.StateSync
{
    public class StateManager
    {
        private readonly ConcurrentDictionary<string, ServerEntityState> _entities = new ConcurrentDictionary<string, ServerEntityState>();
        private readonly ServerSceneState _sceneState = new ServerSceneState();
        private readonly object _sceneLock = new object();
        private readonly object _dirtyLock = new object();

        public ServerSceneState SceneState => _sceneState;

        public ServerEntityState SpawnEntity(string entityId, string entityType, string speciesId, Vec3 position)
        {
            var state = new ServerEntityState
            {
                EntityId = entityId,
                EntityType = entityType,
                SpeciesId = speciesId,
                Position = position ?? new Vec3(),
                Dirty = true
            };
            _entities[entityId] = state;
            return state;
        }

        public bool DespawnEntity(string entityId)
        {
            return _entities.TryRemove(entityId, out _);
        }

        public ServerEntityState GetEntity(string entityId)
        {
            _entities.TryGetValue(entityId, out var s);
            return s;
        }

        public void UpdateEntityFromClient(EntitySyncData data)
        {
            if (data == null) return;
            if (_entities.TryGetValue(data.EntityId, out var state))
            {
                state.ApplySyncData(data);
            }
        }

        public List<EntitySyncData> GetDirtyEntities()
        {
            var result = new List<EntitySyncData>();
            lock (_dirtyLock)
            {
                foreach (var entity in _entities.Values)
                {
                    if (entity.Dirty)
                    {
                        entity.Dirty = false;
                        result.Add(entity.ToSyncData());
                    }
                }
            }
            return result;
        }

        public List<EntitySyncData> GetAllEntitySyncData()
        {
            return _entities.Values.Select(e => e.ToSyncData()).ToList();
        }

        public List<ServerEntityState> GetAllEntityStates()
        {
            return _entities.Values.ToList();
        }

        public List<string> GetAllEntityIds()
        {
            return _entities.Keys.ToList();
        }

        public void ForEachEntity(Action<ServerEntityState> action)
        {
            foreach (var entity in _entities.Values)
            {
                action(entity);
            }
        }

        public void UpdateScene(Action<ServerSceneState> updater)
        {
            lock (_sceneLock)
            {
                updater(_sceneState);
            }
        }

        public SceneStateData GetSceneSyncData()
        {
            lock (_sceneLock)
            {
                _sceneState.Dirty = false;
                return _sceneState.ToSyncData();
            }
        }

        public bool IsWeatherDirty()
        {
            lock (_sceneLock)
            {
                return _sceneState.WeatherDirty;
            }
        }

        public WeatherUpdatePayload GetWeatherUpdatePayload()
        {
            lock (_sceneLock)
            {
                return _sceneState.ToWeatherUpdatePayload();
            }
        }

        public void ClearWeatherDirty()
        {
            lock (_sceneLock)
            {
                _sceneState.WeatherDirty = false;
            }
        }

        public float GetSceneTimeOfDay()
        {
            lock (_sceneLock)
            {
                return _sceneState.TimeOfDay;
            }
        }

        public void ClearAllDirty()
        {
            lock (_dirtyLock)
            {
                foreach (var entity in _entities.Values)
                    entity.Dirty = false;
            }
            lock (_sceneLock)
                _sceneState.Dirty = false;
        }

        public int EntityCount => _entities.Count;
    }
}
