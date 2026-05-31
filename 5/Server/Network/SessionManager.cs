using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading;
using Shared.Common;
using Shared.Proto;

namespace Server.Network
{
    public class ClientSession
    {
        public string SessionId { get; }
        public string ClientId { get; set; }
        public Socket Socket { get; }
        public DateTime ConnectTime { get; }
        public DateTime LastActiveTime { get; set; }
        public bool IsAlive { get; set; }

        private readonly ConcurrentQueue<byte[]> _sendQueue = new ConcurrentQueue<byte[]>();
        private int _sending;
        private readonly object _sendLock = new object();

        public ClientSession(Socket socket, string sessionId)
        {
            Socket = socket;
            SessionId = sessionId;
            ConnectTime = DateTime.UtcNow;
            LastActiveTime = ConnectTime;
            IsAlive = true;
        }

        public void EnqueueSend(byte[] data)
        {
            _sendQueue.Enqueue(data);
            if (Interlocked.CompareExchange(ref _sending, 1, 0) == 0)
                SendNext();
        }

        private void SendNext()
        {
            if (!_sendQueue.TryDequeue(out var data))
            {
                Interlocked.Exchange(ref _sending, 0);

                if (_sendQueue.TryDequeue(out var nextData))
                {
                    if (Interlocked.CompareExchange(ref _sending, 1, 0) == 0)
                    {
                        _sendQueue.Enqueue(nextData);
                        SendNext();
                    }
                    else
                    {
                        _sendQueue.Enqueue(nextData);
                    }
                }
                return;
            }

            try
            {
                var sendArgs = new SocketAsyncEventArgs();
                sendArgs.SetBuffer(data, 0, data.Length);
                sendArgs.UserToken = data;
                sendArgs.Completed += OnSendCompleted;

                if (!Socket.SendAsync(sendArgs))
                    OnSendCompleted(this, sendArgs);
            }
            catch
            {
                IsAlive = false;
                Interlocked.Exchange(ref _sending, 0);
            }
        }

        private void OnSendCompleted(object sender, SocketAsyncEventArgs e)
        {
            if (e.SocketError != SocketError.Success)
                IsAlive = false;

            e.Dispose();

            if (IsAlive)
                SendNext();
            else
                Interlocked.Exchange(ref _sending, 0);
        }

        public void Close()
        {
            IsAlive = false;
            try { Socket.Shutdown(SocketShutdown.Both); } catch { }
            try { Socket.Close(); } catch { }
        }
    }

    public class SessionManager
    {
        private readonly ConcurrentDictionary<string, ClientSession> _sessions = new ConcurrentDictionary<string, ClientSession>();
        private int _sessionCounter;

        public event Action<ClientSession> OnSessionConnected;
        public event Action<ClientSession, string> OnSessionDisconnected;

        public ClientSession CreateSession(Socket socket)
        {
            var id = Interlocked.Increment(ref _sessionCounter).ToString("D6");
            var session = new ClientSession(socket, id);
            _sessions[session.SessionId] = session;
            OnSessionConnected?.Invoke(session);
            return session;
        }

        public void RemoveSession(string sessionId, string reason = "Unknown")
        {
            if (_sessions.TryRemove(sessionId, out var session))
            {
                session.Close();
                OnSessionDisconnected?.Invoke(session, reason);
            }
        }

        public ClientSession GetSession(string sessionId)
        {
            _sessions.TryGetValue(sessionId, out var s);
            return s;
        }

        public List<ClientSession> GetAllSessions()
        {
            return new List<ClientSession>(_sessions.Values);
        }

        public int ActiveCount => _sessions.Count;

        public void Broadcast(byte[] data, string excludeSessionId = null)
        {
            foreach (var session in _sessions.Values)
            {
                if (session.SessionId == excludeSessionId || !session.IsAlive)
                    continue;
                session.EnqueueSend(data);
            }
        }

        public ClientSession FindByClientId(string clientId)
        {
            foreach (var session in _sessions.Values)
            {
                if (session.ClientId == clientId)
                    return session;
            }
            return null;
        }
    }
}
