
using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;
using PolarShared.Enums;
using PolarShared.Models;
using PolarShared.Network;
using PolarClient.Core;

namespace PolarClient.Network
{
    public enum ConnectionState
    {
        Disconnected,
        Connecting,
        Connected,
        Reconnecting
    }

    public class TcpClientManager : MonoBehaviour, INetworkClient
    {
        [Header("服务器配置")]
        public string serverAddress = "127.0.0.1";
        public int serverPort = 8888;

        [Header("重连配置")]
        public int maxReconnectAttempts = 5;
        public float reconnectDelaySeconds = 3f;
        public float connectionTimeoutSeconds = 10f;

        [Header("心跳配置")]
        public float heartbeatIntervalSeconds = 5f;
        public float heartbeatTimeoutSeconds = 15f;

        private TcpClient? _tcpClient;
        private NetworkStream? _stream;
        private Thread? _receiveThread;
        private Thread? _heartbeatThread;
        private CancellationTokenSource? _cancellationTokenSource;

        private readonly Queue<NetworkMessage> _messageQueue = new Queue<NetworkMessage>();
        private readonly object _queueLock = new object();
        private readonly object _sendLock = new object();

        private ConnectionState _connectionState = ConnectionState.Disconnected;
        private int _reconnectAttempts;
        private DateTime _lastHeartbeatReceived;
        private DateTime _lastHeartbeatSent;
        private string _savedPlayerId = string.Empty;

        public string PlayerId { get; private set; } = string.Empty;
        public string PlayerName { get; set; } = "探险家";

        string INetworkClient.ServerAddress
        {
            get => serverAddress;
            set => serverAddress = value;
        }

        int INetworkClient.ServerPort
        {
            get => serverPort;
            set => serverPort = value;
        }

        public bool IsConnected => _connectionState == ConnectionState.Connected;
        public ConnectionState ConnectionState => _connectionState;

        public event Action<NetworkMessage>? OnMessageReceived;
        public event Action? OnConnected;
        public event Action? OnDisconnected;
        public event Action<string>? OnConnectionFailed;
        public event Action<int>? OnReconnectAttempt;

        private void Awake()
        {
            ServiceLocator.Register<INetworkClient>(this);
            DontDestroyOnLoad(gameObject);
        }

        public bool Connect()
        {
            if (_connectionState == ConnectionState.Connecting || _connectionState == ConnectionState.Reconnecting)
            {
                Debug.LogWarning("[TcpClient] 已在连接中，忽略重复连接请求");
                return false;
            }

            SetConnectionState(ConnectionState.Connecting);
            _reconnectAttempts = 0;

            try
            {
                _tcpClient = new TcpClient
                {
                    NoDelay = true,
                    ReceiveTimeout = (int)(connectionTimeoutSeconds * 1000),
                    SendTimeout = (int)(connectionTimeoutSeconds * 1000)
                };

                var connectAsync = _tcpClient.ConnectAsync(serverAddress, serverPort);
                if (!connectAsync.Wait(TimeSpan.FromSeconds(connectionTimeoutSeconds)))
                {
                    throw new TimeoutException("连接超时");
                }

                if (!_tcpClient.Connected)
                {
                    throw new SocketException();
                }

                _stream = _tcpClient.GetStream();
                _cancellationTokenSource = new CancellationTokenSource();

                if (string.IsNullOrEmpty(_savedPlayerId))
                {
                    PlayerId = Guid.NewGuid().ToString();
                }
                else
                {
                    PlayerId = _savedPlayerId;
                }

                _lastHeartbeatReceived = DateTime.Now;
                _lastHeartbeatSent = DateTime.Now;

                _receiveThread = new Thread(ReceiveMessages)
                {
                    IsBackground = true,
                    Priority = ThreadPriority.AboveNormal
                };
                _receiveThread.Start();

                _heartbeatThread = new Thread(HeartbeatLoop)
                {
                    IsBackground = true
                };
                _heartbeatThread.Start();

                SendHandshake();

                SetConnectionState(ConnectionState.Connected);
                OnConnected?.Invoke();
                Debug.Log($"[TcpClient] 连接成功: {serverAddress}:{serverPort}, PlayerId: {PlayerId.Substring(0, 8)}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[TcpClient] 连接失败: {ex.Message}");
                SetConnectionState(ConnectionState.Disconnected);
                OnConnectionFailed?.Invoke(ex.Message);
                CleanupResources();
                return false;
            }
        }

        public void Disconnect()
        {
            if (_connectionState == ConnectionState.Disconnected) return;

            Debug.Log("[TcpClient] 主动断开连接");
            _savedPlayerId = string.Empty;
            CleanupResources();
            SetConnectionState(ConnectionState.Disconnected);
            OnDisconnected?.Invoke();
        }

        public bool Reconnect()
        {
            if (_connectionState == ConnectionState.Reconnecting) return false;

            _savedPlayerId = PlayerId;
            CleanupResources();

            while (_reconnectAttempts < maxReconnectAttempts)
            {
                _reconnectAttempts++;
                SetConnectionState(ConnectionState.Reconnecting);
                OnReconnectAttempt?.Invoke(_reconnectAttempts);

                Debug.Log($"[TcpClient] 重连尝试 {_reconnectAttempts}/{maxReconnectAttempts}...");

                if (Connect())
                {
                    _reconnectAttempts = 0;
                    return true;
                }

                if (_reconnectAttempts < maxReconnectAttempts)
                {
                    Thread.Sleep((int)(reconnectDelaySeconds * 1000));
                }
            }

            Debug.LogError("[TcpClient] 重连失败，已达最大尝试次数");
            SetConnectionState(ConnectionState.Disconnected);
            _savedPlayerId = string.Empty;
            return false;
        }

        private void ReceiveMessages()
        {
            var buffer = new byte[8192];
            var messageBuffer = new List<byte>();

            while (_connectionState == ConnectionState.Connected &&
                   _cancellationTokenSource != null &&
                   !_cancellationTokenSource.IsCancellationRequested)
            {
                try
                {
                    if (_stream == null) break;

                    var bytesRead = _stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead == 0)
                    {
                        Debug.LogWarning("[TcpClient] 服务器关闭连接");
                        HandleConnectionLost();
                        break;
                    }

                    _lastHeartbeatReceived = DateTime.Now;
                    messageBuffer.AddRange(buffer.Take(bytesRead));

                    while (TryExtractMessage(messageBuffer, out var messageBytes))
                    {
                        var message = MessageSerializer.Deserialize(messageBytes);
                        if (message != null)
                        {
                            if (message.Type == MessageType.ServerStatus)
                            {
                                continue;
                            }

                            lock (_queueLock)
                            {
                                _messageQueue.Enqueue(message);
                            }
                        }
                    }
                }
                catch (IOException)
                {
                    if (_connectionState == ConnectionState.Connected)
                    {
                        Debug.LogWarning("[TcpClient] 连接中断");
                        HandleConnectionLost();
                    }
                    break;
                }
                catch (SocketException)
                {
                    if (_connectionState == ConnectionState.Connected)
                    {
                        Debug.LogWarning("[TcpClient] Socket异常，连接中断");
                        HandleConnectionLost();
                    }
                    break;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[TcpClient] 接收消息异常: {ex.Message}");
                    if (_connectionState == ConnectionState.Connected)
                    {
                        HandleConnectionLost();
                    }
                    break;
                }
            }
        }

        private void HeartbeatLoop()
        {
            while (_connectionState == ConnectionState.Connected &&
                   _cancellationTokenSource != null &&
                   !_cancellationTokenSource.IsCancellationRequested)
            {
                try
                {
                    Thread.Sleep((int)(heartbeatIntervalSeconds * 1000));

                    if (_connectionState != ConnectionState.Connected) break;

                    if ((DateTime.Now - _lastHeartbeatReceived).TotalSeconds > heartbeatTimeoutSeconds)
                    {
                        Debug.LogWarning("[TcpClient] 心跳超时，连接可能已断开");
                        HandleConnectionLost();
                        break;
                    }

                    if ((DateTime.Now - _lastHeartbeatSent).TotalSeconds >= heartbeatIntervalSeconds)
                    {
                        var heartbeat = new NetworkMessage(MessageType.ServerStatus, PlayerId, "ping");
                        SendMessageInternal(heartbeat);
                        _lastHeartbeatSent = DateTime.Now;
                    }
                }
                catch
                {
                    break;
                }
            }
        }

        private void HandleConnectionLost()
        {
            if (_connectionState != ConnectionState.Connected) return;

            SetConnectionState(ConnectionState.Disconnected);
            OnDisconnected?.Invoke();

            _ = Task.Run(() =>
            {
                if (!Reconnect())
                {
                    Debug.LogError("[TcpClient] 自动重连失败");
                }
            });
        }

        private bool TryExtractMessage(List<byte> buffer, out byte[] messageBytes)
        {
            messageBytes = Array.Empty<byte>();

            if (buffer.Count < 4) return false;

            var length = BitConverter.ToInt32(buffer.ToArray(), 0);

            if (length <= 0 || length > 1024 * 1024)
            {
                Debug.LogError($"[TcpClient] 无效的消息长度: {length}，清空缓冲区");
                buffer.Clear();
                return false;
            }

            if (buffer.Count < 4 + length) return false;

            messageBytes = buffer.Skip(4).Take(length).ToArray();
            buffer.RemoveRange(0, 4 + length);
            return true;
        }

        private void Update()
        {
            while (true)
            {
                NetworkMessage message;
                lock (_queueLock)
                {
                    if (_messageQueue.Count == 0) break;
                    message = _messageQueue.Dequeue();
                }

                try
                {
                    OnMessageReceived?.Invoke(message);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[TcpClient] 处理消息异常: {ex.Message}");
                }
            }
        }

        public void SendMessage(NetworkMessage message)
        {
            if (_connectionState != ConnectionState.Connected)
            {
                Debug.LogWarning($"[TcpClient] 未连接，忽略消息: {message.Type}");
                return;
            }

            SendMessageInternal(message);
        }

        private void SendMessageInternal(NetworkMessage message)
        {
            try
            {
                var data = MessageSerializer.Serialize(message);
                var lengthBytes = BitConverter.GetBytes(data.Length);
                var fullMessage = lengthBytes.Concat(data).ToArray();

                lock (_sendLock)
                {
                    if (_stream != null && _tcpClient?.Connected == true)
                    {
                        _stream.Write(fullMessage, 0, fullMessage.Length);
                        _stream.Flush();
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[TcpClient] 发送消息失败: {ex.Message}");
                if (_connectionState == ConnectionState.Connected)
                {
                    HandleConnectionLost();
                }
            }
        }

        private void SendHandshake()
        {
            var message = new NetworkMessage(MessageType.Handshake, PlayerId, PlayerName);
            SendMessageInternal(message);
            Debug.Log($"[TcpClient] 发送握手: {PlayerName}");
        }

        public void SendPlayerPosition(UnityEngine.Vector3 position, UnityEngine.Vector3 rotation)
        {
            var data = new
            {
                Position = new Vector3Data { X = position.x, Y = position.y, Z = position.z },
                Rotation = new Vector3Data { X = rotation.x, Y = rotation.y, Z = rotation.z },
                Timestamp = DateTime.UtcNow.Ticks
            };

            var message = new NetworkMessage(
                MessageType.PlayerPosition,
                PlayerId,
                MessageSerializer.SerializePayload(data)
            );
            SendMessage(message);
        }

        public void SendPlayerState(float health, float warmth, float energy)
        {
            var data = new
            {
                Health = health,
                Warmth = warmth,
                Energy = energy,
                Timestamp = DateTime.UtcNow.Ticks
            };
            var message = new NetworkMessage(
                MessageType.PlayerState,
                PlayerId,
                MessageSerializer.SerializePayload(data)
            );
            SendMessage(message);
        }

        public void RequestSync()
        {
            var message = new NetworkMessage(MessageType.SyncRequest, PlayerId,
                MessageSerializer.SerializePayload(new { Timestamp = DateTime.UtcNow.Ticks }));
            SendMessage(message);
        }

        public void SendMissionUpdate(string missionId, float progress)
        {
            var data = new
            {
                MissionId = missionId,
                Progress = progress,
                Timestamp = DateTime.UtcNow.Ticks
            };
            var message = new NetworkMessage(
                MessageType.MissionUpdate,
                PlayerId,
                MessageSerializer.SerializePayload(data)
            );
            SendMessage(message);
        }

        private void SetConnectionState(ConnectionState newState)
        {
            if (_connectionState == newState) return;
            _connectionState = newState;
            Debug.Log($"[TcpClient] 连接状态变更: {_connectionState} -> {newState}");
        }

        private void CleanupResources()
        {
            try
            {
                _cancellationTokenSource?.Cancel();
                _cancellationTokenSource?.Dispose();
                _cancellationTokenSource = null;

                _receiveThread?.AbortSafely();
                _receiveThread = null;

                _heartbeatThread?.AbortSafely();
                _heartbeatThread = null;

                _stream?.Close();
                _stream?.Dispose();
                _stream = null;

                _tcpClient?.Close();
                _tcpClient?.Dispose();
                _tcpClient = null;

                lock (_queueLock)
                {
                    _messageQueue.Clear();
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[TcpClient] 清理资源时发生异常: {ex.Message}");
            }
        }

        private void OnDestroy()
        {
            CleanupResources();
            ServiceLocator.Unregister<INetworkClient>();
        }
    }

    [Serializable]
    public class Vector3Data
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Z { get; set; }
    }

    public static class ThreadExtensions
    {
        public static void AbortSafely(this Thread? thread)
        {
            try
            {
                if (thread != null && thread.IsAlive)
                {
                    thread.Abort();
                }
            }
            catch
            {
            }
        }
    }
}
