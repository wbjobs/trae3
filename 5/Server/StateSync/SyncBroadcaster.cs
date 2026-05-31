using System;
using System.Collections.Generic;
using System.Linq;
using Server.Network;
using Shared.Common;
using Shared.Proto;

namespace Server.StateSync
{
    public class SyncBroadcaster
    {
        private readonly SocketServer _server;
        private readonly StateManager _stateManager;
        private System.Threading.Timer _syncTimer;
        private System.Threading.Timer _sceneTimer;
        private System.Threading.Timer _weatherTimer;
        private readonly Random _random = new Random();

        public SyncBroadcaster(SocketServer server, StateManager stateManager)
        {
            _server = server;
            _stateManager = stateManager;
        }

        public void Start()
        {
            _syncTimer = new System.Threading.Timer(SyncTick, null, Constants.SyncTickIntervalMs, Constants.SyncTickIntervalMs);
            _sceneTimer = new System.Threading.Timer(SceneTick, null, 1000, 1000);
            _weatherTimer = new System.Threading.Timer(WeatherTick, null, 60000, 120000);
            Console.WriteLine("[Sync] Broadcaster started");
        }

        public void Stop()
        {
            _syncTimer?.Dispose();
            _sceneTimer?.Dispose();
            _weatherTimer?.Dispose();
            Console.WriteLine("[Sync] Broadcaster stopped");
        }

        private void SyncTick(object state)
        {
            var deltaBatch = new EntityDeltaBatchPayload();
            var fullSyncList = new List<EntitySyncData>();

            var dirtyEntities = _stateManager.GetDirtyEntities();
            var entityStates = _stateManager.GetAllEntityStates();

            foreach (var entity in entityStates)
            {
                var delta = entity.ToDeltaSyncData();
                if (delta.FieldMask != 0)
                {
                    deltaBatch.Deltas.Add(delta);
                }
                entity.CommitLastState();
            }

            _stateManager.ClearAllDirty();

            if (deltaBatch.Deltas.Count > 0)
            {
                var msg = ProtoCodec.CreateMessage(MsgType.EntityDeltaBatchSync, deltaBatch);
                _server.BroadcastMessage(msg);
            }
        }

        private void SceneTick(object state)
        {
            WeatherType currentWeather = WeatherType.Clear;
            _stateManager.UpdateScene(s =>
            {
                s.AdvanceTime(1f, Constants.DayCycleSeconds);
                s.UpdateWeatherTransition(1f);
                currentWeather = s.WeatherType;
            });

            var sceneData = _stateManager.GetSceneSyncData();
            var msg = ProtoCodec.CreateMessage(MsgType.SceneStateSync, sceneData);
            _server.BroadcastMessage(msg);

            if (_stateManager.IsWeatherDirty())
            {
                var weatherPayload = _stateManager.GetWeatherUpdatePayload();
                var weatherMsg = ProtoCodec.CreateMessage(MsgType.WeatherUpdate, weatherPayload);
                _server.BroadcastMessage(weatherMsg);
                _stateManager.ClearWeatherDirty();
            }

            UpdateCreatureBehaviorByWeatherAndTime(currentWeather, _stateManager.GetSceneTimeOfDay());
        }

        private void WeatherTick(object state)
        {
            var weathers = (WeatherType[])Enum.GetValues(typeof(WeatherType));
            var targetWeather = weathers[_random.Next(weathers.Length)];
            var duration = 15f + (float)(_random.NextDouble() * 45f);

            _stateManager.UpdateScene(s =>
            {
                if (targetWeather != s.TargetWeather)
                {
                    s.StartWeatherTransition(targetWeather, duration);
                    Console.WriteLine($"[Weather] Transitioning to {targetWeather} over {duration:F1}s");
                }
            });
        }

        private void UpdateCreatureBehaviorByWeatherAndTime(WeatherType weather, float timeOfDay)
        {
            bool isNight = timeOfDay >= 20f || timeOfDay < 6f;
            bool isBadWeather = weather == WeatherType.Rainy || weather == WeatherType.Stormy;

            _stateManager.ForEachEntity(entity =>
            {
                if (isBadWeather)
                {
                    if (entity.CurrentBehavior == "Wander" || entity.CurrentBehavior == "Hunt")
                    {
                        entity.CurrentBehavior = "Rest";
                        entity.Dirty = true;
                    }
                }
                else if (isNight && entity.SpeciesId != "owl" && entity.SpeciesId != "bat")
                {
                    if (entity.CurrentBehavior == "Wander" || entity.CurrentBehavior == "Hunt")
                    {
                        entity.CurrentBehavior = "Sleep";
                        entity.Dirty = true;
                    }
                }
            });
        }

        public void BroadcastEntitySpawn(ServerEntityState entity)
        {
            var msg = ProtoCodec.CreateMessage(MsgType.EntitySpawn, new EntitySpawnPayload
            {
                EntityData = entity.ToSyncData()
            });
            _server.BroadcastMessage(msg);
        }

        public void BroadcastEntityDespawn(string entityId)
        {
            var msg = ProtoCodec.CreateMessage(MsgType.EntityDespawn, new EntityDespawnPayload
            {
                EntityId = entityId
            });
            _server.BroadcastMessage(msg);
        }

        public void SendFullSyncToSession(ClientSession session)
        {
            var allEntities = _stateManager.GetAllEntitySyncData();
            foreach (var entityData in allEntities)
            {
                var spawnMsg = ProtoCodec.CreateMessage(MsgType.EntitySpawn, new EntitySpawnPayload
                {
                    EntityData = entityData
                });
                _server.SendToSession(session, spawnMsg);
            }

            var sceneData = _stateManager.GetSceneSyncData();
            var sceneMsg = ProtoCodec.CreateMessage(MsgType.SceneStateSync, sceneData);
            _server.SendToSession(session, sceneMsg);
        }
    }
}
