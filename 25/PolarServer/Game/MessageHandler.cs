
using PolarShared.Enums;
using PolarShared.Models;
using PolarShared.Network;
using PolarServer.Network;

namespace PolarServer.Game;

public class MessageHandler
{
    private readonly TcpServer _tcpServer;
    private readonly GameStateManager _stateManager;
    private readonly NetworkOptimizer _networkOptimizer;
    private readonly DisasterSystem _disasterSystem;

    public MessageHandler(TcpServer tcpServer, GameStateManager stateManager,
        NetworkOptimizer networkOptimizer, DisasterSystem disasterSystem)
    {
        _tcpServer = tcpServer;
        _stateManager = stateManager;
        _networkOptimizer = networkOptimizer;
        _disasterSystem = disasterSystem;
    }

    public void HandleMessage(string clientId, NetworkMessage message)
    {
        switch (message.Type)
        {
            case MessageType.Handshake:
                HandleHandshake(clientId, message);
                break;
            case MessageType.PlayerPosition:
                HandlePlayerPosition(clientId, message);
                break;
            case MessageType.PlayerState:
                HandlePlayerState(clientId, message);
                break;
            case MessageType.SyncRequest:
                HandleSyncRequest(clientId);
                break;
            case MessageType.MissionUpdate:
                HandleMissionUpdate(clientId, message);
                break;
            case MessageType.ChatMessage:
                HandleChatMessage(clientId, message);
                break;
            case MessageType.Heartbeat:
                HandleHeartbeat(clientId);
                break;
            case MessageType.BatchUpdate:
            case MessageType.PositionDelta:
            case MessageType.StateDelta:
            case MessageType.EnvironmentDelta:
            case MessageType.MissionDelta:
                BroadcastDelta(clientId, message);
                break;
        }
    }

    private void HandleHandshake(string clientId, NetworkMessage message)
    {
        var playerName = message.Payload;
        var player = _stateManager.AddPlayer(clientId, playerName);

        Console.WriteLine($"[MessageHandler] 玩家加入: {playerName} ({clientId})");

        var handshakeResponse = new NetworkMessage(
            MessageType.Handshake,
            "server",
            MessageSerializer.SerializePayload(player)
        );
        _tcpServer.SendToClient(clientId, handshakeResponse);

        var playerJoinMsg = new NetworkMessage(
            MessageType.PlayerJoin,
            "server",
            MessageSerializer.SerializePayload(player)
        );
        _tcpServer.Broadcast(playerJoinMsg, clientId);
    }

    private void HandlePlayerPosition(string clientId, NetworkMessage message)
    {
        var positionData = MessageSerializer.DeserializePayload<PositionUpdateData>(message.Payload);
        if (positionData != null)
        {
            _stateManager.UpdatePlayerPosition(
                clientId,
                positionData.Position,
                positionData.Rotation
            );

            var delta = _networkOptimizer.TrackPlayerPosition(
                clientId, positionData.Position, positionData.Rotation.Y, message.Timestamp);

            if (delta != null)
            {
                var deltaMsg = new NetworkMessage(
                    MessageType.PositionDelta,
                    clientId,
                    MessageSerializer.SerializePayload(delta),
                    message.Timestamp
                );
                _tcpServer.Broadcast(deltaMsg, clientId);
            }
        }
    }

    private void HandlePlayerState(string clientId, NetworkMessage message)
    {
        var stateData = MessageSerializer.DeserializePayload<PlayerStateUpdateData>(message.Payload);
        if (stateData != null)
        {
            _stateManager.UpdatePlayerState(
                clientId,
                stateData.Health,
                stateData.Warmth,
                stateData.Energy
            );

            var player = _stateManager.GetPlayer(clientId);
            if (player != null)
            {
                var delta = _networkOptimizer.TrackPlayerState(
                    clientId, player, message.Timestamp);

                if (delta != null)
                {
                    var deltaMsg = new NetworkMessage(
                        MessageType.StateDelta,
                        clientId,
                        MessageSerializer.SerializePayload(delta),
                        message.Timestamp
                    );
                    _tcpServer.Broadcast(deltaMsg, clientId);
                }
            }
        }
    }

    private void HandleHeartbeat(string clientId)
    {
        var ack = new NetworkMessage(
            MessageType.HeartbeatAck,
            "server",
            string.Empty,
            DateTime.UtcNow.Ticks
        );
        _tcpServer.SendToClient(clientId, ack);
    }

    private void BroadcastDelta(string clientId, NetworkMessage message)
    {
        _tcpServer.Broadcast(message, clientId);
    }

    private void HandleSyncRequest(string clientId)
    {
        var syncData = new SyncResponseData
        {
            Players = _stateManager.GetAllPlayers(),
            Environment = _stateManager.GetEnvironment(),
            Missions = _stateManager.GetAllMissions(),
            ActiveDisasters = _disasterSystem.ActiveDisasters
        };

        var response = new NetworkMessage(
            MessageType.SyncResponse,
            "server",
            MessageSerializer.SerializePayload(syncData)
        );
        _tcpServer.SendToClient(clientId, response);

        _networkOptimizer.ResetTracker();
    }

    private void HandleMissionUpdate(string clientId, NetworkMessage message)
    {
        var updateData = MessageSerializer.DeserializePayload<MissionUpdateData>(message.Payload);
        if (updateData != null)
        {
            _stateManager.UpdateMissionProgress(updateData.MissionId, updateData.Progress);
            _stateManager.AssignPlayerToMission(updateData.MissionId, clientId);

            var mission = _stateManager.GetMission(updateData.MissionId);
            if (mission != null)
            {
                var delta = _networkOptimizer.TrackMission(
                    updateData.MissionId, mission.Progress, (int)mission.Status, message.Timestamp);

                if (delta != null)
                {
                    var deltaMsg = new NetworkMessage(
                        MessageType.MissionDelta,
                        clientId,
                        MessageSerializer.SerializePayload(delta),
                        message.Timestamp
                    );
                    _tcpServer.Broadcast(deltaMsg);
                }
            }
        }
    }

    private void HandleChatMessage(string clientId, NetworkMessage message)
    {
        _tcpServer.Broadcast(message);
    }

    public void BroadcastEnvironmentUpdate(EnvironmentParameters env)
    {
        var delta = _networkOptimizer.TrackEnvironment(env, DateTime.UtcNow.Ticks);

        if (delta != null)
        {
            var message = new NetworkMessage(
                MessageType.EnvironmentDelta,
                "server",
                MessageSerializer.SerializePayload(delta),
                DateTime.UtcNow.Ticks
            );
            _tcpServer.Broadcast(message);
        }
        else
        {
            var message = new NetworkMessage(
                MessageType.EnvironmentUpdate,
                "server",
                MessageSerializer.SerializePayload(env)
            );
            _tcpServer.Broadcast(message);
        }
    }

    public void BroadcastMissionUpdate(ResearchMission mission)
    {
        var delta = _networkOptimizer.TrackMission(
            mission.MissionId, mission.Progress, (int)mission.Status, DateTime.UtcNow.Ticks);

        if (delta != null)
        {
            var message = new NetworkMessage(
                MessageType.MissionDelta,
                "server",
                MessageSerializer.SerializePayload(delta),
                DateTime.UtcNow.Ticks
            );
            _tcpServer.Broadcast(message);
        }
        else
        {
            var message = new NetworkMessage(
                MessageType.MissionUpdate,
                "server",
                MessageSerializer.SerializePayload(mission)
            );
            _tcpServer.Broadcast(message);
        }
    }

    public void BroadcastBatchUpdate(BatchMessage batch, List<string> clientIds)
    {
        if (!batch.HasChanges) return;

        var message = new NetworkMessage(
            MessageType.BatchUpdate,
            "server",
            MessageSerializer.SerializePayload(batch),
            batch.Timestamp
        );

        var data = MessageSerializer.Serialize(message);
        _networkOptimizer.UpdateStatistics(data.Length);

        foreach (var clientId in clientIds)
        {
            if (_networkOptimizer.CheckRateLimit(data.Length))
            {
                _tcpServer.SendToClient(clientId, message);
            }
        }
    }

    public void BroadcastDisasterEvent(DisasterEvent disaster)
    {
        var eventData = new DiscreteEventData
        {
            EventType = 0,
            Disaster = disaster,
            Message = disaster.Description,
            Timestamp = disaster.StartTime
        };

        var message = new NetworkMessage(
            MessageType.DiscreteEvent,
            "server",
            MessageSerializer.SerializePayload(eventData),
            disaster.StartTime
        );
        _tcpServer.Broadcast(message);
    }

    public void BroadcastDisasterEnd(DisasterEvent disaster)
    {
        var eventData = new DiscreteEventData
        {
            EventType = 1,
            Disaster = disaster,
            Message = $"灾害结束：{disaster.Type}",
            Timestamp = disaster.EndTime
        };

        var message = new NetworkMessage(
            MessageType.DiscreteEvent,
            "server",
            MessageSerializer.SerializePayload(eventData),
            disaster.EndTime
        );
        _tcpServer.Broadcast(message);
    }
}

[Serializable]
public class PositionUpdateData
{
    public Vector3 Position { get; set; }
    public Vector3 Rotation { get; set; }
}

[Serializable]
public class PlayerStateUpdateData
{
    public float Health { get; set; }
    public float Warmth { get; set; }
    public float Energy { get; set; }
}

[Serializable]
public class MissionUpdateData
{
    public string MissionId { get; set; }
    public float Progress { get; set; }

    public MissionUpdateData()
    {
        MissionId = string.Empty;
    }
}

[Serializable]
public class SyncResponseData
{
    public List<PlayerState> Players { get; set; }
    public EnvironmentParameters Environment { get; set; }
    public List<ResearchMission> Missions { get; set; }
    public List<DisasterEvent> ActiveDisasters { get; set; }

    public SyncResponseData()
    {
        Players = new List<PlayerState>();
        Environment = new EnvironmentParameters();
        Missions = new List<ResearchMission>();
        ActiveDisasters = new List<DisasterEvent>();
    }
}
