namespace Shared.Proto
{
    public enum MsgType : ushort
    {
        None = 0,

        ClientHandshake = 1001,
        ServerHandshakeAck = 1002,
        Heartbeat = 1003,
        HeartbeatAck = 1004,
        ClientDisconnect = 1005,
        BatchMessage = 1006,

        EntitySync = 2001,
        EntityBatchSync = 2002,
        EntityDeltaBatchSync = 2007,
        EntitySpawn = 2003,
        EntityDespawn = 2004,
        EntityInteraction = 2005,

        SceneStateSync = 3001,
        EnvironmentUpdate = 3002,
        TimeOfDaySync = 3003,
        WeatherUpdate = 3004,

        ArchiveSaveRequest = 4001,
        ArchiveSaveResponse = 4002,
        ArchiveLoadRequest = 4003,
        ArchiveLoadResponse = 4004,
        ArchiveListRequest = 4005,
        ArchiveListResponse = 4006,
    }
}
