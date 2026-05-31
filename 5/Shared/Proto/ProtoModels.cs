using System;
using System.Collections.Generic;

namespace Shared.Proto
{
    [Serializable]
    public class Vec3
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Z { get; set; }

        public Vec3() { }

        public Vec3(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }
    }

    [Serializable]
    public class KVPair
    {
        public string K { get; set; }
        public string V { get; set; }

        public KVPair() { }

        public KVPair(string k, string v)
        {
            K = k;
            V = v;
        }
    }

    [Serializable]
    public class EntitySyncData
    {
        public string EntityId { get; set; }
        public string EntityType { get; set; }
        public string SpeciesId { get; set; }
        public Vec3 Position { get; set; }
        public Vec3 Rotation { get; set; }
        public Vec3 Velocity { get; set; }
        public string CurrentBehavior { get; set; }
        public float Health { get; set; }
        public float Energy { get; set; }
        public List<KVPair> ExtraState { get; set; } = new List<KVPair>();
        public long Timestamp { get; set; }
    }

    [Flags]
    public enum EntityFieldMask : ushort
    {
        None        = 0,
        Position    = 1 << 0,
        Rotation    = 1 << 1,
        Velocity    = 1 << 2,
        Behavior    = 1 << 3,
        Health      = 1 << 4,
        Energy      = 1 << 5,
        ExtraState  = 1 << 6
    }

    [Serializable]
    public class EntityDeltaSyncData
    {
        public string EntityId { get; set; }
        public ushort FieldMask { get; set; }
        public Vec3 Position { get; set; }
        public Vec3 Rotation { get; set; }
        public Vec3 Velocity { get; set; }
        public string CurrentBehavior { get; set; }
        public float? Health { get; set; }
        public float? Energy { get; set; }
        public List<KVPair> ExtraState { get; set; }
        public long Timestamp { get; set; }

        public bool HasField(EntityFieldMask mask)
        {
            return (FieldMask & (ushort)mask) != 0;
        }
    }

    [Serializable]
    public class EntityDeltaBatchPayload
    {
        public List<EntityDeltaSyncData> Deltas { get; set; } = new List<EntityDeltaSyncData>();
        public bool IsCompressed { get; set; }
    }

    [Serializable]
    public class EntityBatchSyncPayload
    {
        public List<EntitySyncData> Entities { get; set; } = new List<EntitySyncData>();
    }

    [Serializable]
    public class EntitySpawnPayload
    {
        public EntitySyncData EntityData { get; set; }
    }

    [Serializable]
    public class EntityDespawnPayload
    {
        public string EntityId { get; set; }
    }

    [Serializable]
    public class EntityInteractionPayload
    {
        public string InitiatorId { get; set; }
        public string TargetId { get; set; }
        public string InteractionType { get; set; }
        public List<KVPair> Parameters { get; set; } = new List<KVPair>();
    }

    [Serializable]
    public class SceneStateData
    {
        public string SceneId { get; set; }
        public float TimeOfDay { get; set; }
        public string WeatherType { get; set; }
        public float Temperature { get; set; }
        public float Humidity { get; set; }
        public List<KVPair> EnvironmentVars { get; set; } = new List<KVPair>();
    }

    [Serializable]
    public class HandshakePayload
    {
        public string ClientId { get; set; }
        public string ClientVersion { get; set; }
        public string PlayerName { get; set; }
    }

    [Serializable]
    public class HandshakeAckPayload
    {
        public string SessionId { get; set; }
        public bool Success { get; set; }
        public string ErrorMessage { get; set; }
        public SceneStateData SceneState { get; set; }
    }

    [Serializable]
    public class ArchiveSavePayload
    {
        public string ArchiveName { get; set; }
        public string ClientId { get; set; }
        public string SceneId { get; set; }
        public List<KVPair> GlobalState { get; set; } = new List<KVPair>();
        public List<EntitySyncData> Entities { get; set; } = new List<EntitySyncData>();
        public SceneStateData SceneState { get; set; }
    }

    [Serializable]
    public class ArchiveSaveResultPayload
    {
        public bool Success { get; set; }
        public string ArchiveName { get; set; }
        public string ErrorMessage { get; set; }
    }

    [Serializable]
    public class ArchiveLoadPayload
    {
        public string ArchiveName { get; set; }
        public string ClientId { get; set; }
    }

    [Serializable]
    public class ArchiveLoadResultPayload
    {
        public bool Success { get; set; }
        public string ArchiveName { get; set; }
        public string ErrorMessage { get; set; }
        public ArchiveSavePayload Data { get; set; }
    }

    [Serializable]
    public class ArchiveListPayload
    {
        public string ClientId { get; set; }
    }

    [Serializable]
    public class ArchiveListResultPayload
    {
        public bool Success { get; set; }
        public List<string> ArchiveNames { get; set; } = new List<string>();
    }

    public enum WeatherType
    {
        Clear = 0,
        Cloudy = 1,
        Rainy = 2,
        Foggy = 3,
        Stormy = 4
    }

    [Serializable]
    public class WeatherUpdatePayload
    {
        public WeatherType TargetWeather { get; set; }
        public float TransitionDuration { get; set; }
        public float Intensity { get; set; }
        public long TransitionStart { get; set; }
    }

    [Serializable]
    public class BatchMessagePayload
    {
        public List<NetworkMessage> Messages { get; set; } = new List<NetworkMessage>();
        public bool IsCompressed { get; set; }
    }

    [Serializable]
    public class NetworkMessage
    {
        public int Type { get; set; }
        public string Payload { get; set; }
        public long Timestamp { get; set; }
        public uint Seq { get; set; }
    }

    public static class ProtoExtensions
    {
        public static List<KVPair> ToKVList(this Dictionary<string, string> dict)
        {
            if (dict == null) return new List<KVPair>();
            var list = new List<KVPair>(dict.Count);
            foreach (var kvp in dict)
                list.Add(new KVPair(kvp.Key, kvp.Value));
            return list;
        }

        public static Dictionary<string, string> ToDictionary(this List<KVPair> list)
        {
            if (list == null) return new Dictionary<string, string>();
            var dict = new Dictionary<string, string>(list.Count);
            foreach (var kv in list)
                if (kv.K != null)
                    dict[kv.K] = kv.V ?? "";
            return dict;
        }
    }
}
