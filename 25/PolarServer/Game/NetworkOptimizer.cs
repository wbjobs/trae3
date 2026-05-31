
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using PolarShared.Enums;
using PolarShared.Models;
using PolarShared.Network;

namespace PolarServer.Game
{
    public class NetworkOptimizer
    {
        private readonly ConcurrentQueue<QueuedMessage> _messageQueue = new();
        private readonly ConcurrentDictionary<string, DateTime> _clientLastUpdate = new();
        private readonly DeltaUpdateTracker _deltaTracker = new();
        private readonly Timer _batchTimer;
        private readonly Timer _cleanupTimer;

        private int _maxMessagesPerBatch = 50;
        private int _maxBytesPerSecond = 64000;
        private int _batchIntervalMs = 50;
        private int _minUpdateIntervalMs = 33;
        private long _bytesSentLastSecond = 0;
        private DateTime _rateLimitStart = DateTime.Now;

        public int QueueCount => _messageQueue.Count;
        public long TotalBytesSent { get; private set; }
        public long TotalMessagesSent { get; private set; }

        public event Action<BatchMessage, List<string>>? OnBatchReady;
        public event Action<string, NetworkMessage>? OnMessageReady;

        public NetworkOptimizer()
        {
            _batchTimer = new Timer(ProcessBatchQueue, null, _batchIntervalMs, _batchIntervalMs);
            _cleanupTimer = new Timer(CleanupOldClients, null, 30000, 30000);
        }

        public void QueueMessage(string clientId, NetworkMessage message)
        {
            if (string.IsNullOrEmpty(clientId) || message == null) return;

            _messageQueue.Enqueue(new QueuedMessage
            {
                ClientId = clientId,
                Message = message,
                Timestamp = DateTime.UtcNow
            });
        }

        public PlayerPositionDelta? TrackPlayerPosition(string playerId, Vector3 position, float rotationY, long timestamp)
        {
            return _deltaTracker.TrackPosition(playerId, position, rotationY, timestamp);
        }

        public PlayerStateDelta? TrackPlayerState(string playerId, PlayerState state, long timestamp)
        {
            return _deltaTracker.TrackPlayerState(playerId, state, timestamp);
        }

        public EnvironmentDelta? TrackEnvironment(EnvironmentParameters env, long timestamp)
        {
            return _deltaTracker.TrackEnvironment(env, timestamp);
        }

        public MissionDelta? TrackMission(string missionId, float progress, int status, long timestamp)
        {
            return _deltaTracker.TrackMission(missionId, progress, status, timestamp);
        }

        public void RemovePlayer(string playerId)
        {
            _deltaTracker.RemovePlayer(playerId);
            _clientLastUpdate.TryRemove(playerId, out _);
        }

        public bool ShouldSendUpdate(string clientId)
        {
            var now = DateTime.UtcNow;
            var lastUpdate = _clientLastUpdate.GetValueOrDefault(clientId, DateTime.MinValue);
            return (now - lastUpdate).TotalMilliseconds >= _minUpdateIntervalMs;
        }

        public bool CheckRateLimit(int bytesToSend)
        {
            var now = DateTime.UtcNow;
            if ((now - _rateLimitStart).TotalSeconds >= 1)
            {
                _bytesSentLastSecond = 0;
                _rateLimitStart = now;
            }

            if (_bytesSentLastSecond + bytesToSend <= _maxBytesPerSecond)
            {
                _bytesSentLastSecond += bytesToSend;
                return true;
            }

            return false;
        }

        private void ProcessBatchQueue(object? state)
        {
            try
            {
                var batchMessages = new Dictionary<string, BatchMessage>();
                var clientsToSend = new Dictionary<string, List<QueuedMessage>>();

                var messageCount = 0;

                while (_messageQueue.TryDequeue(out var qm) && messageCount < _maxMessagesPerBatch)
                {
                    messageCount++;

                    if (!ShouldSendUpdate(qm.ClientId))
                    {
                        if (!clientsToSend.ContainsKey(qm.ClientId))
                            clientsToSend[qm.ClientId] = new List<QueuedMessage>();
                        clientsToSend[qm.ClientId].Add(qm);
                    }

                    _clientLastUpdate[qm.ClientId] = DateTime.UtcNow;
                }

                foreach (var kvp in clientsToSend)
                {
                    var batch = new BatchMessage
                    {
                        Timestamp = DateTime.UtcNow.Ticks
                    };

                    foreach (var msg in kvp.Value)
                    {
                        ProcessMessageForBatch(msg.Message, batch);
                    }

                    if (batch.HasChanges)
                    {
                        OnBatchReady?.Invoke(batch, new List<string> { kvp.Key });
                        TotalMessagesSent++;
                    }
                }

                foreach (var kvp in batchMessages)
                {
                    if (kvp.Value.HasChanges)
                    {
                        OnBatchReady?.Invoke(kvp.Value, new List<string> { kvp.Key });
                        TotalMessagesSent++;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NetworkOptimizer] 批处理错误: {ex.Message}");
            }
        }

        private void ProcessMessageForBatch(NetworkMessage message, BatchMessage batch)
        {
            switch (message.Type)
            {
                case MessageType.PlayerPosition:
                    var posState = MessageSerializer.DeserializePayload<PlayerState>(message.Payload);
                    if (posState != null)
                    {
                        var delta = new PlayerPositionDelta
                        {
                            PlayerId = posState.PlayerId,
                            DeltaX = posState.Position.X,
                            DeltaY = posState.Position.Y,
                            DeltaZ = posState.Position.Z,
                            DeltaRotY = posState.Rotation.Y,
                            Timestamp = message.Timestamp
                        };
                        batch.PositionDeltas.Add(delta);
                    }
                    break;

                case MessageType.PlayerState:
                    var stateData = MessageSerializer.DeserializePayload<PlayerState>(message.Payload);
                    if (stateData != null)
                    {
                        var delta = new PlayerStateDelta
                        {
                            PlayerId = stateData.PlayerId,
                            HealthDelta = stateData.Health,
                            WarmthDelta = stateData.Warmth,
                            EnergyDelta = stateData.Energy,
                            Timestamp = message.Timestamp
                        };
                        batch.StateDeltas.Add(delta);
                    }
                    break;

                case MessageType.EnvironmentUpdate:
                    var envData = MessageSerializer.DeserializePayload<EnvironmentParameters>(message.Payload);
                    if (envData != null)
                    {
                        batch.EnvironmentDelta = new EnvironmentDelta
                        {
                            TemperatureDelta = envData.Temperature,
                            WindSpeedDelta = envData.WindSpeed,
                            SnowIntensityDelta = envData.SnowIntensity,
                            VisibilityDelta = envData.Visibility,
                            WeatherType = (int)envData.CurrentWeather,
                            Timestamp = message.Timestamp
                        };
                    }
                    break;

                case MessageType.MissionUpdate:
                    var missionData = MessageSerializer.DeserializePayload<ResearchMission>(message.Payload);
                    if (missionData != null)
                    {
                        var delta = new MissionDelta
                        {
                            MissionId = missionData.MissionId,
                            ProgressDelta = missionData.Progress,
                            Status = (int)missionData.Status,
                            Timestamp = message.Timestamp
                        };
                        batch.MissionDeltas.Add(delta);
                    }
                    break;

                case MessageType.PlayerJoin:
                case MessageType.PlayerLeave:
                case MessageType.DiscreteEvent:
                    OnMessageReady?.Invoke("broadcast", message);
                    break;
            }
        }

        private void CleanupOldClients(object? state)
        {
            try
            {
                var cutoff = DateTime.UtcNow.AddMinutes(-5);
                var toRemove = new List<string>();

                foreach (var kvp in _clientLastUpdate)
                {
                    if (kvp.Value < cutoff)
                        toRemove.Add(kvp.Key);
                }

                foreach (var clientId in toRemove)
                {
                    _clientLastUpdate.TryRemove(clientId, out _);
                    _deltaTracker.RemovePlayer(clientId);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NetworkOptimizer] 清理错误: {ex.Message}");
            }
        }

        public void UpdateStatistics(int bytesSent)
        {
            TotalBytesSent += bytesSent;
        }

        public void ResetTracker()
        {
            _deltaTracker.Reset();
        }

        public void SetRateLimit(int maxBytesPerSecond, int maxMessagesPerBatch, int batchIntervalMs, int minUpdateIntervalMs)
        {
            _maxBytesPerSecond = maxBytesPerSecond;
            _maxMessagesPerBatch = maxMessagesPerBatch;
            _batchIntervalMs = batchIntervalMs;
            _minUpdateIntervalMs = minUpdateIntervalMs;

            _batchTimer.Change(_batchIntervalMs, _batchIntervalMs);
        }

        public void Dispose()
        {
            _batchTimer.Dispose();
            _cleanupTimer.Dispose();
        }

        private class QueuedMessage
        {
            public string ClientId { get; set; } = string.Empty;
            public NetworkMessage Message { get; set; } = null!;
            public DateTime Timestamp { get; set; }
        }
    }
}
