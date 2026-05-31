
namespace PolarShared.Models;

[Serializable]
public class PlayerState
{
    public string PlayerId { get; set; }
    public string PlayerName { get; set; }
    public Vector3 Position { get; set; }
    public Vector3 Rotation { get; set; }
    public float Health { get; set; }
    public float Warmth { get; set; }
    public float Energy { get; set; }
    public bool IsOnline { get; set; }
    public DateTime LastUpdate { get; set; }

    public PlayerState()
    {
        PlayerId = string.Empty;
        PlayerName = string.Empty;
        Position = Vector3.Zero;
        Rotation = Vector3.Zero;
        Health = 100.0f;
        Warmth = 100.0f;
        Energy = 100.0f;
        IsOnline = true;
        LastUpdate = DateTime.Now;
    }
}
