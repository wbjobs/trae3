
using System.Text;
using Newtonsoft.Json;

namespace PolarShared.Network;

public static class MessageSerializer
{
    private static readonly JsonSerializerSettings _settings = new JsonSerializerSettings
    {
        TypeNameHandling = TypeNameHandling.Auto,
        Formatting = Formatting.None,
        NullValueHandling = NullValueHandling.Ignore
    };

    public static byte[] Serialize(NetworkMessage message, bool useCompression = true)
    {
        var json = JsonConvert.SerializeObject(message, _settings);
        var data = Encoding.UTF8.GetBytes(json);
        return useCompression ? CompressionHelper.Compress(data) : data;
    }

    public static NetworkMessage? Deserialize(byte[] data)
    {
        try
        {
            var decompressed = CompressionHelper.Decompress(data);
            var json = Encoding.UTF8.GetString(decompressed);
            return JsonConvert.DeserializeObject<NetworkMessage>(json, _settings);
        }
        catch
        {
            return null;
        }
    }

    public static T? DeserializePayload<T>(string payload)
    {
        try
        {
            return JsonConvert.DeserializeObject<T>(payload, _settings);
        }
        catch
        {
            return default;
        }
    }

    public static string SerializePayload(object payload)
    {
        return JsonConvert.SerializeObject(payload, _settings);
    }

    public static byte[] SerializeToBytes(object obj)
    {
        var json = JsonConvert.SerializeObject(obj, _settings);
        return Encoding.UTF8.GetBytes(json);
    }

    public static T? DeserializeFromBytes<T>(byte[] data)
    {
        try
        {
            var json = Encoding.UTF8.GetString(data);
            return JsonConvert.DeserializeObject<T>(json, _settings);
        }
        catch
        {
            return default;
        }
    }
}
