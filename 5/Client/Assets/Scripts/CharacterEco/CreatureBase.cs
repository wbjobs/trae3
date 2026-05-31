using System;
using System.Collections.Generic;
using Shared.Proto;
using UnityEngine;

namespace Client.CharacterEco
{
    public class CreatureBase : MonoBehaviour
    {
        public string EntityId { get; private set; }
        public string SpeciesId { get; private set; }
        public string EntityType { get; private set; }
        public SpeciesProfile Profile { get; private set; }
        public CreatureVitals Vitals { get; private set; }
        public string CurrentBehavior { get; private set; } = "Idle";
        public Vector3 LastThreatPosition { get; set; }
        public Transform NearestPrey { get; set; }
        public bool IsServerControlled { get; set; } = true;

        internal Vector3 _wanderTarget;

        private EcoBehaviorTree _behaviorTree;
        private Vec3 _serverPosition;
        private Vec3 _serverVelocity;
        private float _syncLerpSpeed = 8f;
        private Dictionary<string, string> _extraState = new Dictionary<string, string>();

        private Animator _animator;
        private bool _behaviorDirty;

        public void Initialize(string entityId, string speciesId, string entityType)
        {
            EntityId = entityId;
            SpeciesId = speciesId;
            EntityType = entityType;
            Profile = SpeciesRegistry.GetProfile(speciesId);
            Vitals = new CreatureVitals { Health = 100f, Energy = 100f, Hunger = 0f, Mood = 70f };

            if (!IsServerControlled)
            {
                _behaviorTree = new EcoBehaviorTree();
                _behaviorTree.BuildDefaultTree();
            }

            _animator = GetComponent<Animator>();
        }

        public void ApplySyncData(EntitySyncData data)
        {
            if (data == null) return;

            _serverPosition = data.Position ?? _serverPosition;
            _serverVelocity = data.Velocity ?? _serverVelocity;

            if (data.Position != null)
            {
                var targetPos = new Vector3(data.Position.X, data.Position.Y, data.Position.Z);
                transform.position = Vector3.Lerp(transform.position, targetPos, _syncLerpSpeed * Time.deltaTime);
            }

            if (data.Rotation != null)
            {
                var targetRot = Quaternion.Euler(data.Rotation.X, data.Rotation.Y, data.Rotation.Z);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, _syncLerpSpeed * Time.deltaTime);
            }

            Vitals.Health = data.Health;
            Vitals.Energy = data.Energy;

            if (data.CurrentBehavior != null && data.CurrentBehavior != CurrentBehavior)
            {
                CurrentBehavior = data.CurrentBehavior;
                _behaviorDirty = true;
            }

            if (data.ExtraState != null)
            {
                var dict = data.ExtraState.ToDictionary();
                foreach (var kvp in dict)
                    _extraState[kvp.Key] = kvp.Value;
            }
        }

        public void ApplyDeltaSyncData(EntityDeltaSyncData delta)
        {
            if (delta == null || delta.FieldMask == 0) return;

            if (delta.HasField(EntityFieldMask.Position) && delta.Position != null)
            {
                _serverPosition = delta.Position;
                var targetPos = new Vector3(delta.Position.X, delta.Position.Y, delta.Position.Z);
                transform.position = Vector3.Lerp(transform.position, targetPos, _syncLerpSpeed * Time.deltaTime);
            }

            if (delta.HasField(EntityFieldMask.Rotation) && delta.Rotation != null)
            {
                var targetRot = Quaternion.Euler(delta.Rotation.X, delta.Rotation.Y, delta.Rotation.Z);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, _syncLerpSpeed * Time.deltaTime);
            }

            if (delta.HasField(EntityFieldMask.Velocity) && delta.Velocity != null)
            {
                _serverVelocity = delta.Velocity;
            }

            if (delta.HasField(EntityFieldMask.Health) && delta.Health.HasValue)
            {
                Vitals.Health = delta.Health.Value;
            }

            if (delta.HasField(EntityFieldMask.Energy) && delta.Energy.HasValue)
            {
                Vitals.Energy = delta.Energy.Value;
            }

            if (delta.HasField(EntityFieldMask.Behavior) && delta.CurrentBehavior != null && delta.CurrentBehavior != CurrentBehavior)
            {
                CurrentBehavior = delta.CurrentBehavior;
                _behaviorDirty = true;
            }

            if (delta.HasField(EntityFieldMask.ExtraState) && delta.ExtraState != null)
            {
                var dict = delta.ExtraState.ToDictionary();
                foreach (var kvp in dict)
                    _extraState[kvp.Key] = kvp.Value;
            }
        }

        public EntitySyncData GetCurrentSyncData()
        {
            return new EntitySyncData
            {
                EntityId = EntityId,
                EntityType = EntityType,
                SpeciesId = SpeciesId,
                Position = new Vec3(transform.position.x, transform.position.y, transform.position.z),
                Rotation = new Vec3(transform.rotation.eulerAngles.x, transform.rotation.eulerAngles.y, transform.rotation.eulerAngles.z),
                Velocity = _serverVelocity,
                CurrentBehavior = CurrentBehavior,
                Health = Vitals.Health,
                Energy = Vitals.Energy,
                ExtraState = _extraState.ToKVList(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
        }

        public void SetBehavior(string behavior)
        {
            if (IsServerControlled) return;
            if (CurrentBehavior == behavior) return;
            CurrentBehavior = behavior;
            _behaviorDirty = true;
        }

        public void MoveToward(Vector3 target, float speed, float deltaTime)
        {
            if (IsServerControlled) return;

            var direction = (target - transform.position);
            direction.y = 0;
            if (direction.sqrMagnitude > 0.01f)
            {
                direction.Normalize();
                transform.position += direction * speed * deltaTime;
                transform.rotation = Quaternion.Slerp(
                    transform.rotation,
                    Quaternion.LookRotation(direction),
                    10f * deltaTime
                );
            }
        }

        public Vector3 GetRandomWanderPoint()
        {
            var center = transform.position;
            var radius = 15f;
            return new Vector3(
                center.x + UnityEngine.Random.Range(-radius, radius),
                center.y,
                center.z + UnityEngine.Random.Range(-radius, radius)
            );
        }

        public void OnReceiveInteraction(string initiatorId, string interactionType)
        {
            switch (interactionType)
            {
                case "Feed":
                    Vitals.Hunger = Mathf.Max(0f, Vitals.Hunger - 30f);
                    Vitals.Mood = Mathf.Min(100f, Vitals.Mood + 15f);
                    break;
                case "Heal":
                    Vitals.Health = Mathf.Min(100f, Vitals.Health + 20f);
                    break;
                case "Scare":
                    Vitals.Mood = Mathf.Max(0f, Vitals.Mood - 20f);
                    LastThreatPosition = transform.position + UnityEngine.Random.onUnitSphere * 10f;
                    LastThreatPosition.y = 0;
                    break;
                case "Hunt":
                    Vitals.Health = Mathf.Max(0f, Vitals.Health - 5f);
                    LastThreatPosition = transform.position + UnityEngine.Random.onUnitSphere * 10f;
                    LastThreatPosition.y = 0;
                    break;
            }

            _extraState["last_interaction"] = $"{initiatorId}:{interactionType}";
        }

        private void Update()
        {
            if (!IsServerControlled && _behaviorTree != null)
                _behaviorTree.Tick(this, Time.deltaTime);

            UpdateVitals(Time.deltaTime);

            if (_behaviorDirty)
            {
                UpdateAnimation();
                _behaviorDirty = false;
            }
        }

        private void UpdateVitals(float dt)
        {
            Vitals.Hunger += dt * 0.5f;
            Vitals.Hunger = Mathf.Min(100f, Vitals.Hunger);

            if (Vitals.Hunger > 80f)
                Vitals.Health -= dt * 1f;

            if (CurrentBehavior == "Rest" || CurrentBehavior == "Sleep")
            {
                Vitals.Energy = Mathf.Min(100f, Vitals.Energy + dt * 5f);
                Vitals.Health = Mathf.Min(100f, Vitals.Health + dt * 1f);
            }
            else if (CurrentBehavior == "Wander" || CurrentBehavior == "Forage")
            {
                Vitals.Energy -= dt * 0.3f;
            }
            else if (CurrentBehavior == "Flee" || CurrentBehavior == "Hunt")
            {
                Vitals.Energy -= dt * 0.8f;
            }

            if (CurrentBehavior == "Play")
            {
                Vitals.Mood = Mathf.Min(100f, Vitals.Mood + dt * 2f);
                Vitals.Energy -= dt * 0.4f;
            }

            Vitals.Health = Mathf.Clamp(Vitals.Health, 0f, 100f);
            Vitals.Energy = Mathf.Clamp(Vitals.Energy, 0f, 100f);
            Vitals.Mood = Mathf.Clamp(Vitals.Mood, 0f, 100f);
        }

        private void UpdateAnimation()
        {
            if (_animator == null) return;

            var stateName = CurrentBehavior switch
            {
                "Idle" => "Idle",
                "Wander" => "Walk",
                "Forage" => "Forage",
                "Flee" => "Run",
                "Rest" => "Rest",
                "Hunt" => "Run",
                "Play" => "Play",
                "Sleep" => "Sleep",
                _ => "Idle"
            };

            _animator.CrossFade(stateName, 0.2f);
        }
    }
}
