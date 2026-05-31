using System;
using Client.Archive;
using Client.CharacterEco;
using Client.Network;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client.SceneLogic
{
    public class SceneController : MonoBehaviour
    {
        [SerializeField] private EnvironmentManager _environmentManager;
        [SerializeField] private SceneEntityManager _entityManager;
        [SerializeField] private ArchiveManager _archiveManager;

        private NetworkClient _networkClient;
        private MessageHandler _messageHandler;
        private string _lastHost;
        private int _lastPort;
        private string _lastClientId;
        private string _lastPlayerName;

        public EnvironmentManager Environment => _environmentManager;
        public SceneEntityManager Entities => _entityManager;
        public ArchiveManager Archive => _archiveManager;
        public bool IsConnected => _networkClient != null && _networkClient.IsConnected;

        private void Awake()
        {
            _messageHandler = new MessageHandler();
            _networkClient = new NetworkClient(_messageHandler);

            RegisterNetworkHandlers();

            _networkClient.OnDisconnected += OnNetworkDisconnected;
        }

        private void RegisterNetworkHandlers()
        {
            _messageHandler.RegisterHandler(MsgType.ServerHandshakeAck, OnHandshakeAck);
            _messageHandler.RegisterHandler(MsgType.EntitySync, OnEntitySync);
            _messageHandler.RegisterHandler(MsgType.EntityBatchSync, OnEntityBatchSync);
            _messageHandler.RegisterHandler(MsgType.EntityDeltaBatchSync, OnEntityDeltaBatchSync);
            _messageHandler.RegisterHandler(MsgType.EntitySpawn, OnEntitySpawn);
            _messageHandler.RegisterHandler(MsgType.EntityDespawn, OnEntityDespawn);
            _messageHandler.RegisterHandler(MsgType.EntityInteraction, OnEntityInteraction);
            _messageHandler.RegisterHandler(MsgType.SceneStateSync, OnSceneStateSync);
            _messageHandler.RegisterHandler(MsgType.WeatherUpdate, OnWeatherUpdate);
            _messageHandler.RegisterHandler(MsgType.ArchiveSaveResponse, OnArchiveSaveResponse);
            _messageHandler.RegisterHandler(MsgType.ArchiveLoadResponse, OnArchiveLoadResponse);
            _messageHandler.RegisterHandler(MsgType.ArchiveListResponse, OnArchiveListResponse);
        }

        private void Update()
        {
            _networkClient?.Update(Time.deltaTime);
        }

        private void OnDestroy()
        {
            _networkClient?.Disconnect();
            _networkClient?.Dispose();
        }

        public void ConnectToServer(string host, int port, string clientId, string playerName)
        {
            _lastHost = host;
            _lastPort = port;
            _lastClientId = clientId;
            _lastPlayerName = playerName;

            _networkClient.OnConnected += () =>
            {
                var handshake = new HandshakePayload
                {
                    ClientId = clientId,
                    ClientVersion = Constants.Version,
                    PlayerName = playerName
                };
                _networkClient.Send(MsgType.ClientHandshake, handshake);
            };

            _networkClient.Connect(host, port);
        }

        public void Reconnect()
        {
            if (string.IsNullOrEmpty(_lastHost)) return;
            _entityManager.ClearAll();
            ConnectToServer(_lastHost, _lastPort, _lastClientId, _lastPlayerName);
        }

        public void DisconnectFromServer()
        {
            _networkClient.Disconnect();
            _entityManager.ClearAll();
        }

        public void SendEntityInteraction(string initiatorId, string targetId, string interactionType)
        {
            var payload = new EntityInteractionPayload
            {
                InitiatorId = initiatorId,
                TargetId = targetId,
                InteractionType = interactionType
            };
            _networkClient.Send(MsgType.EntityInteraction, payload);
        }

        public void RequestSaveArchive(string archiveName, string clientId)
        {
            var saveData = new ArchiveSavePayload
            {
                ArchiveName = archiveName,
                ClientId = clientId,
                SceneId = "mystic_realm_01",
                SceneState = _environmentManager.GetCurrentState(),
                Entities = _entityManager.GetAllSyncData()
            };
            _networkClient.Send(MsgType.ArchiveSaveRequest, saveData);
        }

        public void RequestLoadArchive(string archiveName, string clientId)
        {
            var payload = new ArchiveLoadPayload
            {
                ArchiveName = archiveName,
                ClientId = clientId
            };
            _networkClient.Send(MsgType.ArchiveLoadRequest, payload);
        }

        public void RequestArchiveList(string clientId)
        {
            var payload = new ArchiveListPayload { ClientId = clientId };
            _networkClient.Send(MsgType.ArchiveListRequest, payload);
        }

        private void OnNetworkDisconnected(string reason)
        {
            Debug.LogWarning($"[Scene] Disconnected: {reason}");
        }

        private void OnHandshakeAck(NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<HandshakeAckPayload>(msg);
            if (payload == null) return;

            if (payload.Success)
            {
                _networkClient.SetSessionId(payload.SessionId);
                Debug.Log($"[Scene] Connected, session: {payload.SessionId}");

                if (payload.SceneState != null)
                    _environmentManager.ApplySceneState(payload.SceneState);
            }
            else
            {
                Debug.LogError($"[Scene] Handshake failed: {payload.ErrorMessage}");
            }
        }

        private void OnEntitySync(NetworkMessage msg)
        {
            var data = ProtoCodec.DecodePayload<EntitySyncData>(msg);
            _entityManager.UpdateEntity(data);
        }

        private void OnEntityBatchSync(NetworkMessage msg)
        {
            var batch = ProtoCodec.DecodePayload<EntityBatchSyncPayload>(msg);
            if (batch?.Entities != null)
                _entityManager.UpdateEntitiesBatch(batch.Entities);
        }

        private void OnEntityDeltaBatchSync(NetworkMessage msg)
        {
            var batch = ProtoCodec.DecodePayload<EntityDeltaBatchPayload>(msg);
            if (batch?.Deltas != null)
                _entityManager.UpdateEntitiesDeltaBatch(batch.Deltas);
        }

        private void OnEntitySpawn(NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<EntitySpawnPayload>(msg);
            if (payload?.EntityData != null)
                _entityManager.SpawnEntity(payload.EntityData);
        }

        private void OnEntityDespawn(NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<EntityDespawnPayload>(msg);
            if (payload != null)
                _entityManager.DespawnEntity(payload.EntityId);
        }

        private void OnEntityInteraction(NetworkMessage msg)
        {
            var payload = ProtoCodec.DecodePayload<EntityInteractionPayload>(msg);
            if (payload == null) return;

            var target = _entityManager.GetCreature(payload.TargetId);
            if (target != null)
                target.OnReceiveInteraction(payload.InitiatorId, payload.InteractionType);
        }

        private void OnSceneStateSync(NetworkMessage msg)
        {
            var state = ProtoCodec.DecodePayload<SceneStateData>(msg);
            _environmentManager.ApplySceneState(state);
        }

        private void OnWeatherUpdate(NetworkMessage msg)
        {
            var update = ProtoCodec.DecodePayload<WeatherUpdatePayload>(msg);
            _environmentManager.StartWeatherTransition(update);
        }

        private void OnArchiveSaveResponse(NetworkMessage msg)
        {
            var result = ProtoCodec.DecodePayload<ArchiveSaveResultPayload>(msg);
            if (result?.Success == true)
                Debug.Log($"[Scene] Archive saved: {result.ArchiveName}");
            else
                Debug.LogError($"[Scene] Archive save failed: {result?.ErrorMessage}");
        }

        private void OnArchiveLoadResponse(NetworkMessage msg)
        {
            var result = ProtoCodec.DecodePayload<ArchiveLoadResultPayload>(msg);
            if (result?.Success != true || result.Data == null)
            {
                Debug.LogError($"[Scene] Archive load failed: {result?.ErrorMessage}");
                return;
            }

            _entityManager.ClearAll();
            _environmentManager.ApplySceneState(result.Data.SceneState);

            if (result.Data.Entities != null)
            {
                foreach (var entity in result.Data.Entities)
                    _entityManager.SpawnEntity(entity);
            }

            _archiveManager?.ApplyLoadedData(result.Data);
            Debug.Log($"[Scene] Archive loaded: {result.ArchiveName}");
        }

        private void OnArchiveListResponse(NetworkMessage msg)
        {
            var result = ProtoCodec.DecodePayload<ArchiveListResultPayload>(msg);
            if (result?.Success == true)
            {
                var names = result.ArchiveNames != null ? string.Join(", ", result.ArchiveNames) : "none";
                Debug.Log($"[Scene] Available archives: {names}");
            }
        }
    }
}
