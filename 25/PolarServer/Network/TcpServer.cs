
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using PolarShared.Network;

namespace PolarServer.Network;

public class TcpServer
{
    private readonly TcpListener _listener;
    private readonly ConcurrentDictionary<string, ClientConnection> _clients;
    private readonly CancellationTokenSource _cancellationTokenSource;
    private bool _isRunning;

    public event Action<string, NetworkMessage>? OnMessageReceived;
    public event Action<string>? OnClientConnected;
    public event Action<string>? OnClientDisconnected;

    public int Port { get; }
    public int ClientCount => _clients.Count;

    public TcpServer(int port = 8888)
    {
        Port = port;
        _listener = new TcpListener(IPAddress.Any, port);
        _clients = new ConcurrentDictionary<string, ClientConnection>();
        _cancellationTokenSource = new CancellationTokenSource();
    }

    public void Start()
    {
        if (_isRunning) return;

        _listener.Start();
        _isRunning = true;
        Console.WriteLine($"[TCP Server] 启动成功，监听端口: {Port}");

        _ = AcceptClientsAsync(_cancellationTokenSource.Token);
    }

    public void Stop()
    {
        if (!_isRunning) return;

        _isRunning = false;
        _cancellationTokenSource.Cancel();

        foreach (var client in _clients.Values)
        {
            client.Disconnect();
        }
        _clients.Clear();

        _listener.Stop();
        Console.WriteLine("[TCP Server] 已停止");
    }

    private async Task AcceptClientsAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var tcpClient = await _listener.AcceptTcpClientAsync(cancellationToken);
                var clientId = Guid.NewGuid().ToString();
                var connection = new ClientConnection(clientId, tcpClient);

                connection.OnMessage += (id, msg) => OnMessageReceived?.Invoke(id, msg);
                connection.OnDisconnected += id =>
                {
                    _clients.TryRemove(id, out _);
                    OnClientDisconnected?.Invoke(id);
                };

                _clients.TryAdd(clientId, connection);
                OnClientConnected?.Invoke(clientId);

                Console.WriteLine($"[TCP Server] 客户端连接: {clientId}");
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TCP Server] 接受连接错误: {ex.Message}");
            }
        }
    }

    public void SendToClient(string clientId, NetworkMessage message)
    {
        if (_clients.TryGetValue(clientId, out var client))
        {
            client.SendMessage(message);
        }
    }

    public void Broadcast(NetworkMessage message, string? excludeClientId = null)
    {
        foreach (var client in _clients)
        {
            if (client.Key != excludeClientId)
            {
                client.Value.SendMessage(message);
            }
        }
    }

    public ClientConnection? GetClient(string clientId)
    {
        return _clients.TryGetValue(clientId, out var client) ? client : null;
    }

    public List<string> GetAllClientIds()
    {
        return _clients.Keys.ToList();
    }
}
