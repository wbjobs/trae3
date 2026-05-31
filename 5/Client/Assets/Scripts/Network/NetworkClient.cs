using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client.Network
{
    public class NetworkClient : IDisposable
    {
        public bool IsConnected => _socket != null && _socket.Connected && _running;
        public string SessionId { get; private set; }

        public event Action OnConnected;
        public event Action<string> OnDisconnected;
        public event Action<NetworkMessage> OnMessageReceived;

        private Socket _socket;
        private readonly MessageHandler _messageHandler;
        private readonly Queue<NetworkMessage> _mainThreadQueue = new Queue<NetworkMessage>();
        private readonly object _queueLock = new object();
        private Thread _receiveThread;
        private volatile bool _running;
        private uint _seqCounter;
        private float _heartbeatTimer;
        private readonly object _sendLock = new object();
        private bool _disconnectFired;

        public NetworkClient(MessageHandler messageHandler)
        {
            _messageHandler = messageHandler;
        }

        public void Connect(string host = Constants.DefaultHost, int port = Constants.DefaultPort)
        {
            Disconnect();

            try
            {
                _disconnectFired = false;
                _socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
                _socket.NoDelay = true;
                _socket.Connect(host, port);
                _running = true;

                _receiveThread = new Thread(ReceiveLoop)
                {
                    IsBackground = true,
                    Name = "NetworkReceive"
                };
                _receiveThread.Start();

                OnConnected?.Invoke();
                Debug.Log("[NetClient] Connected to server");
            }
            catch (Exception ex)
            {
                _running = false;
                _socket = null;
                Debug.LogError($"[NetClient] Connect failed: {ex.Message}");
                FireDisconnectEvent($"Connect failed: {ex.Message}");
            }
        }

        public void Disconnect()
        {
            if (!_running && _socket == null) return;

            _running = false;

            if (_socket != null && _socket.Connected)
            {
                try
                {
                    var msg = ProtoCodec.CreateMessage(MsgType.ClientDisconnect, new { });
                    Send(msg);
                }
                catch { }
            }

            try { _socket?.Shutdown(SocketShutdown.Both); } catch { }
            try { _socket?.Close(); } catch { }
            _socket = null;

            if (_receiveThread != null && _receiveThread.IsAlive)
            {
                if (!_receiveThread.Join(1000))
                {
                    try { _receiveThread.Abort(); } catch { }
                }
                _receiveThread = null;
            }

            _heartbeatTimer = 0f;
            _seqCounter = 0;
            SessionId = null;
        }

        public void Send<T>(MsgType type, T payload)
        {
            var msg = ProtoCodec.CreateMessage(type, payload);
            msg.Seq = ++_seqCounter;
            Send(msg);
        }

        public void Send(NetworkMessage msg)
        {
            if (!IsConnected) return;

            lock (_sendLock)
            {
                try
                {
                    var data = ProtoCodec.EncodeMessage(msg);
                    _socket.Send(data);
                }
                catch (SocketException)
                {
                    _running = false;
                }
                catch (ObjectDisposedException)
                {
                    _running = false;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[NetClient] Send error: {ex.Message}");
                    _running = false;
                }
            }
        }

        public void Update(float deltaTime)
        {
            ProcessMainThreadQueue();

            if (_running && IsConnected)
            {
                _heartbeatTimer += deltaTime;
                if (_heartbeatTimer >= Constants.HeartbeatIntervalMs / 1000f)
                {
                    _heartbeatTimer = 0f;
                    Send(MsgType.Heartbeat, new { });
                }
            }
        }

        private void ReceiveLoop()
        {
            var buffer = new byte[Constants.BufferSize];
            var accumulated = new List<byte>();

            while (_running && _socket != null)
            {
                try
                {
                    int bytesRead = _socket.Receive(buffer);
                    if (bytesRead <= 0)
                    {
                        EnqueueDisconnect("Server closed connection");
                        break;
                    }

                    var chunk = new byte[bytesRead];
                    Buffer.BlockCopy(buffer, 0, chunk, 0, bytesRead);
                    accumulated.AddRange(chunk);

                    while (accumulated.Count >= 4)
                    {
                        try
                        {
                            var bufArray = accumulated.ToArray();
                            if (ProtoCodec.TryDecodeMessage(bufArray, 0, bufArray.Length, out var msg, out int consumed))
                            {
                                accumulated.RemoveRange(0, consumed);
                                EnqueueMessage(msg);
                            }
                            else
                            {
                                break;
                            }
                        }
                        catch
                        {
                            accumulated.Clear();
                            EnqueueDisconnect("Decode error");
                            return;
                        }
                    }

                    if (accumulated.Count > Constants.MaxMessageSize)
                    {
                        accumulated.Clear();
                        EnqueueDisconnect("Buffer overflow");
                        return;
                    }
                }
                catch (SocketException)
                {
                    EnqueueDisconnect("Socket error");
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch
                {
                    EnqueueDisconnect("Receive error");
                    break;
                }
            }

            _running = false;
        }

        private void EnqueueMessage(NetworkMessage msg)
        {
            lock (_queueLock)
            {
                _mainThreadQueue.Enqueue(msg);
            }
        }

        private void EnqueueDisconnect(string reason)
        {
            lock (_queueLock)
            {
                _mainThreadQueue.Enqueue(null);
                _disconnectReason = reason;
            }
        }

        private string _disconnectReason;

        private void ProcessMainThreadQueue()
        {
            lock (_queueLock)
            {
                while (_mainThreadQueue.Count > 0)
                {
                    var msg = _mainThreadQueue.Dequeue();
                    if (msg == null)
                    {
                        _running = false;
                        FireDisconnectEvent(_disconnectReason ?? "Connection lost");
                        return;
                    }

                    try
                    {
                        OnMessageReceived?.Invoke(msg);
                        _messageHandler.Dispatch(msg);
                    }
                    catch (Exception ex)
                    {
                        Debug.LogError($"[NetClient] Message dispatch error: {ex.Message}");
                    }
                }
            }
        }

        private void FireDisconnectEvent(string reason)
        {
            if (_disconnectFired) return;
            _disconnectFired = true;
            try
            {
                OnDisconnected?.Invoke(reason);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[NetClient] Disconnect callback error: {ex.Message}");
            }
            Debug.Log($"[NetClient] Disconnected: {reason}");
        }

        public void SetSessionId(string sessionId)
        {
            SessionId = sessionId;
        }

        public void Dispose()
        {
            Disconnect();
        }
    }
}
