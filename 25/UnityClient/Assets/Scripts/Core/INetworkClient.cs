
using System;
using PolarShared.Network;

namespace PolarClient.Core
{
    public interface INetworkClient
    {
        bool IsConnected { get; }
        string PlayerId { get; }
        string PlayerName { get; set; }
        string ServerAddress { get; set; }
        int ServerPort { get; set; }

        event Action<NetworkMessage>? OnMessageReceived;
        event Action? OnConnected;
        event Action? OnDisconnected;
        event Action<string>? OnConnectionFailed;
        event Action<int>? OnReconnectAttempt;

        bool Connect();
        void Disconnect();
        bool Reconnect();
        void SendMessage(NetworkMessage message);
        void SendPlayerPosition(UnityEngine.Vector3 position, UnityEngine.Vector3 rotation);
        void SendPlayerState(float health, float warmth, float energy);
        void RequestSync();
        void SendMissionUpdate(string missionId, float progress);
    }
}
