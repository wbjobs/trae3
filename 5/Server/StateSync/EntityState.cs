using System;
using System.Collections.Generic;
using Shared.Proto;

namespace Server.StateSync
{
    public class ServerEntityState
    {
        public string EntityId { get; set; }
        public string EntityType { get; set; }
        public string SpeciesId { get; set; }
        public Vec3 Position { get; set; } = new Vec3();
        public Vec3 Rotation { get; set; } = new Vec3();
        public Vec3 Velocity { get; set; } = new Vec3();
        public string CurrentBehavior { get; set; } = "Idle";
        public float Health { get; set; } = 100f;
        public float Energy { get; set; } = 100f;
        public Dictionary<string, string> ExtraState { get; set; } = new Dictionary<string, string>();
        public DateTime LastUpdateTime { get; set; } = DateTime.UtcNow;
        public bool Dirty { get; set; }

        private Vec3 _lastPosition = new Vec3();
        private Vec3 _lastRotation = new Vec3();
        private Vec3 _lastVelocity = new Vec3();
        private string _lastBehavior = "Idle";
        private float _lastHealth = 100f;
        private float _lastEnergy = 100f;
        private Dictionary<string, string> _lastExtraState = new Dictionary<string, string>();
        private const float PositionThreshold = 0.01f;
        private const float RotationThreshold = 0.5f;
        private const float VitalThreshold = 0.1f;

        public EntitySyncData ToSyncData()
        {
            return new EntitySyncData
            {
                EntityId = EntityId,
                EntityType = EntityType,
                SpeciesId = SpeciesId,
                Position = Position,
                Rotation = Rotation,
                Velocity = Velocity,
                CurrentBehavior = CurrentBehavior,
                Health = Health,
                Energy = Energy,
                ExtraState = ExtraState.ToKVList(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
        }

        public EntityDeltaSyncData ToDeltaSyncData()
        {
            var delta = new EntityDeltaSyncData
            {
                EntityId = EntityId,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            ushort mask = 0;

            if (Vec3Distance(Position, _lastPosition) > PositionThreshold)
            {
                delta.Position = Position;
                mask |= (ushort)EntityFieldMask.Position;
            }
            if (Vec3Distance(Rotation, _lastRotation) > RotationThreshold)
            {
                delta.Rotation = Rotation;
                mask |= (ushort)EntityFieldMask.Rotation;
            }
            if (Vec3Distance(Velocity, _lastVelocity) > PositionThreshold)
            {
                delta.Velocity = Velocity;
                mask |= (ushort)EntityFieldMask.Velocity;
            }
            if (CurrentBehavior != _lastBehavior)
            {
                delta.CurrentBehavior = CurrentBehavior;
                mask |= (ushort)EntityFieldMask.Behavior;
            }
            if (Math.Abs(Health - _lastHealth) > VitalThreshold)
            {
                delta.Health = Health;
                mask |= (ushort)EntityFieldMask.Health;
            }
            if (Math.Abs(Energy - _lastEnergy) > VitalThreshold)
            {
                delta.Energy = Energy;
                mask |= (ushort)EntityFieldMask.Energy;
            }

            var changedExtra = GetChangedExtraState();
            if (changedExtra.Count > 0)
            {
                delta.ExtraState = changedExtra.ToKVList();
                mask |= (ushort)EntityFieldMask.ExtraState;
            }

            delta.FieldMask = mask;
            return delta;
        }

        public void CommitLastState()
        {
            _lastPosition = new Vec3(Position.X, Position.Y, Position.Z);
            _lastRotation = new Vec3(Rotation.X, Rotation.Y, Rotation.Z);
            _lastVelocity = new Vec3(Velocity.X, Velocity.Y, Velocity.Z);
            _lastBehavior = CurrentBehavior;
            _lastHealth = Health;
            _lastEnergy = Energy;
            _lastExtraState = new Dictionary<string, string>(ExtraState);
        }

        private List<KVPair> GetChangedExtraState()
        {
            var changes = new List<KVPair>();
            foreach (var kvp in ExtraState)
            {
                if (!_lastExtraState.TryGetValue(kvp.Key, out var oldVal) || oldVal != kvp.Value)
                {
                    changes.Add(new KVPair(kvp.Key, kvp.Value));
                }
            }
            return changes;
        }

        private static float Vec3Distance(Vec3 a, Vec3 b)
        {
            if (a == null || b == null) return float.MaxValue;
            float dx = a.X - b.X;
            float dy = a.Y - b.Y;
            float dz = a.Z - b.Z;
            return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }

        public void ApplySyncData(EntitySyncData data)
        {
            if (data.Position != null) Position = data.Position;
            if (data.Rotation != null) Rotation = data.Rotation;
            if (data.Velocity != null) Velocity = data.Velocity;
            if (data.CurrentBehavior != null) CurrentBehavior = data.CurrentBehavior;
            Health = data.Health;
            Energy = data.Energy;
            if (data.ExtraState != null)
            {
                var dict = data.ExtraState.ToDictionary();
                foreach (var kvp in dict)
                    ExtraState[kvp.Key] = kvp.Value;
            }
            LastUpdateTime = DateTime.UtcNow;
            Dirty = true;
        }
    }

    public class ServerSceneState
    {
        public string SceneId { get; set; } = "mystic_realm_01";
        public float TimeOfDay { get; set; }
        public WeatherType WeatherType { get; set; } = WeatherType.Clear;
        public float Temperature { get; set; } = 22f;
        public float Humidity { get; set; } = 0.5f;
        public Dictionary<string, string> EnvironmentVars { get; set; } = new Dictionary<string, string>();
        public bool Dirty { get; set; }
        public bool WeatherDirty { get; set; }
        public WeatherType TargetWeather { get; set; } = WeatherType.Clear;
        public float WeatherTransitionProgress { get; set; } = 1f;
        public float WeatherTransitionDuration { get; set; } = 30f;
        public long WeatherTransitionStart { get; set; }

        public SceneStateData ToSyncData()
        {
            return new SceneStateData
            {
                SceneId = SceneId,
                TimeOfDay = TimeOfDay,
                WeatherType = WeatherType.ToString(),
                Temperature = Temperature,
                Humidity = Humidity,
                EnvironmentVars = EnvironmentVars.ToKVList()
            };
        }

        public WeatherUpdatePayload ToWeatherUpdatePayload()
        {
            return new WeatherUpdatePayload
            {
                TargetWeather = TargetWeather,
                TransitionDuration = WeatherTransitionDuration,
                Intensity = Humidity,
                TransitionStart = WeatherTransitionStart
            };
        }

        public void AdvanceTime(float deltaSeconds, float dayCycleSeconds)
        {
            TimeOfDay += (deltaSeconds / dayCycleSeconds) * 24f;
            if (TimeOfDay >= 24f) TimeOfDay -= 24f;
            Dirty = true;
        }

        public void StartWeatherTransition(WeatherType target, float duration)
        {
            TargetWeather = target;
            WeatherTransitionDuration = duration;
            WeatherTransitionProgress = 0f;
            WeatherTransitionStart = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            WeatherDirty = true;
        }

        public void UpdateWeatherTransition(float deltaSeconds)
        {
            if (WeatherTransitionProgress < 1f)
            {
                WeatherTransitionProgress += deltaSeconds / WeatherTransitionDuration;
                if (WeatherTransitionProgress >= 1f)
                {
                    WeatherTransitionProgress = 1f;
                    WeatherType = TargetWeather;
                    WeatherDirty = true;
                }
                UpdateEnvironmentForWeather();
            }
        }

        private void UpdateEnvironmentForWeather()
        {
            float t = WeatherTransitionProgress;
            var (baseTemp, baseHumidity) = GetWeatherParams(WeatherType);
            var (targetTemp, targetHumidity) = GetWeatherParams(TargetWeather);

            Temperature = baseTemp + (targetTemp - baseTemp) * t;
            Humidity = baseHumidity + (targetHumidity - baseHumidity) * t;
            Dirty = true;
        }

        private (float temp, float humidity) GetWeatherParams(WeatherType w)
        {
            return w switch
            {
                WeatherType.Clear => (25f, 0.3f),
                WeatherType.Cloudy => (20f, 0.5f),
                WeatherType.Rainy => (15f, 0.85f),
                WeatherType.Foggy => (12f, 0.95f),
                WeatherType.Stormy => (10f, 0.95f),
                _ => (22f, 0.5f)
            };
        }
    }
}
