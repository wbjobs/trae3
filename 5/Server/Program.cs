using System;
using System.Threading.Tasks;
using Server.Archive;
using Server.GameLogic;
using Server.Network;
using Server.StateSync;
using Shared.Common;
using Shared.Proto;

namespace Server
{
    public class Program
    {
        private static SocketServer _server;
        private static StateManager _stateManager;
        private static SyncBroadcaster _broadcaster;
        private static EcoSimulator _ecoSim;
        private static ArchiveService _archiveService;

        public static async Task Main(string[] args)
        {
            var port = Constants.DefaultPort;
            if (args.Length > 0 && int.TryParse(args[0], out var p))
                port = p;

            Console.WriteLine("=== Mystic Realm Eco Server ===");
            Console.WriteLine($"Version: {Constants.Version}");

            _stateManager = new StateManager();
            _server = new SocketServer();
            _broadcaster = new SyncBroadcaster(_server, _stateManager);
            _ecoSim = new EcoSimulator(_stateManager, _broadcaster);
            _archiveService = new ArchiveService(new ArchiveRepository());

            _server.OnMessageReceived += HandleMessage;

            _server.Start(port);
            _broadcaster.Start();
            _ecoSim.Start();

            Console.WriteLine("Server running. Press 'q' to quit.");
            while (Console.ReadLine() != "q") { }

            _ecoSim.Stop();
            _broadcaster.Stop();
            _server.Stop();
        }

        private static async void HandleMessage(ClientSession session, NetworkMessage msg)
        {
            var msgType = (MsgType)msg.Type;

            switch (msgType)
            {
                case MsgType.ClientHandshake:
                    HandleHandshake(session, msg);
                    break;

                case MsgType.Heartbeat:
                    session.LastActiveTime = DateTime.UtcNow;
                    var ack = ProtoCodec.CreateMessage(MsgType.HeartbeatAck, new { });
                    _server.SendToSession(session, ack);
                    break;

                case MsgType.ClientDisconnect:
                    _server.Sessions.RemoveSession(session.SessionId, "Client requested disconnect");
                    break;

                case MsgType.EntitySync:
                    HandleEntitySync(session, msg);
                    break;

                case MsgType.EntityInteraction:
                    HandleEntityInteraction(session, msg);
                    break;

                case MsgType.ArchiveSaveRequest:
                    await HandleArchiveSave(session, msg);
                    break;

                case MsgType.ArchiveLoadRequest:
                    await HandleArchiveLoad(session, msg);
                    break;

                case MsgType.ArchiveListRequest:
                    HandleArchiveList(session, msg);
                    break;

                default:
                    Console.WriteLine($"[Server] Unhandled msg type: {msgType}");
                    break;
            }
        }

        private static void HandleHandshake(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<HandshakePayload>(msg);
            if (payload == null)
            {
                Console.WriteLine("[Server] Invalid handshake payload");
                var failResp = ProtoCodec.CreateMessage(MsgType.ServerHandshakeAck, new HandshakeAckPayload
                {
                    SessionId = "",
                    Success = false,
                    ErrorMessage = "Invalid handshake payload"
                });
                _server.SendToSession(session, failResp);
                return;
            }

            var existingSession = _server.Sessions.FindByClientId(payload.ClientId);
            if (existingSession != null && existingSession.SessionId != session.SessionId)
            {
                _server.Sessions.RemoveSession(existingSession.SessionId, "Replaced by new connection");
                Console.WriteLine($"[Server] Replaced old session for {payload.ClientId}");
            }

            session.ClientId = payload.ClientId;
            Console.WriteLine($"[Server] Handshake from {payload.ClientId} ({payload.PlayerName})");

            var sceneData = _stateManager.GetSceneSyncData();
            var response = ProtoCodec.CreateMessage(MsgType.ServerHandshakeAck, new HandshakeAckPayload
            {
                SessionId = session.SessionId,
                Success = true,
                ErrorMessage = null,
                SceneState = sceneData
            });
            _server.SendToSession(session, response);

            _broadcaster.SendFullSyncToSession(session);
        }

        private static void HandleEntitySync(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<EntitySyncData>(msg);
            if (payload == null) return;
            _stateManager.UpdateEntityFromClient(payload);
        }

        private static void HandleEntityInteraction(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<EntityInteractionPayload>(msg);
            if (payload == null) return;

            Console.WriteLine($"[Server] Interaction: {payload.InitiatorId} -> {payload.TargetId} ({payload.InteractionType})");

            var target = _stateManager.GetEntity(payload.TargetId);

            if (target != null)
            {
                switch (payload.InteractionType)
                {
                    case "Feed":
                        target.Energy = Math.Min(100f, target.Energy + 15f);
                        target.CurrentBehavior = "Play";
                        break;
                    case "Heal":
                        target.Health = Math.Min(100f, target.Health + 20f);
                        break;
                    case "Scare":
                        target.CurrentBehavior = "Flee";
                        break;
                }
                target.Dirty = true;

                var broadcastMsg = ProtoCodec.CreateMessage(MsgType.EntityInteraction, payload);
                _server.BroadcastMessage(broadcastMsg);
            }
        }

        private static async Task HandleArchiveSave(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<ArchiveSavePayload>(msg);
            if (payload == null) return;

            if (string.IsNullOrEmpty(payload.ClientId) && !string.IsNullOrEmpty(session.ClientId))
                payload.ClientId = session.ClientId;

            var result = await _archiveService.SaveArchiveAsync(payload);
            var response = ProtoCodec.CreateMessage(MsgType.ArchiveSaveResponse, result);
            _server.SendToSession(session, response);
        }

        private static async Task HandleArchiveLoad(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<ArchiveLoadPayload>(msg);
            if (payload == null) return;

            if (string.IsNullOrEmpty(payload.ClientId) && !string.IsNullOrEmpty(session.ClientId))
                payload.ClientId = session.ClientId;

            var result = await _archiveService.LoadArchiveAsync(payload);
            var response = ProtoCodec.CreateMessage(MsgType.ArchiveLoadResponse, result);
            _server.SendToSession(session, response);
        }

        private static void HandleArchiveList(ClientSession session, NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<ArchiveListPayload>(msg);
            if (payload == null) return;

            if (string.IsNullOrEmpty(payload.ClientId) && !string.IsNullOrEmpty(session.ClientId))
                payload.ClientId = session.ClientId;

            var result = _archiveService.ListArchives(payload);
            var response = ProtoCodec.CreateMessage(MsgType.ArchiveListResponse, result);
            _server.SendToSession(session, response);
        }
    }
}
