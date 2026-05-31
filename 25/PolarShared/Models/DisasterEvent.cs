
using System;
using PolarShared.Enums;

namespace PolarShared.Models
{
    [Serializable]
    public class DisasterEvent
    {
        public DisasterType Type { get; set; }
        public DisasterSeverity Severity { get; set; }
        public Vector3 Position { get; set; }
        public float Radius { get; set; }
        public float Duration { get; set; }
        public long StartTime { get; set; }
        public long EndTime { get; set; }
        public string Description { get; set; }
        public float DamagePerSecond { get; set; }

        public DisasterEvent()
        {
            Position = new Vector3();
            Description = string.Empty;
        }

        public bool IsActive(long currentTime)
        {
            return currentTime >= StartTime && currentTime <= EndTime;
        }

        public float GetProgress(long currentTime)
        {
            if (Duration <= 0) return 1f;
            return (float)(currentTime - StartTime) / Duration;
        }

        public float GetIntensity(long currentTime)
        {
            var progress = GetProgress(currentTime);
            var baseIntensity = Severity switch
            {
                DisasterSeverity.Mild => 0.3f,
                DisasterSeverity.Moderate => 0.6f,
                DisasterSeverity.Severe => 0.9f,
                DisasterSeverity.Critical => 1.0f,
                _ => 0.5f
            };

            var curve = 1f - Math.Abs(progress - 0.5f) * 2f;
            return baseIntensity * curve;
        }
    }

    [Serializable]
    public class DiscreteEventData
    {
        public int EventType { get; set; }
        public DisasterEvent? Disaster { get; set; }
        public string Message { get; set; }
        public long Timestamp { get; set; }

        public DiscreteEventData()
        {
            Message = string.Empty;
            Timestamp = DateTime.UtcNow.Ticks;
        }
    }
}
