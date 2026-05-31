
namespace PolarShared.Enums;

public enum MessageType
{
    PlayerJoin,
    PlayerLeave,
    PlayerPosition,
    PlayerState,
    EnvironmentUpdate,
    WeatherUpdate,
    MissionUpdate,
    MissionComplete,
    ChatMessage,
    ServerStatus,
    Handshake,
    SyncRequest,
    SyncResponse,
    Heartbeat,
    HeartbeatAck,
    BatchUpdate,
    PositionDelta,
    StateDelta,
    EnvironmentDelta,
    MissionDelta,
    DiscreteEvent
}

public enum DisasterType
{
    None,
    IceCrack,
    Avalanche,
    PolarStorm,
    Blizzard,
    Whiteout,
    IceQuake
}

public enum DisasterSeverity
{
    Mild,
    Moderate,
    Severe,
    Critical
}
