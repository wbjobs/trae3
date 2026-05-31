using System;
using System.Collections.Generic;
using UnityEngine;

namespace Client.CharacterEco
{
    public interface IBehaviorNode
    {
        BehaviorStatus Execute(CreatureBase creature, float deltaTime);
        void Reset();
    }

    public enum BehaviorStatus
    {
        Running,
        Success,
        Failure
    }

    public class BehaviorSelector : IBehaviorNode
    {
        private readonly List<IBehaviorNode> _children = new List<IBehaviorNode>();
        private int _current;

        public BehaviorSelector(params IBehaviorNode[] children)
        {
            _children.AddRange(children);
        }

        public BehaviorStatus Execute(CreatureBase creature, float deltaTime)
        {
            while (_current < _children.Count)
            {
                var status = _children[_current].Execute(creature, deltaTime);
                if (status != BehaviorStatus.Failure)
                    return status;
                _current++;
            }
            return BehaviorStatus.Failure;
        }

        public void Reset()
        {
            _current = 0;
            foreach (var child in _children)
                child.Reset();
        }
    }

    public class BehaviorSequence : IBehaviorNode
    {
        private readonly List<IBehaviorNode> _children = new List<IBehaviorNode>();
        private int _current;

        public BehaviorSequence(params IBehaviorNode[] children)
        {
            _children.AddRange(children);
        }

        public BehaviorStatus Execute(CreatureBase creature, float deltaTime)
        {
            while (_current < _children.Count)
            {
                var status = _children[_current].Execute(creature, deltaTime);
                if (status != BehaviorStatus.Success)
                    return status;
                _current++;
            }
            return BehaviorStatus.Success;
        }

        public void Reset()
        {
            _current = 0;
            foreach (var child in _children)
                child.Reset();
        }
    }

    public class ConditionNode : IBehaviorNode
    {
        private readonly Func<CreatureBase, bool> _condition;

        public ConditionNode(Func<CreatureBase, bool> condition)
        {
            _condition = condition;
        }

        public BehaviorStatus Execute(CreatureBase creature, float deltaTime)
        {
            return _condition(creature) ? BehaviorStatus.Success : BehaviorStatus.Failure;
        }

        public void Reset() { }
    }

    public class ActionNode : IBehaviorNode
    {
        private readonly Func<CreatureBase, float, BehaviorStatus> _action;

        public ActionNode(Func<CreatureBase, float, BehaviorStatus> action)
        {
            _action = action;
        }

        public BehaviorStatus Execute(CreatureBase creature, float deltaTime)
        {
            return _action(creature, deltaTime);
        }

        public void Reset() { }
    }

    public class EcoBehaviorTree
    {
        private IBehaviorNode _root;
        private BehaviorStatus _lastStatus = BehaviorStatus.Success;
        private float _executionTime;
        private const float MaxBehaviorTime = 10f;

        public void BuildDefaultTree()
        {
            _root = new BehaviorSelector(
                new BehaviorSequence(
                    new ConditionNode(c => c.Vitals.Health < 20f && c.LastThreatPosition != Vector3.zero),
                    new ActionNode((c, dt) => ExecuteFlee(c, dt))
                ),
                new BehaviorSequence(
                    new ConditionNode(c => c.Vitals.Energy < 15f),
                    new ActionNode((c, dt) => ExecuteRest(c, dt))
                ),
                new BehaviorSequence(
                    new ConditionNode(c => c.Vitals.Hunger > 70f),
                    new BehaviorSelector(
                        new BehaviorSequence(
                            new ConditionNode(c => c.Profile.Diet == "Carnivore" || c.Profile.Diet == "Omnivore"),
                            new ActionNode((c, dt) => ExecuteHunt(c, dt))
                        ),
                        new ActionNode((c, dt) => ExecuteForage(c, dt))
                    )
                ),
                new BehaviorSequence(
                    new ConditionNode(c => c.Vitals.Mood > 60f && c.Profile.Personality.Playfulness > 0.5f),
                    new ActionNode((c, dt) => ExecutePlay(c, dt))
                ),
                new BehaviorSequence(
                    new ConditionNode(c => c.Profile.Personality.Curiosity > 0.5f && UnityEngine.Random.value < 0.3f),
                    new ActionNode((c, dt) => ExecuteWander(c, dt))
                ),
                new ActionNode((c, dt) => ExecuteIdle(c, dt))
            );
        }

        public void Tick(CreatureBase creature, float deltaTime)
        {
            if (_lastStatus != BehaviorStatus.Running)
            {
                _root?.Reset();
                _executionTime = 0f;
            }

            _executionTime += deltaTime;

            if (_executionTime > MaxBehaviorTime)
            {
                _lastStatus = BehaviorStatus.Success;
                return;
            }

            _lastStatus = _root?.Execute(creature, deltaTime) ?? BehaviorStatus.Failure;
        }

        private static BehaviorStatus ExecuteFlee(CreatureBase c, float dt)
        {
            c.SetBehavior("Flee");

            var dir = (c.transform.position - c.LastThreatPosition);
            dir.y = 0;
            if (dir.sqrMagnitude < 0.01f)
                dir = new Vector3(UnityEngine.Random.Range(-1f, 1f), 0, UnityEngine.Random.Range(-1f, 1f)).normalized;
            else
                dir.Normalize();

            c.MoveToward(c.transform.position + dir * 5f, c.Profile.FleeSpeed, dt);
            return c.Vitals.Health > 40f ? BehaviorStatus.Success : BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecuteRest(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Rest");
            return creature.Vitals.Energy > 60f ? BehaviorStatus.Success : BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecuteHunt(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Hunt");
            if (creature.NearestPrey != null)
            {
                creature.MoveToward(creature.NearestPrey.position, creature.Profile.BaseSpeed * 1.2f, dt);
                var dist = Vector3.Distance(creature.transform.position, creature.NearestPrey.position);
                if (dist < 2f)
                    return BehaviorStatus.Success;
            }
            else
            {
                if (creature._wanderTarget == Vector3.zero)
                    creature._wanderTarget = creature.GetRandomWanderPoint();
                creature.MoveToward(creature._wanderTarget, creature.Profile.BaseSpeed, dt);
                if (Vector3.Distance(creature.transform.position, creature._wanderTarget) < 1f)
                {
                    creature._wanderTarget = Vector3.zero;
                    return BehaviorStatus.Success;
                }
            }
            return BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecuteForage(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Forage");
            if (creature._wanderTarget == Vector3.zero)
                creature._wanderTarget = creature.GetRandomWanderPoint();
            creature.MoveToward(creature._wanderTarget, creature.Profile.BaseSpeed * 0.5f, dt);
            if (Vector3.Distance(creature.transform.position, creature._wanderTarget) < 1f)
            {
                creature._wanderTarget = Vector3.zero;
                return BehaviorStatus.Success;
            }
            return BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecutePlay(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Play");
            var target = creature._wanderTarget == Vector3.zero
                ? creature.GetRandomWanderPoint()
                : creature._wanderTarget;
            creature._wanderTarget = target;
            creature.MoveToward(target, creature.Profile.BaseSpeed * 0.8f, dt);
            if (Vector3.Distance(creature.transform.position, target) < 1f)
            {
                creature._wanderTarget = Vector3.zero;
                return BehaviorStatus.Success;
            }
            return BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecuteWander(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Wander");
            if (creature._wanderTarget == Vector3.zero)
                creature._wanderTarget = creature.GetRandomWanderPoint();
            creature.MoveToward(creature._wanderTarget, creature.Profile.BaseSpeed, dt);
            if (Vector3.Distance(creature.transform.position, creature._wanderTarget) < 1f)
            {
                creature._wanderTarget = Vector3.zero;
                return BehaviorStatus.Success;
            }
            return BehaviorStatus.Running;
        }

        private static BehaviorStatus ExecuteIdle(CreatureBase creature, float dt)
        {
            creature.SetBehavior("Idle");
            return BehaviorStatus.Success;
        }
    }
}
