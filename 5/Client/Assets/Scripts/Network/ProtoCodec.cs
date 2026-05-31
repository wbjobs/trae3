using System;
using System.IO;
using System.Text;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client.Network
{
    public static class ProtoCodec
    {
        public static byte[] EncodeMessage(NetworkMessage msg)
        {
            var json = UnityEngine.JsonUtility.ToJson(msg);
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
            msg = UnityEngine.JsonUtility.FromJson<NetworkMessage>(json);
            consumed = 4 + length;
            return true;
        }

        public static T DecodePayload<T>(NetworkMessage msg)
        {
            if (string.IsNullOrEmpty(msg.Payload))
                return default;
            try
            {
                return UnityEngine.JsonUtility.FromJson<T>(msg.Payload);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[ProtoCodec] DecodePayload<{typeof(T).Name}> failed: {ex.Message}");
                return default;
            }
        }

        public static NetworkMessage CreateMessage<T>(MsgType type, T payload)
        {
            return new NetworkMessage
            {
                Type = (int)type,
                Payload = UnityEngine.JsonUtility.ToJson(payload),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Seq = 0
            };
        }

        public static MsgType GetMsgType(NetworkMessage msg)
        {
            return (MsgType)msg.Type;
        }
    }
}
