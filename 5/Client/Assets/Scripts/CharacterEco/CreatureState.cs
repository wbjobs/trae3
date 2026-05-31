using System;
using System.Collections.Generic;

namespace Client.CharacterEco
{
    public enum CreatureBehavior
    {
        Idle,
        Wander,
        Forage,
        Flee,
        Rest,
        Hunt,
        Play,
        Sleep
    }

    [Serializable]
    public class CreatureVitals
    {
        public float Health;
        public float Energy;
        public float Hunger;
        public float Mood;
    }

    [Serializable]
    public class CreaturePersonality
    {
        public float Aggression;
        public float Curiosity;
        public float Sociability;
        public float Timidity;
        public float Playfulness;
    }

    public static class SpeciesRegistry
    {
        private static readonly Dictionary<string, SpeciesProfile> _profiles = new Dictionary<string, SpeciesProfile>
        {
            ["SpiritDeer"] = new SpeciesProfile
            {
                DisplayName = "灵鹿",
                BaseSpeed = 3f,
                FleeSpeed = 7f,
                Diet = "Herbivore",
                Personality = new CreaturePersonality
                {
                    Aggression = 0.1f, Curiosity = 0.6f, Sociability = 0.7f, Timidity = 0.8f, Playfulness = 0.5f
                }
            },
            ["MistWolf"] = new SpeciesProfile
            {
                DisplayName = "雾狼",
                BaseSpeed = 4f,
                FleeSpeed = 6f,
                Diet = "Carnivore",
                Personality = new CreaturePersonality
                {
                    Aggression = 0.7f, Curiosity = 0.4f, Sociability = 0.6f, Timidity = 0.2f, Playfulness = 0.3f
                }
            },
            ["CrystalButterfly"] = new SpeciesProfile
            {
                DisplayName = "晶蝶",
                BaseSpeed = 2f,
                FleeSpeed = 5f,
                Diet = "Nectar",
                Personality = new CreaturePersonality
                {
                    Aggression = 0.0f, Curiosity = 0.9f, Sociability = 0.3f, Timidity = 0.5f, Playfulness = 0.8f
                }
            },
            ["ShadowRabbit"] = new SpeciesProfile
            {
                DisplayName = "影兔",
                BaseSpeed = 5f,
                FleeSpeed = 9f,
                Diet = "Herbivore",
                Personality = new CreaturePersonality
                {
                    Aggression = 0.05f, Curiosity = 0.5f, Sociability = 0.4f, Timidity = 0.9f, Playfulness = 0.7f
                }
            },
            ["FlameFox"] = new SpeciesProfile
            {
                DisplayName = "焰狐",
                BaseSpeed = 3.5f,
                FleeSpeed = 6.5f,
                Diet = "Omnivore",
                Personality = new CreaturePersonality
                {
                    Aggression = 0.4f, Curiosity = 0.8f, Sociability = 0.5f, Timidity = 0.3f, Playfulness = 0.9f
                }
            }
        };

        public static SpeciesProfile GetProfile(string speciesId)
        {
            return _profiles.TryGetValue(speciesId, out var profile) ? profile : _profiles["SpiritDeer"];
        }

        public static IEnumerable<string> GetAllSpeciesIds() => _profiles.Keys;
    }

    [Serializable]
    public class SpeciesProfile
    {
        public string DisplayName;
        public float BaseSpeed;
        public float FleeSpeed;
        public string Diet;
        public CreaturePersonality Personality;
    }
}
