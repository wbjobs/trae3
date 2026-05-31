using System;
using System.Collections.Generic;
using System.Threading;
using Shared.Common;
using Shared.Proto;
using Server.StateSync;

namespace Server.GameLogic
{
    public class EcoSimulator
    {
        private readonly StateManager _stateManager;
        private readonly SyncBroadcaster _broadcaster;
        private Timer _simTimer;
        private readonly Random _rng = new Random();
        private int _entityIdCounter;

        private static readonly string[] Species = { "SpiritDeer", "MistWolf", "CrystalButterfly", "ShadowRabbit", "FlameFox" };
        private static readonly string[] Behaviors = { "Idle", "Wander", "Forage", "Flee", "Rest", "Hunt", "Play", "Sleep" };

        public EcoSimulator(StateManager stateManager, SyncBroadcaster broadcaster)
        {
            _stateManager = stateManager;
            _broadcaster = broadcaster;
        }

        public void Start()
        {
            SeedInitialCreatures();
            _simTimer = new Timer(SimulationTick, null, Constants.EcoSimTickMs, Constants.EcoSimTickMs);
            Console.WriteLine("[EcoSim] Started with initial creatures");
        }

        public void Stop()
        {
            _simTimer?.Dispose();
            Console.WriteLine("[EcoSim] Stopped");
        }

        private void SeedInitialCreatures()
        {
            for (int i = 0; i < 12; i++)
            {
                var species = Species[_rng.Next(Species.Length)];
                var entityId = $"eco_{Interlocked.Increment(ref _entityIdCounter):D6}";
                var pos = new Vec3(
                    (float)(_rng.NextDouble() * 100 - 50),
                    0,
                    (float)(_rng.NextDouble() * 100 - 50)
                );
                var entity = _stateManager.SpawnEntity(entityId, "Creature", species, pos);
                entity.Health = 80f + (float)(_rng.NextDouble() * 20);
                entity.Energy = 60f + (float)(_rng.NextDouble() * 40);
                entity.CurrentBehavior = Behaviors[_rng.Next(3)];
                _broadcaster.BroadcastEntitySpawn(entity);
            }
        }

        private void SimulationTick(object state)
        {
            var allEntities = _stateManager.GetAllEntitySyncData();

            foreach (var entityData in allEntities)
            {
                var entity = _stateManager.GetEntity(entityData.EntityId);
                if (entity == null) continue;

                SimulateBehaviorTransition(entity);
                SimulateMovement(entity);
                SimulateVitals(entity);
            }

            SimulateCreatureInteractions(allEntities);

            if (_rng.NextDouble() < 0.02 && _stateManager.EntityCount < 30)
            {
                SpawnRandomCreature();
            }

            if (_rng.NextDouble() < 0.005 && _stateManager.EntityCount > 5)
            {
                DespawnRandomCreature();
            }
        }

        private void SimulateBehaviorTransition(ServerEntityState entity)
        {
            if (_rng.NextDouble() > 0.15) return;

            string newBehavior;
            if (entity.Energy < 20f)
                newBehavior = "Rest";
            else if (entity.Health < 30f)
                newBehavior = "Flee";
            else
                newBehavior = Behaviors[_rng.Next(Behaviors.Length)];

            if (entity.CurrentBehavior != newBehavior)
            {
                entity.CurrentBehavior = newBehavior;
                entity.Dirty = true;
            }
        }

        private void SimulateMovement(ServerEntityState entity)
        {
            switch (entity.CurrentBehavior)
            {
                case "Wander":
                    entity.Position = new Vec3(
                        entity.Position.X + (float)(_rng.NextDouble() - 0.5) * 2f,
                        entity.Position.Y,
                        entity.Position.Z + (float)(_rng.NextDouble() - 0.5) * 2f
                    );
                    entity.Velocity = new Vec3(
                        (float)(_rng.NextDouble() - 0.5) * 1.5f,
                        0,
                        (float)(_rng.NextDouble() - 0.5) * 1.5f
                    );
                    entity.Dirty = true;
                    break;

                case "Flee":
                    entity.Position = new Vec3(
                        entity.Position.X + (float)(_rng.NextDouble() - 0.5) * 4f,
                        entity.Position.Y,
                        entity.Position.Z + (float)(_rng.NextDouble() - 0.5) * 4f
                    );
                    entity.Velocity = new Vec3(
                        (float)(_rng.NextDouble() - 0.5) * 3f,
                        0,
                        (float)(_rng.NextDouble() - 0.5) * 3f
                    );
                    entity.Dirty = true;
                    break;

                case "Forage":
                case "Play":
                    entity.Position = new Vec3(
                        entity.Position.X + (float)(_rng.NextDouble() - 0.5) * 0.5f,
                        entity.Position.Y,
                        entity.Position.Z + (float)(_rng.NextDouble() - 0.5) * 0.5f
                    );
                    entity.Velocity = new Vec3(0, 0, 0);
                    entity.Dirty = true;
                    break;

                case "Idle":
                case "Rest":
                case "Sleep":
                    if (entity.Velocity.X != 0 || entity.Velocity.Z != 0)
                    {
                        entity.Velocity = new Vec3(0, 0, 0);
                        entity.Dirty = true;
                    }
                    break;

                default:
                    entity.Velocity = new Vec3(0, 0, 0);
                    break;
            }

            entity.Position = new Vec3(
                Math.Max(-60f, Math.Min(60f, entity.Position.X)),
                entity.Position.Y,
                Math.Max(-60f, Math.Min(60f, entity.Position.Z))
            );
        }

        private void SimulateVitals(ServerEntityState entity)
        {
            float prevHealth = entity.Health;
            float prevEnergy = entity.Energy;

            switch (entity.CurrentBehavior)
            {
                case "Rest":
                case "Sleep":
                    entity.Health = Math.Min(100f, entity.Health + 0.5f);
                    entity.Energy = Math.Min(100f, entity.Energy + 1f);
                    break;
                case "Forage":
                    entity.Energy = Math.Min(100f, entity.Energy + 0.3f);
                    entity.Health = Math.Min(100f, entity.Health + 0.1f);
                    break;
                case "Flee":
                case "Hunt":
                    entity.Energy = Math.Max(0f, entity.Energy - 0.8f);
                    break;
                default:
                    entity.Energy = Math.Max(0f, entity.Energy - 0.2f);
                    break;
            }

            if (Math.Abs(entity.Health - prevHealth) > 0.01f || Math.Abs(entity.Energy - prevEnergy) > 0.01f)
            {
                entity.Dirty = true;
            }
        }

        private void SimulateCreatureInteractions(List<EntitySyncData> allEntities)
        {
            for (int i = 0; i < allEntities.Count; i++)
            {
                var a = allEntities[i];
                if (a.CurrentBehavior != "Hunt") continue;

                var entityA = _stateManager.GetEntity(a.EntityId);
                if (entityA == null) continue;

                EntitySyncData nearest = null;
                float minDist = float.MaxValue;

                for (int j = 0; j < allEntities.Count; j++)
                {
                    if (i == j) continue;
                    var b = allEntities[j];
                    var dx = b.Position.X - a.Position.X;
                    var dz = b.Position.Z - a.Position.Z;
                    var dist = dx * dx + dz * dz;
                    if (dist < minDist && dist < 100f)
                    {
                        minDist = dist;
                        nearest = b;
                    }
                }

                if (nearest != null)
                {
                    var entityB = _stateManager.GetEntity(nearest.EntityId);
                    if (entityB != null)
                    {
                        entityB.Health = Math.Max(0f, entityB.Health - 2f);
                        entityB.CurrentBehavior = "Flee";
                        entityB.Dirty = true;
                        entityA.Dirty = true;

                        entityA.ExtraState["last_interaction_target"] = nearest.EntityId;
                        entityA.ExtraState["last_interaction_type"] = "Hunt";
                    }
                }
            }
        }

        private void SpawnRandomCreature()
        {
            var species = Species[_rng.Next(Species.Length)];
            var entityId = $"eco_{Interlocked.Increment(ref _entityIdCounter):D6}";
            var pos = new Vec3(
                (float)(_rng.NextDouble() * 80 - 40),
                0,
                (float)(_rng.NextDouble() * 80 - 40)
            );
            var entity = _stateManager.SpawnEntity(entityId, "Creature", species, pos);
            entity.Health = 100f;
            entity.Energy = 100f;
            entity.CurrentBehavior = "Wander";
            _broadcaster.BroadcastEntitySpawn(entity);
            Console.WriteLine($"[EcoSim] Spawned {species} ({entityId})");
        }

        private void DespawnRandomCreature()
        {
            var all = _stateManager.GetAllEntitySyncData();
            if (all.Count == 0) return;
            var target = all[_rng.Next(all.Count)];
            _stateManager.DespawnEntity(target.EntityId);
            _broadcaster.BroadcastEntityDespawn(target.EntityId);
            Console.WriteLine($"[EcoSim] Despawned {target.EntityId}");
        }
    }
}
