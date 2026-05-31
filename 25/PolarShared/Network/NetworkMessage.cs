
using PolarShared.Enums;

namespace PolarShared.Network;

[Serializable]
public class NetworkMessage
{
    public MessageType Type { get; set; }
    public string SenderId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Payload { get; set; }

    public NetworkMessage()
    {
        Type = MessageType.ServerStatus;
        SenderId = string.Empty;
        Timestamp = DateTime.Now;
        Payload = string.Empty;
    }

    public NetworkMessage(MessageType type, string senderId, string payload)
    {
        Type = type;
        SenderId = senderId;
        Timestamp = DateTime.Now;
        Payload = payload;
    }
}
