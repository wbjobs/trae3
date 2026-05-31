
using System;

namespace PolarShared.Models
{
    [Serializable]
    public class PlayerPositionDelta
    {
        public string PlayerId { get; set; }
        public float? DeltaX { get; set; }
        public float? DeltaY { get; set; }
        public float? DeltaZ { get; set; }
        public float? DeltaRotY { get; set; }
        public long Timestamp { get; set; }

        public PlayerPositionDelta()
        {
            PlayerId = string.Empty;
        }

        public bool HasChanges => DeltaX.HasValue || DeltaY.HasValue || DeltaZ.HasValue || DeltaRotY.HasValue;
    }

    [Serializable]
    public class PlayerStateDelta
    {
        public string PlayerId { get; set; }
        public float? HealthDelta { get; set; }
        public float? WarmthDelta { get; set; }
        public float? EnergyDelta { get; set; }
        public long Timestamp { get; set; }

        public PlayerStateDelta()
        {
            PlayerId = string.Empty;
        }

        public bool HasChanges => HealthDelta.HasValue || WarmthDelta.HasValue || EnergyDelta.HasValue;
    }

    [Serializable]
    public class EnvironmentDelta
    {
        public float? TemperatureDelta { get; set; }
        public float? WindSpeedDelta { get; set; }
        public float? SnowIntensityDelta { get; set; }
        public float? VisibilityDelta { get; set; }
        public int? WeatherType { get; set; }
        public long Timestamp { get; set; }

        public bool HasChanges => TemperatureDelta.HasValue || WindSpeedDelta.HasValue ||
                                   SnowIntensityDelta.HasValue || VisibilityDelta.HasValue ||
                                   WeatherType.HasValue;
    }

    [Serializable]
    public class MissionDelta
    {
        public string MissionId { get; set; }
        public float? ProgressDelta { get; set; }
        public int? Status { get; set; }
        public long Timestamp { get; set; }

        public MissionDelta()
        {
            MissionId = string.Empty;
        }

        public bool HasChanges => ProgressDelta.HasValue || Status.HasValue;
    }

    [Serializable]
    public class BatchMessage
    {
        public List<PlayerPositionDelta> PositionDeltas { get; set; }
        public List<PlayerStateDelta> StateDeltas { get; set; }
        public EnvironmentDelta? EnvironmentDelta { get; set; }
        public List<MissionDelta> MissionDeltas { get; set; }
        public long Timestamp { get; set; }

        public BatchMessage()
        {
            PositionDeltas = new List<PlayerPositionDelta>();
            StateDeltas = new List<PlayerStateDelta>();
            MissionDeltas = new List<MissionDelta>();
            Timestamp = DateTime.UtcNow.Ticks;
        }

        public bool HasChanges => PositionDeltas.Count > 0 || StateDeltas.Count > 0 ||
                                   EnvironmentDelta?.HasChanges == true || MissionDeltas.Count > 0;
    }
}
