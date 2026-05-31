using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using Shared.Common;
using Shared.Proto;

namespace Server.Network
{
    public class SocketServer
    {
        private Socket _listenSocket;
        private readonly SessionManager _sessionManager;
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();
        private bool _running;
        private Timer _heartbeatCheckTimer;

        public SessionManager Sessions => _sessionManager;

        public event Action<ClientSession, NetworkMessage> OnMessageReceived;

        public SocketServer()
        {
            _sessionManager = new SessionManager();
            _sessionManager.OnSessionConnected += HandleSessionConnected;
            _sessionManager.OnSessionDisconnected += HandleSessionDisconnected;
        }

        public void Start(int port = Constants.DefaultPort)
        {
            _listenSocket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            _listenSocket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _listenSocket.Bind(new IPEndPoint(IPAddress.Any, port));
            _listenSocket.Listen(Constants.MaxConnections);
            _running = true;

            _heartbeatCheckTimer = new Timer(CheckHeartbeat, null, Constants.HeartbeatTimeoutMs, Constants.HeartbeatTimeoutMs);

            Console.WriteLine($"[Server] Listening on port {port}");

            StartAccept();
        }

        public void Stop()
        {
            _running = false;
            _cts.Cancel();
            _heartbeatCheckTimer?.Dispose();

            foreach (var session in _sessionManager.GetAllSessions())
                session.Close();

            _listenSocket?.Close();
            Console.WriteLine("[Server] Stopped");
        }

        private void CheckHeartbeat(object state)
        {
            var threshold = DateTime.UtcNow.AddMilliseconds(-Constants.HeartbeatTimeoutMs);
            foreach (var session in _sessionManager.GetAllSessions())
            {
                if (!session.IsAlive)
                {
                    _sessionManager.RemoveSession(session.SessionId, "Dead session");
                    continue;
                }

                if (session.LastActiveTime < threshold && !string.IsNullOrEmpty(session.ClientId))
                {
                    Console.WriteLine($"[Server] Heartbeat timeout: {session.SessionId} ({session.ClientId})");
                    _sessionManager.RemoveSession(session.SessionId, "Heartbeat timeout");
                }
            }
        }

        private void StartAccept()
        {
            if (!_running) return;

            try
            {
                var acceptArgs = new SocketAsyncEventArgs();
                acceptArgs.Completed += (s, e) => ProcessAccept(e);

                if (!_listenSocket.AcceptAsync(acceptArgs))
                    ProcessAccept(acceptArgs);
            }
            catch (ObjectDisposedException)
            {
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Server] Accept error: {ex.Message}");
            }
        }

        private void ProcessAccept(SocketAsyncEventArgs e)
        {
            if (e.SocketError == SocketError.Success && e.AcceptSocket != null)
            {
                e.AcceptSocket.NoDelay = true;
                var session = _sessionManager.CreateSession(e.AcceptSocket);
                Console.WriteLine($"[Server] Client connected: {session.SessionId}");
                StartReceive(session);
            }
            else
            {
                e.AcceptSocket?.Dispose();
            }

            e.Dispose();

            if (_running)
                StartAccept();
        }

        private void StartReceive(ClientSession session)
        {
            var buffer = new byte[Constants.BufferSize];
            var recvState = new ReceiveState { Session = session, Buffer = new List<byte>(), ActiveBuffer = buffer };

            var recvArgs = new SocketAsyncEventArgs();
            recvArgs.SetBuffer(buffer, 0, buffer.Length);
            recvArgs.UserToken = recvState;
            recvArgs.Completed += OnReceiveCompleted;

            try
            {
                if (!session.Socket.ReceiveAsync(recvArgs))
                    OnReceiveCompleted(this, recvArgs);
            }
            catch
            {
                _sessionManager.RemoveSession(session.SessionId, "Receive start error");
            }
        }

        private void OnReceiveCompleted(object sender, SocketAsyncEventArgs e)
        {
            var state = (ReceiveState)e.UserToken;
            var session = state.Session;

            if (e.BytesTransferred <= 0 || e.SocketError != SocketError.Success)
            {
                e.Dispose();
                _sessionManager.RemoveSession(session.SessionId, "Client disconnected");
                return;
            }

            var receivedChunk = new byte[e.BytesTransferred];
            Buffer.BlockCopy(e.Buffer, e.Offset, receivedChunk, 0, e.BytesTransferred);
            state.Buffer.AddRange(receivedChunk);
            session.LastActiveTime = DateTime.UtcNow;

            while (state.Buffer.Count >= 4)
            {
                try
                {
                    var bufArray = state.Buffer.ToArray();
                    if (ProtoCodec.TryDecodeMessage(bufArray, 0, bufArray.Length, out var msg, out int consumed))
                    {
                        state.Buffer.RemoveRange(0, consumed);
                        try
                        {
                            OnMessageReceived?.Invoke(session, msg);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[Server] Message handler error: {ex.Message}");
                        }
                    }
                    else
                    {
                        break;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Server] Decode error for session {session.SessionId}: {ex.Message}");
                    e.Dispose();
                    _sessionManager.RemoveSession(session.SessionId, "Decode error");
                    return;
                }
            }

            if (state.Buffer.Count > Constants.MaxMessageSize)
            {
                Console.WriteLine($"[Server] Buffer overflow for session {session.SessionId}");
                e.Dispose();
                _sessionManager.RemoveSession(session.SessionId, "Buffer overflow");
                return;
            }

            if (session.IsAlive && _running)
            {
                try
                {
                    if (state.ActiveBuffer.Length != e.Buffer.Length)
                    {
                        state.ActiveBuffer = new byte[Constants.BufferSize];
                    }
                    e.SetBuffer(state.ActiveBuffer, 0, state.ActiveBuffer.Length);
                    if (!session.Socket.ReceiveAsync(e))
                        OnReceiveCompleted(this, e);
                }
                catch
                {
                    e.Dispose();
                    _sessionManager.RemoveSession(session.SessionId, "Receive restart error");
                }
            }
            else
            {
                e.Dispose();
            }
        }

        public void SendToSession(ClientSession session, NetworkMessage msg)
        {
            if (!session.IsAlive) return;
            try
            {
                var data = ProtoCodec.EncodeMessage(msg);
                session.EnqueueSend(data);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Server] Send to session error: {ex.Message}");
            }
        }

        public void BroadcastMessage(NetworkMessage msg, string excludeSessionId = null)
        {
            try
            {
                var data = ProtoCodec.EncodeMessage(msg);
                _sessionManager.Broadcast(data, excludeSessionId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Server] Broadcast error: {ex.Message}");
            }
        }

        private void HandleSessionConnected(ClientSession session)
        {
        }

        private void HandleSessionDisconnected(ClientSession session, string reason)
        {
            Console.WriteLine($"[Server] Client disconnected: {session.SessionId} - {reason}");
        }

        private class ReceiveState
        {
            public ClientSession Session;
            public List<byte> Buffer;
            public byte[] ActiveBuffer;
        }
    }
}
