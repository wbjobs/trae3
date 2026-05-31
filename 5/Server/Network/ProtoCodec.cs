using System;
using System.IO;
using System.Text;
using System.Text.Json;
using Shared.Common;
using Shared.Proto;

namespace Server.Network
{
    public static class ProtoCodec
    {
        private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = null,
            Converters = { new DictionaryStringStringConverter() }
        };

        public static byte[] EncodeMessage(NetworkMessage msg)
        {
            var json = JsonSerializer.Serialize(msg, JsonOpts);
            var payloadBytes = Encoding.UTF8.GetBytes(json);

            if (payloadBytes.Length > Constants.MaxMessageSize)
                throw new InvalidOperationException($"Message size {payloadBytes.Length} exceeds max {Constants.MaxMessageSize}");

            var result = new byte[4 + payloadBytes.Length];
            result[0] = (byte)(payloadBytes.Length >> 24);
            result[1] = (byte)(payloadBytes.Length >> 16);
            result[2] = (byte)(payloadBytes.Length >> 8);
            result[3] = (byte)(payloadBytes.Length);
            Buffer.BlockCopy(payloadBytes, 0, result, 4, payloadBytes.Length);
            return result;
        }

        public static bool TryDecodeMessage(byte[] data, int offset, int count, out NetworkMessage msg, out int consumed)
        {
            msg = null;
            consumed = 0;

            if (count < 4)
                return false;

            int length = ((int)data[offset] << 24) | ((int)data[offset + 1] << 16) | ((int)data[offset + 2] << 8) | (int)data[offset + 3];

            if (length < 0 || length > Constants.MaxMessageSize)
                throw new InvalidDataException($"Invalid message length: {length}");

            if (count < 4 + length)
                return false;

            var json = Encoding.UTF8.GetString(data, offset + 4, length);
            msg = JsonSerializer.Deserialize<NetworkMessage>(json, JsonOpts);
            consumed = 4 + length;
            return true;
        }

        public static T DecodePayload<T>(NetworkMessage msg)
        {
            if (string.IsNullOrEmpty(msg.Payload))
                return default;
            return JsonSerializer.Deserialize<T>(msg.Payload, JsonOpts);
        }

        public static NetworkMessage CreateMessage<T>(MsgType type, T payload)
        {
            return new NetworkMessage
            {
                Type = type,
                Payload = JsonSerializer.Serialize(payload, JsonOpts),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Seq = 0
            };
        }
    }

    public class DictionaryStringStringConverter : System.Text.Json.Serialization.JsonConverter<Dictionary<string, string>>
    {
        public override Dictionary<string, string> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null)
                return new Dictionary<string, string>();

            var dict = new Dictionary<string, string>();
            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndObject)
                    return dict;
                if (reader.TokenType != JsonTokenType.PropertyName)
                    continue;
                var key = reader.GetString();
                reader.Read();
                var value = reader.TokenType == JsonTokenType.Null ? "" : reader.GetString();
                dict[key] = value ?? "";
            }
            return dict;
        }

        public override void Write(Utf8JsonWriter writer, Dictionary<string, string> value, JsonSerializerOptions options)
        {
            if (value == null)
            {
                writer.WriteNullValue();
                return;
            }
            writer.WriteStartObject();
            foreach (var kvp in value)
            {
                writer.WriteString(kvp.Key, kvp.Value);
            }
            writer.WriteEndObject();
        }
    }
}
