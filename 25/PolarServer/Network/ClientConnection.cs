
using System.Net.Sockets;
using PolarShared.Network;

namespace PolarServer.Network;

public class ClientConnection
{
    private readonly TcpClient _tcpClient;
    private readonly NetworkStream _stream;
    private readonly CancellationTokenSource _cancellationTokenSource;
    private bool _isConnected;

    public string ClientId { get; }
    public bool IsConnected => _isConnected;

    public event Action<string, NetworkMessage>? OnMessage;
    public event Action<string>? OnDisconnected;

    public ClientConnection(string clientId, TcpClient tcpClient)
    {
        ClientId = clientId;
        _tcpClient = tcpClient;
        _stream = tcpClient.GetStream();
        _cancellationTokenSource = new CancellationTokenSource();
        _isConnected = true;

        _ = ReceiveMessagesAsync(_cancellationTokenSource.Token);
    }

    private async Task ReceiveMessagesAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        var messageBuffer = new List<byte>();

        while (_isConnected && !cancellationToken.IsCancellationRequested)
        {
            try
            {
                var bytesRead = await _stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                if (bytesRead == 0)
                {
                    Disconnect();
                    break;
                }

                messageBuffer.AddRange(buffer.Take(bytesRead));

                while (TryExtractMessage(messageBuffer, out var messageBytes))
                {
                    var message = MessageSerializer.Deserialize(messageBytes);
                    if (message != null)
                    {
                        OnMessage?.Invoke(ClientId, message);
                    }
                }
            }
            catch (Exception)
            {
                Disconnect();
                break;
            }
        }
    }

    private bool TryExtractMessage(List<byte> buffer, out byte[] messageBytes)
    {
        messageBytes = Array.Empty<byte>();
        
        if (buffer.Count < 4) return false;

        var length = BitConverter.ToInt32(buffer.ToArray(), 0);
        if (buffer.Count < 4 + length) return false;

        messageBytes = buffer.Skip(4).Take(length).ToArray();
        buffer.RemoveRange(0, 4 + length);
        return true;
    }

    public void SendMessage(NetworkMessage message)
    {
        if (!_isConnected) return;

        try
        {
            var data = MessageSerializer.Serialize(message);
            var lengthBytes = BitConverter.GetBytes(data.Length);
            var fullMessage = lengthBytes.Concat(data).ToArray();

            _stream.Write(fullMessage, 0, fullMessage.Length);
            _stream.Flush();
        }
        catch
        {
            Disconnect();
        }
    }

    public void Disconnect()
    {
        if (!_isConnected) return;

        _isConnected = false;
        _cancellationTokenSource.Cancel();

        try
        {
            _stream.Close();
            _tcpClient.Close();
        }
        catch { }

        OnDisconnected?.Invoke(ClientId);
        Console.WriteLine($"[ClientConnection] 客户端断开: {ClientId}");
    }
}
