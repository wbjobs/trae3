using System;
using System.Collections.Generic;
using UnityEngine;

namespace Client.CharacterEco
{
    public class EcoInteractions : MonoBehaviour
    {
        [SerializeField] private float _interactionRadius = 5f;
        [SerializeField] private LayerMask _creatureLayer;

        public event Action<string, string, string> OnInteractionTriggered;

        public List<CreatureBase> FindNearbyCreatures(Vector3 center, float radius = 0f)
        {
            var r = radius > 0 ? radius : _interactionRadius;
            var colliders = Physics.OverlapSphere(center, r, _creatureLayer);
            var result = new List<CreatureBase>();

            foreach (var col in colliders)
            {
                var creature = col.GetComponent<CreatureBase>();
                if (creature != null)
                    result.Add(creature);
            }

            return result;
        }

        public CreatureBase FindNearestCreature(Vector3 center, float radius = 0f)
        {
            var nearby = FindNearbyCreatures(center, radius);
            CreatureBase nearest = null;
            float minDist = float.MaxValue;

            foreach (var creature in nearby)
            {
                var dist = Vector3.Distance(center, creature.transform.position);
                if (dist < minDist)
                {
                    minDist = dist;
                    nearest = creature;
                }
            }

            return nearest;
        }

        public void TriggerInteraction(string initiatorId, string targetId, string interactionType)
        {
            OnInteractionTriggered?.Invoke(initiatorId, targetId, interactionType);
        }

        public static string DetermineAutoInteraction(CreatureBase initiator, CreatureBase target)
        {
            if (initiator == null || target == null) return null;

            var initProfile = initiator.Profile;
            var targetProfile = target.Profile;

            if (initProfile.Diet == "Carnivore" && (targetProfile.Diet == "Herbivore" || targetProfile.Diet == "Nectar"))
                return "Hunt";

            if (initProfile.Personality.Sociability > 0.6f && targetProfile.Personality.Sociability > 0.6f)
                return "Play";

            if (initProfile.Personality.Aggression > 0.6f && targetProfile.Personality.Timidity > 0.6f)
                return "Scare";

            if (initProfile.Personality.Curiosity > 0.7f && targetProfile.Personality.Playfulness > 0.5f)
                return "Play";

            return null;
        }

        public void ProcessAutoInteractions(List<CreatureBase> allCreatures)
        {
            for (int i = 0; i < allCreatures.Count; i++)
            {
                for (int j = i + 1; j < allCreatures.Count; j++)
                {
                    var a = allCreatures[i];
                    var b = allCreatures[j];

                    var dist = Vector3.Distance(a.transform.position, b.transform.position);
                    if (dist > _interactionRadius) continue;

                    if (UnityEngine.Random.value > 0.01f) continue;

                    var interaction = DetermineAutoInteraction(a, b);
                    if (interaction != null)
                    {
                        TriggerInteraction(a.EntityId, b.EntityId, interaction);
                        a.OnReceiveInteraction(b.EntityId, interaction);
                        b.OnReceiveInteraction(a.EntityId, interaction);
                    }
                }
            }
        }
    }
}
