
using PolarShared.Enums;

namespace PolarShared.Models;

[Serializable]
public class ResearchMission
{
    public string MissionId { get; set; }
    public string Title { get; set; }
    public string Description { get; set; }
    public MissionStatus Status { get; set; }
    public List<string> AssignedPlayers { get; set; }
    public Vector3 TargetLocation { get; set; }
    public int RewardPoints { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public float Progress { get; set; }

    public ResearchMission()
    {
        MissionId = string.Empty;
        Title = string.Empty;
        Description = string.Empty;
        Status = MissionStatus.NotStarted;
        AssignedPlayers = new List<string>();
        TargetLocation = Vector3.Zero;
        RewardPoints = 0;
        CreatedAt = DateTime.Now;
        CompletedAt = null;
        Progress = 0.0f;
    }
}
