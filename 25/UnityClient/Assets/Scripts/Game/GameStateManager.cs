
using System;
using System.Collections.Generic;
using UnityEngine;
using PolarShared.Enums;
using PolarShared.Models;
using PolarShared.Network;
using PolarClient.Core;
using PolarClient.Network;

namespace PolarClient.Game
{
    public class GameStateManager : MonoBehaviour, IGameState
    {
        private readonly Dictionary<string, PlayerState> _remotePlayers = new();
        private readonly Dictionary<string, ResearchMission> _missions = new();
        private readonly Dictionary<string, long> _lastUpdateTimestamps = new();
        private readonly HashSet<string> _processedMessages = new();
        private readonly object _stateLock = new();
        private readonly DeltaUpdateTracker _deltaTracker = new();

        private EnvironmentParameters _currentEnvironment = new();
        private PlayerState _localPlayerState = new();
        private long _lastEnvironmentTimestamp;
        private ClientDisasterSystem? _disasterSystem;
        private WeatherSystem? _weatherSystem;

        public EnvironmentParameters CurrentEnvironment
        {
            get
            {
                lock (_stateLock)
                {
                    return new EnvironmentParameters
                    {
                        Temperature = _currentEnvironment.Temperature,
                        WindSpeed = _currentEnvironment.WindSpeed,
                        SnowIntensity = _currentEnvironment.SnowIntensity,
                        Visibility = _currentEnvironment.Visibility,
                        CurrentWeather = _currentEnvironment.CurrentWeather,
                        LastUpdate = _currentEnvironment.LastUpdate
                    };
                }
            }
        }

        public PlayerState LocalPlayerState
        {
            get
            {
                lock (_stateLock)
                {
                    return _localPlayerState;
                }
            }
        }

        public IReadOnlyDictionary<string, PlayerState> RemotePlayers
        {
            get
            {
                lock (_stateLock)
                {
                    return new Dictionary<string, PlayerState>(_remotePlayers);
                }
            }
        }

        public IReadOnlyDictionary<string, ResearchMission> Missions
        {
            get
            {
                lock (_stateLock)
                {
                    return new Dictionary<string, ResearchMission>(_missions);
                }
            }
        }

        public event Action<EnvironmentParameters>? OnEnvironmentUpdated;
        public event Action<string, PlayerState>? OnPlayerUpdated;
        public event Action<string>? OnPlayerRemoved;
        public event Action<ResearchMission>? OnMissionUpdated;
        public event Action? OnStateReset;
        public event Action<DisasterEvent>? OnDisasterEvent;

        private INetworkClient? _networkClient;

        private void Awake()
        {
            ServiceLocator.Register<IGameState>(this);
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            _networkClient = ServiceLocator.Get<INetworkClient>();
            _disasterSystem = FindObjectOfType<ClientDisasterSystem>();
            _weatherSystem = FindObjectOfType<WeatherSystem>();

            if (_networkClient != null)
            {
                _networkClient.OnMessageReceived += HandleMessage;
                _networkClient.OnConnected += OnConnected;
                _networkClient.OnDisconnected += OnDisconnected;
                _networkClient.OnReconnectAttempt += OnReconnectAttempt;
            }

            if (_disasterSystem != null)
            {
                _disasterSystem.OnDisasterStarted += d =>
                {
                    ApplyDisasterEnvironmentEffects(d);
                    OnDisasterEvent?.Invoke(d);
                };
                _disasterSystem.OnDisasterEnded += d => OnDisasterEvent?.Invoke(d);
            }
        }

        private void OnConnected()
        {
            Debug.Log("[GameState] 连接成功，请求全量同步...");
            _deltaTracker.Reset();
            _networkClient?.RequestSync();
        }

        private void OnDisconnected()
        {
            Debug.LogWarning("[GameState] 连接断开，等待重连...");
        }

        private void OnReconnectAttempt(int attempt)
        {
            Debug.Log($"[GameState] 正在重连 (尝试 {attempt})...");
        }

        private void HandleMessage(NetworkMessage message)
        {
            if (IsDuplicateMessage(message))
            {
                return;
            }

            try
            {
                switch (message.Type)
                {
                    case MessageType.Handshake:
                        HandleHandshake(message);
                        break;
                    case MessageType.PlayerJoin:
                        HandlePlayerJoin(message);
                        break;
                    case MessageType.PlayerLeave:
                        HandlePlayerLeave(message);
                        break;
                    case MessageType.PlayerPosition:
                        HandlePlayerPosition(message);
                        break;
                    case MessageType.PlayerState:
                        HandlePlayerState(message);
                        break;
                    case MessageType.EnvironmentUpdate:
                    case MessageType.WeatherUpdate:
                        HandleEnvironmentUpdate(message);
                        break;
                    case MessageType.MissionUpdate:
                        HandleMissionUpdate(message);
                        break;
                    case MessageType.SyncResponse:
                        HandleSyncResponse(message);
                        break;
                    case MessageType.BatchUpdate:
                        HandleBatchUpdate(message);
                        break;
                    case MessageType.PositionDelta:
                        HandlePositionDelta(message);
                        break;
                    case MessageType.StateDelta:
                        HandleStateDelta(message);
                        break;
                    case MessageType.EnvironmentDelta:
                        HandleEnvironmentDelta(message);
                        break;
                    case MessageType.MissionDelta:
                        HandleMissionDelta(message);
                        break;
                    case MessageType.DiscreteEvent:
                        HandleDiscreteEvent(message);
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[GameState] 处理消息异常 {message.Type}: {ex.Message}");
            }
        }

        private bool IsDuplicateMessage(NetworkMessage message)
        {
            var messageId = $"{message.Type}-{message.SenderId}-{message.Timestamp}";
            if (_processedMessages.Contains(messageId))
            {
                return true;
            }

            _processedMessages.Add(messageId);

            if (_processedMessages.Count > 2000)
            {
                _processedMessages.Clear();
            }

            return false;
        }

        private bool IsNewerUpdate(string entityId, long timestamp)
        {
            if (_lastUpdateTimestamps.TryGetValue(entityId, out var lastTimestamp))
            {
                return timestamp > lastTimestamp;
            }
            return true;
        }

        private void UpdateTimestamp(string entityId, long timestamp)
        {
            _lastUpdateTimestamps[entityId] = timestamp;
        }

        private void HandleHandshake(NetworkMessage message)
        {
            var player = MessageSerializer.DeserializePayload<PlayerState>(message.Payload);
            if (player != null)
            {
                lock (_stateLock)
                {
                    _localPlayerState = player;
                }
                OnPlayerUpdated?.Invoke(player.PlayerId, player);
                Debug.Log($"[GameState] 本地玩家确认: {player.PlayerName}");
            }
        }

        private void HandlePlayerJoin(NetworkMessage message)
        {
            var player = MessageSerializer.DeserializePayload<PlayerState>(message.Payload);
            if (player != null && player.PlayerId != _networkClient?.PlayerId)
            {
                lock (_stateLock)
                {
                    _remotePlayers[player.PlayerId] = player;
                }
                OnPlayerUpdated?.Invoke(player.PlayerId, player);
                Debug.Log($"[GameState] 玩家加入: {player.PlayerName}");
            }
        }

        private void HandlePlayerLeave(NetworkMessage message)
        {
            var playerId = message.Payload;
            lock (_stateLock)
            {
                _remotePlayers.Remove(playerId);
                _lastUpdateTimestamps.Remove(playerId);
                _deltaTracker.RemovePlayer(playerId);
            }
            OnPlayerRemoved?.Invoke(playerId);
            Debug.Log($"[GameState] 玩家离开: {playerId}");
        }

        private void HandlePlayerPosition(NetworkMessage message)
        {
            if (message.SenderId == _networkClient?.PlayerId) return;

            var positionData = MessageSerializer.DeserializePayload<PositionUpdateData>(message.Payload);
            if (positionData == null) return;

            var timestamp = positionData.Timestamp > 0 ? positionData.Timestamp : message.Timestamp;

            if (!IsNewerUpdate($"pos_{message.SenderId}", timestamp))
                return;

            lock (_stateLock)
            {
                if (_remotePlayers.TryGetValue(message.SenderId, out var player))
                {
                    player.Position = positionData.Position;
                    player.Rotation = positionData.Rotation;
                    player.LastUpdate = DateTime.Now;
                    UpdateTimestamp($"pos_{message.SenderId}", timestamp);
                }
                else
                {
                    Debug.LogWarning($"[GameState] 收到未知玩家位置: {message.SenderId}，请求同步");
                    _networkClient?.RequestSync();
                    return;
                }
            }

            OnPlayerUpdated?.Invoke(message.SenderId, _remotePlayers[message.SenderId]);
        }

        private void HandlePlayerState(NetworkMessage message)
        {
            if (message.SenderId == _networkClient?.PlayerId) return;

            var stateData = MessageSerializer.DeserializePayload<PlayerStateUpdateData>(message.Payload);
            if (stateData == null) return;

            var timestamp = stateData.Timestamp > 0 ? stateData.Timestamp : message.Timestamp;

            if (!IsNewerUpdate($"state_{message.SenderId}", timestamp))
                return;

            lock (_stateLock)
            {
                if (_remotePlayers.TryGetValue(message.SenderId, out var player))
                {
                    player.Health = stateData.Health;
                    player.Warmth = stateData.Warmth;
                    player.Energy = stateData.Energy;
                    player.LastUpdate = DateTime.Now;
                    UpdateTimestamp($"state_{message.SenderId}", timestamp);
                }
            }

            if (_remotePlayers.TryGetValue(message.SenderId, out var updatedPlayer))
            {
                OnPlayerUpdated?.Invoke(message.SenderId, updatedPlayer);
            }
        }

        private void HandleEnvironmentUpdate(NetworkMessage message)
        {
            var env = MessageSerializer.DeserializePayload<EnvironmentParameters>(message.Payload);
            if (env == null) return;

            var envTimestamp = env.LastUpdate.Ticks > 0 ? env.LastUpdate.Ticks : message.Timestamp;

            if (envTimestamp <= _lastEnvironmentTimestamp)
                return;

            lock (_stateLock)
            {
                _currentEnvironment = env;
                _lastEnvironmentTimestamp = envTimestamp;
            }

            OnEnvironmentUpdated?.Invoke(env);
        }

        private void HandleMissionUpdate(NetworkMessage message)
        {
            var mission = MessageSerializer.DeserializePayload<ResearchMission>(message.Payload);
            if (mission == null) return;

            var timestamp = message.Timestamp;

            if (!IsNewerUpdate($"mission_{mission.MissionId}", timestamp))
                return;

            lock (_stateLock)
            {
                _missions[mission.MissionId] = mission;
                UpdateTimestamp($"mission_{mission.MissionId}", timestamp);
            }

            OnMissionUpdated?.Invoke(mission);
        }

        private void HandleBatchUpdate(NetworkMessage message)
        {
            var batch = MessageSerializer.DeserializePayload<BatchMessage>(message.Payload);
            if (batch == null || !batch.HasChanges) return;

            foreach (var posDelta in batch.PositionDeltas)
            {
                ApplyPositionDelta(posDelta);
            }

            foreach (var stateDelta in batch.StateDeltas)
            {
                ApplyStateDelta(stateDelta);
            }

            if (batch.EnvironmentDelta != null && batch.EnvironmentDelta.HasChanges)
            {
                ApplyEnvironmentDelta(batch.EnvironmentDelta);
            }

            foreach (var missionDelta in batch.MissionDeltas)
            {
                ApplyMissionDelta(missionDelta);
            }
        }

        private void HandlePositionDelta(NetworkMessage message)
        {
            var delta = MessageSerializer.DeserializePayload<PlayerPositionDelta>(message.Payload);
            if (delta != null && delta.HasChanges)
            {
                ApplyPositionDelta(delta);
            }
        }

        private void HandleStateDelta(NetworkMessage message)
        {
            var delta = MessageSerializer.DeserializePayload<PlayerStateDelta>(message.Payload);
            if (delta != null && delta.HasChanges)
            {
                ApplyStateDelta(delta);
            }
        }

        private void HandleEnvironmentDelta(NetworkMessage message)
        {
            var delta = MessageSerializer.DeserializePayload<EnvironmentDelta>(message.Payload);
            if (delta != null && delta.HasChanges)
            {
                ApplyEnvironmentDelta(delta);
            }
        }

        private void HandleMissionDelta(NetworkMessage message)
        {
            var delta = MessageSerializer.DeserializePayload<MissionDelta>(message.Payload);
            if (delta != null && delta.HasChanges)
            {
                ApplyMissionDelta(delta);
            }
        }

        private void ApplyPositionDelta(PlayerPositionDelta delta)
        {
            if (delta.PlayerId == _networkClient?.PlayerId) return;
            if (!IsNewerUpdate($"pos_{delta.PlayerId}", delta.Timestamp)) return;

            var lastPos = _deltaTracker.GetLastPosition(delta.PlayerId);
            var lastRotY = _deltaTracker.GetLastRotationY(delta.PlayerId);

            var newX = lastPos.X + (delta.DeltaX ?? 0f);
            var newY = lastPos.Y + (delta.DeltaY ?? 0f);
            var newZ = lastPos.Z + (delta.DeltaZ ?? 0f);
            var newRotY = lastRotY + (delta.DeltaRotY ?? 0f);

            var newPos = new Vector3(newX, newY, newZ);
            var newRot = new Vector3(0, newRotY, 0);

            _deltaTracker.TrackPosition(delta.PlayerId, newPos, newRotY, delta.Timestamp);

            lock (_stateLock)
            {
                if (_remotePlayers.TryGetValue(delta.PlayerId, out var player))
                {
                    player.Position = newPos;
                    player.Rotation = newRot;
                    player.LastUpdate = DateTime.Now;
                    UpdateTimestamp($"pos_{delta.PlayerId}", delta.Timestamp);
                }
                else
                {
                    Debug.LogWarning($"[GameState] 收到未知玩家位置delta: {delta.PlayerId}");
                    return;
                }
            }

            OnPlayerUpdated?.Invoke(delta.PlayerId, _remotePlayers[delta.PlayerId]);
        }

        private void ApplyStateDelta(PlayerStateDelta delta)
        {
            if (delta.PlayerId == _networkClient?.PlayerId) return;
            if (!IsNewerUpdate($"state_{delta.PlayerId}", delta.Timestamp)) return;

            var lastState = _deltaTracker.GetLastState(delta.PlayerId);

            var newHealth = lastState.Health + (delta.HealthDelta ?? 0f);
            var newWarmth = lastState.Warmth + (delta.WarmthDelta ?? 0f);
            var newEnergy = lastState.Energy + (delta.EnergyDelta ?? 0f);

            var updatedState = new PlayerState
            {
                Health = Math.Clamp(newHealth, 0, 100),
                Warmth = Math.Clamp(newWarmth, 0, 100),
                Energy = Math.Clamp(newEnergy, 0, 100)
            };

            _deltaTracker.TrackPlayerState(delta.PlayerId, updatedState, delta.Timestamp);

            lock (_stateLock)
            {
                if (_remotePlayers.TryGetValue(delta.PlayerId, out var player))
                {
                    player.Health = updatedState.Health;
                    player.Warmth = updatedState.Warmth;
                    player.Energy = updatedState.Energy;
                    player.LastUpdate = DateTime.Now;
                    UpdateTimestamp($"state_{delta.PlayerId}", delta.Timestamp);
                }
            }

            if (_remotePlayers.TryGetValue(delta.PlayerId, out var p))
            {
                OnPlayerUpdated?.Invoke(delta.PlayerId, p);
            }
        }

        private void ApplyEnvironmentDelta(EnvironmentDelta delta)
        {
            if (!IsNewerUpdate("environment", delta.Timestamp)) return;

            lock (_stateLock)
            {
                if (delta.TemperatureDelta.HasValue)
                    _currentEnvironment.Temperature += delta.TemperatureDelta.Value;
                if (delta.WindSpeedDelta.HasValue)
                    _currentEnvironment.WindSpeed += delta.WindSpeedDelta.Value;
                if (delta.SnowIntensityDelta.HasValue)
                    _currentEnvironment.SnowIntensity += delta.SnowIntensityDelta.Value;
                if (delta.VisibilityDelta.HasValue)
                    _currentEnvironment.Visibility += delta.VisibilityDelta.Value;
                if (delta.WeatherType.HasValue)
                    _currentEnvironment.CurrentWeather = (WeatherType)delta.WeatherType.Value;

                _currentEnvironment.LastUpdate = DateTime.Now;
                UpdateTimestamp("environment", delta.Timestamp);
            }

            _deltaTracker.TrackEnvironment(_currentEnvironment, delta.Timestamp);
            OnEnvironmentUpdated?.Invoke(_currentEnvironment);
        }

        private void ApplyMissionDelta(MissionDelta delta)
        {
            if (!IsNewerUpdate($"mission_{delta.MissionId}", delta.Timestamp)) return;

            lock (_stateLock)
            {
                if (_missions.TryGetValue(delta.MissionId, out var mission))
                {
                    if (delta.ProgressDelta.HasValue)
                    {
                        mission.Progress = Math.Clamp(mission.Progress + delta.ProgressDelta.Value, 0, 100);
                    }
                    if (delta.Status.HasValue)
                    {
                        mission.Status = (MissionStatus)delta.Status.Value;
                    }
                    UpdateTimestamp($"mission_{delta.MissionId}", delta.Timestamp);
                }
                else
                {
                    Debug.LogWarning($"[GameState] 收到未知任务delta: {delta.MissionId}");
                    return;
                }
            }

            OnMissionUpdated?.Invoke(_missions[delta.MissionId]);
        }

        private void HandleDiscreteEvent(NetworkMessage message)
        {
            var eventData = MessageSerializer.DeserializePayload<DiscreteEventData>(message.Payload);
            if (eventData == null) return;

            if (eventData.EventType == 0 && eventData.Disaster != null)
            {
                _disasterSystem?.HandleDiscreteEvent(eventData);
            }
            else if (eventData.EventType == 1 && eventData.Disaster != null)
            {
                _disasterSystem?.HandleDiscreteEvent(eventData);
            }
        }

        private void HandleSyncResponse(NetworkMessage message)
        {
            var syncData = MessageSerializer.DeserializePayload<SyncResponseData>(message.Payload);
            if (syncData == null) return;

            lock (_stateLock)
            {
                _currentEnvironment = syncData.Environment;
                _lastEnvironmentTimestamp = syncData.Environment.LastUpdate.Ticks;

                _remotePlayers.Clear();
                foreach (var player in syncData.Players)
                {
                    if (player.PlayerId != _networkClient?.PlayerId && player.IsOnline)
                    {
                        _remotePlayers[player.PlayerId] = player;
                        _deltaTracker.TrackPosition(player.PlayerId, player.Position, player.Rotation.Y, DateTime.UtcNow.Ticks);
                        _deltaTracker.TrackPlayerState(player.PlayerId, player, DateTime.UtcNow.Ticks);
                    }
                }

                _missions.Clear();
                foreach (var mission in syncData.Missions)
                {
                    _missions[mission.MissionId] = mission;
                    _deltaTracker.TrackMission(mission.MissionId, mission.Progress, (int)mission.Status, DateTime.UtcNow.Ticks);
                }

                _lastUpdateTimestamps.Clear();
                _processedMessages.Clear();
            }

            if (syncData.ActiveDisasters != null && _disasterSystem != null)
            {
                foreach (var disaster in syncData.ActiveDisasters)
                {
                    var eventData = new DiscreteEventData
                    {
                        EventType = 0,
                        Disaster = disaster,
                        Message = disaster.Description,
                        Timestamp = disaster.StartTime
                    };
                    _disasterSystem.HandleDiscreteEvent(eventData);
                }
            }

            OnEnvironmentUpdated?.Invoke(_currentEnvironment);

            foreach (var player in _remotePlayers.Values)
            {
                OnPlayerUpdated?.Invoke(player.PlayerId, player);
            }

            foreach (var mission in _missions.Values)
            {
                OnMissionUpdated?.Invoke(mission);
            }

            Debug.Log($"[GameState] 全量同步完成: {_remotePlayers.Count} 玩家, {_missions.Count} 任务");
        }

        private void ApplyDisasterEnvironmentEffects(DisasterEvent disaster)
        {
            if (_weatherSystem == null) return;

            var multiplier = disaster.Severity switch
            {
                DisasterSeverity.Mild => 1.2f,
                DisasterSeverity.Moderate => 1.5f,
                DisasterSeverity.Severe => 2.0f,
                DisasterSeverity.Critical => 2.5f,
                _ => 1f
            };

            switch (disaster.Type)
            {
                case DisasterType.Blizzard:
                    _weatherSystem.SetWindOverride(true, 30f * multiplier);
                    _weatherSystem.SetSnowOverride(true, 1f * multiplier);
                    _weatherSystem.SetVisibilityOverride(true, Math.Max(50f, 500f / multiplier));
                    break;
                case DisasterType.PolarStorm:
                    _weatherSystem.SetWindOverride(true, 25f * multiplier);
                    _weatherSystem.SetVisibilityOverride(true, Math.Max(100f, 800f / multiplier));
                    break;
                case DisasterType.Whiteout:
                    _weatherSystem.SetVisibilityOverride(true, Math.Max(30f, 300f / multiplier));
                    break;
            }
        }

        public PlayerState? GetPlayer(string playerId)
        {
            lock (_stateLock)
            {
                if (playerId == _networkClient?.PlayerId)
                {
                    return _localPlayerState;
                }
                return _remotePlayers.TryGetValue(playerId, out var player) ? player : null;
            }
        }

        public ResearchMission? GetMission(string missionId)
        {
            lock (_stateLock)
            {
                return _missions.TryGetValue(missionId, out var mission) ? mission : null;
            }
        }

        public void UpdateLocalPlayerState(float health, float warmth, float energy)
        {
            PlayerState updatedState;
            lock (_stateLock)
            {
                _localPlayerState.Health = Mathf.Clamp01(health / 100f) * 100;
                _localPlayerState.Warmth = Mathf.Clamp01(warmth / 100f) * 100;
                _localPlayerState.Energy = Mathf.Clamp01(energy / 100f) * 100;
                updatedState = _localPlayerState;
            }

            _networkClient?.SendPlayerState(
                updatedState.Health,
                updatedState.Warmth,
                updatedState.Energy
            );

            OnPlayerUpdated?.Invoke(updatedState.PlayerId, updatedState);
        }

        public void ResetState()
        {
            lock (_stateLock)
            {
                _remotePlayers.Clear();
                _missions.Clear();
                _currentEnvironment = new EnvironmentParameters();
                _localPlayerState = new PlayerState();
                _lastUpdateTimestamps.Clear();
                _processedMessages.Clear();
                _lastEnvironmentTimestamp = 0;
                _deltaTracker.Reset();
            }

            _disasterSystem?.ClearAllDisasters();
            OnStateReset?.Invoke();
            Debug.Log("[GameState] 状态已重置");
        }

        private void OnDestroy()
        {
            if (_networkClient != null)
            {
                _networkClient.OnMessageReceived -= HandleMessage;
                _networkClient.OnConnected -= OnConnected;
                _networkClient.OnDisconnected -= OnDisconnected;
                _networkClient.OnReconnectAttempt -= OnReconnectAttempt;
            }
            ServiceLocator.Unregister<IGameState>();
        }
    }

    [Serializable]
    public class PositionUpdateData
    {
        public Vector3 Position { get; set; }
        public Vector3 Rotation { get; set; }
        public long Timestamp { get; set; }
    }

    [Serializable]
    public class PlayerStateUpdateData
    {
        public float Health { get; set; }
        public float Warmth { get; set; }
        public float Energy { get; set; }
        public long Timestamp { get; set; }
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
}
