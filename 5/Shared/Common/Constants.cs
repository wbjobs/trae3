namespace Shared.Common
{
    public static class Constants
    {
        public const int DefaultPort = 9800;
        public const string DefaultHost = "127.0.0.1";
        public const int MaxConnections = 100;
        public const int BufferSize = 8192;
        public const int HeartbeatIntervalMs = 5000;
        public const int HeartbeatTimeoutMs = 15000;
        public const int SyncTickIntervalMs = 50;
        public const int MaxMessageSize = 65536;
        public const float DayCycleSeconds = 600f;
        public const int EcoSimTickMs = 1000;
        public const string ArchiveDirectory = "Archives";
        public const string ArchiveExtension = ".sav";
        public const string Version = "1.0.0";
    }
}
