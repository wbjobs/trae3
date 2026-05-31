using Client.CharacterEco;
using Client.SceneLogic;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client
{
    public class GameEntry : MonoBehaviour
    {
        [Header("Connection")]
        [SerializeField] private string _serverHost = Constants.DefaultHost;
        [SerializeField] private int _serverPort = Constants.DefaultPort;
        [SerializeField] private string _playerName = "Adventurer";

        [Header("Scene References")]
        [SerializeField] private SceneController _sceneController;
        [SerializeField] private EcoInteractions _ecoInteractions;

        private string _clientId;
        private bool _connected;
        private float _autoReconnectTimer;
        private const float AutoReconnectDelay = 3f;

        private void Awake()
        {
            _clientId = System.Guid.NewGuid().ToString("N").Substring(0, 8);
            Application.targetFrameRate = 60;
        }

        private void Start()
        {
            ConnectToServer();
        }

        private void Update()
        {
            HandleInput();

            if (!_connected && _sceneController != null)
            {
                _autoReconnectTimer += Time.deltaTime;
                if (_autoReconnectTimer >= AutoReconnectDelay)
                {
                    _autoReconnectTimer = 0f;
                    Debug.Log("[GameEntry] Attempting reconnect...");
                    _sceneController.Reconnect();
                }
            }

            if (_connected && _ecoInteractions != null && _sceneController != null)
            {
                var allCreatures = new System.Collections.Generic.List<CreatureBase>(
                    _sceneController.Entities.GetAllCreatures()
                );
                if (allCreatures.Count > 0)
                    _ecoInteractions.ProcessAutoInteractions(allCreatures);
            }
        }

        private void ConnectToServer()
        {
            if (_sceneController == null)
            {
                var go = new GameObject("SceneController");
                _sceneController = go.AddComponent<SceneController>();
            }

            Debug.Log($"[GameEntry] Connecting to {_serverHost}:{_serverPort} as {_playerName}");
            _sceneController.ConnectToServer(_serverHost, _serverPort, _clientId, _playerName);
            _connected = true;
        }

        private void HandleInput()
        {
            if (Input.GetKeyDown(KeyCode.F5) && _connected)
            {
                var archiveName = $"autosave_{System.DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
                _sceneController.RequestSaveArchive(archiveName, _clientId);
                Debug.Log($"[GameEntry] Saving: {archiveName}");
            }

            if (Input.GetKeyDown(KeyCode.F9) && _connected)
            {
                _sceneController.RequestArchiveList(_clientId);
            }

            if (Input.GetMouseButtonDown(0) && _connected)
            {
                HandleCreatureInteraction();
            }

            if (Input.GetKeyDown(KeyCode.R) && !_connected)
            {
                _sceneController.Reconnect();
                _connected = true;
            }

            if (Input.GetKeyDown(KeyCode.Escape) && _connected)
            {
                _sceneController.DisconnectFromServer();
                _connected = false;
            }
        }

        private void HandleCreatureInteraction()
        {
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out var hit, 100f))
            {
                var creature = hit.collider.GetComponent<CreatureBase>();
                if (creature != null)
                {
                    string interactionType = Input.GetKey(KeyCode.LeftShift) ? "Scare" : "Feed";
                    string initiatorId = $"player_{_clientId}";
                    _sceneController.SendEntityInteraction(initiatorId, creature.EntityId, interactionType);
                    Debug.Log($"[GameEntry] {interactionType} -> {creature.SpeciesId} ({creature.EntityId})");
                }
            }
        }

        private void OnDestroy()
        {
            if (_connected)
                _sceneController?.DisconnectFromServer();
        }
    }
}
