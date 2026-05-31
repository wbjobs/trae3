
using System.Collections.Generic;
using UnityEngine;
using PolarShared.Models;
using PolarClient.Core;
using PolarClient.Network;

namespace PolarClient.Game
{
    public class PlayerManager : MonoBehaviour
    {
        [Header("预制体")]
        public GameObject remotePlayerPrefab;
        public GameObject localPlayerPrefab;

        private readonly Dictionary<string, GameObject> _remotePlayerObjects = new Dictionary<string, GameObject>();
        private GameObject _localPlayerObject;

        private IGameState? _gameState;
        private INetworkClient? _networkClient;

        private void Awake()
        {
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            _gameState = ServiceLocator.Get<IGameState>();
            _networkClient = ServiceLocator.Get<INetworkClient>();

            if (_gameState != null)
            {
                _gameState.OnPlayerUpdated += OnPlayerUpdated;
                _gameState.OnPlayerRemoved += OnPlayerRemoved;
                _gameState.OnStateReset += OnStateReset;
            }

            SpawnLocalPlayer();
        }

        private void SpawnLocalPlayer()
        {
            if (localPlayerPrefab != null)
            {
                _localPlayerObject = Instantiate(localPlayerPrefab, Vector3.zero, Quaternion.identity);
                _localPlayerObject.name = "LocalPlayer";
            }
        }

        private void OnPlayerUpdated(string playerId, PlayerState state)
        {
            if (playerId == _networkClient?.PlayerId)
            {
                return;
            }

            if (!_remotePlayerObjects.TryGetValue(playerId, out var playerObject))
            {
                if (remotePlayerPrefab != null)
                {
                    var position = new Vector3(state.Position.X, state.Position.Y, state.Position.Z);
                    playerObject = Instantiate(remotePlayerPrefab, position, Quaternion.identity);
                    playerObject.name = $"RemotePlayer_{playerId}";

                    var remotePlayer = playerObject.GetComponent<RemotePlayer>();
                    if (remotePlayer == null)
                    {
                        remotePlayer = playerObject.AddComponent<RemotePlayer>();
                    }
                    remotePlayer.Initialize(state);

                    _remotePlayerObjects.Add(playerId, playerObject);
                    Debug.Log($"[PlayerManager] 生成远程玩家: {state.PlayerName}");
                }
            }
            else
            {
                var remotePlayer = playerObject.GetComponent<RemotePlayer>();
                remotePlayer?.UpdateState(state);
            }
        }

        private void OnPlayerRemoved(string playerId)
        {
            if (_remotePlayerObjects.TryGetValue(playerId, out var playerObject))
            {
                Destroy(playerObject);
                _remotePlayerObjects.Remove(playerId);
                Debug.Log($"[PlayerManager] 移除远程玩家: {playerId}");
            }
        }

        private void OnStateReset()
        {
            foreach (var playerObject in _remotePlayerObjects.Values)
            {
                Destroy(playerObject);
            }
            _remotePlayerObjects.Clear();
            Debug.Log("[PlayerManager] 玩家状态已重置");
        }

        public GameObject GetLocalPlayer()
        {
            return _localPlayerObject;
        }

        public GameObject GetRemotePlayer(string playerId)
        {
            return _remotePlayerObjects.TryGetValue(playerId, out var player) ? player : null;
        }

        public List<GameObject> GetAllRemotePlayers()
        {
            return new List<GameObject>(_remotePlayerObjects.Values);
        }

        private void OnDestroy()
        {
            if (_gameState != null)
            {
                _gameState.OnPlayerUpdated -= OnPlayerUpdated;
                _gameState.OnPlayerRemoved -= OnPlayerRemoved;
                _gameState.OnStateReset -= OnStateReset;
            }
        }
    }
}
