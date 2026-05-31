
using UnityEngine;
using UnityEngine.UI;
using PolarShared.Models;
using PolarClient.Core;
using PolarClient.Network;

namespace PolarClient.Game
{
    public class UIManager : MonoBehaviour
    {
        [Header("玩家状态")]
        public Slider healthSlider;
        public Slider warmthSlider;
        public Slider energySlider;
        public Text healthText;
        public Text warmthText;
        public Text energyText;

        [Header("环境信息")]
        public Text temperatureText;
        public Text windChillText;
        public Text windSpeedText;
        public Text visibilityText;
        public Text weatherText;

        [Header("任务面板")]
        public GameObject missionPanel;
        public Transform missionListContainer;
        public GameObject missionItemPrefab;

        [Header("连接面板")]
        public GameObject connectionPanel;
        public InputField playerNameInput;
        public InputField serverAddressInput;
        public Button connectButton;
        public Text connectionStatusText;

        [Header("玩家列表")]
        public Transform playerListContainer;
        public GameObject playerItemPrefab;

        [Header("断开重连UI")]
        public GameObject reconnectPanel;
        public Text reconnectStatusText;
        public Button manualReconnectButton;

        private IGameState? _gameState;
        private INetworkClient? _networkClient;

        private void Start()
        {
            _gameState = ServiceLocator.Get<IGameState>();
            _networkClient = ServiceLocator.Get<INetworkClient>();

            if (_gameState != null)
            {
                _gameState.OnEnvironmentUpdated += OnEnvironmentUpdated;
                _gameState.OnPlayerUpdated += OnPlayerUpdated;
                _gameState.OnPlayerRemoved += OnPlayerRemoved;
                _gameState.OnMissionUpdated += OnMissionUpdated;
                _gameState.OnStateReset += OnStateReset;
            }

            if (_networkClient != null)
            {
                _networkClient.OnConnected += OnConnected;
                _networkClient.OnDisconnected += OnDisconnected;
                _networkClient.OnConnectionFailed += OnConnectionFailed;
                _networkClient.OnReconnectAttempt += OnReconnectAttempt;
            }

            if (connectButton != null)
            {
                connectButton.onClick.AddListener(OnConnectClicked);
            }

            if (manualReconnectButton != null)
            {
                manualReconnectButton.onClick.AddListener(OnManualReconnectClicked);
            }

            if (reconnectPanel != null)
            {
                reconnectPanel.SetActive(false);
            }

            if (connectionPanel != null && _networkClient != null && _networkClient.IsConnected)
            {
                connectionPanel.SetActive(false);
            }
        }

        private void OnConnectClicked()
        {
            if (_networkClient == null) return;

            if (playerNameInput != null && !string.IsNullOrEmpty(playerNameInput.text))
            {
                _networkClient.PlayerName = playerNameInput.text;
            }

            if (serverAddressInput != null && !string.IsNullOrEmpty(serverAddressInput.text))
            {
                _networkClient.ServerAddress = serverAddressInput.text;
            }

            if (connectionStatusText != null)
            {
                connectionStatusText.text = "正在连接...";
            }

            bool success = _networkClient.Connect();
            if (!success && connectionStatusText != null)
            {
                connectionStatusText.text = "连接失败，请重试";
            }
        }

        private void OnManualReconnectClicked()
        {
            if (_networkClient == null) return;

            if (reconnectStatusText != null)
            {
                reconnectStatusText.text = "正在重连...";
            }

            _ = System.Threading.Tasks.Task.Run(() =>
            {
                _networkClient.Reconnect();
            });
        }

        private void OnConnected()
        {
            if (connectionPanel != null)
            {
                connectionPanel.SetActive(false);
            }
            if (reconnectPanel != null)
            {
                reconnectPanel.SetActive(false);
            }
            if (missionPanel != null)
            {
                missionPanel.SetActive(true);
            }

            Debug.Log("[UIManager] 已连接到服务器");
        }

        private void OnDisconnected()
        {
            if (reconnectPanel != null)
            {
                reconnectPanel.SetActive(true);
                if (reconnectStatusText != null)
                {
                    reconnectStatusText.text = "连接已断开，正在尝试重连...";
                }
            }

            if (connectionStatusText != null)
            {
                connectionStatusText.text = "已断开连接";
            }
        }

        private void OnConnectionFailed(string error)
        {
            if (connectionStatusText != null)
            {
                connectionStatusText.text = $"连接失败: {error}";
            }

            if (reconnectPanel != null)
            {
                reconnectPanel.SetActive(true);
                if (reconnectStatusText != null)
                {
                    reconnectStatusText.text = $"连接失败: {error}\n点击按钮重试";
                }
            }
        }

        private void OnReconnectAttempt(int attempt)
        {
            if (reconnectStatusText != null)
            {
                reconnectStatusText.text = $"正在重连 (尝试 {attempt}/5)...";
            }
        }

        private void OnEnvironmentUpdated(EnvironmentParameters env)
        {
            if (temperatureText != null)
            {
                temperatureText.text = $"温度: {env.Temperature:F1}°C";
            }
            if (windChillText != null)
            {
                windChillText.text = $"体感: {env.CalculateWindChill():F1}°C";
            }
            if (windSpeedText != null)
            {
                windSpeedText.text = $"风速: {env.WindSpeed:F1} m/s";
            }
            if (visibilityText != null)
            {
                visibilityText.text = $"能见度: {env.Visibility:F0}%";
            }
            if (weatherText != null)
            {
                weatherText.text = $"天气: {GetWeatherName(env.CurrentWeather)}";
            }
        }

        private string GetWeatherName(PolarShared.Enums.WeatherType weather)
        {
            return weather switch
            {
                PolarShared.Enums.WeatherType.Clear => "晴朗",
                PolarShared.Enums.WeatherType.LightSnow => "小雪",
                PolarShared.Enums.WeatherType.HeavySnow => "大雪",
                PolarShared.Enums.WeatherType.Blizzard => "暴风雪",
                PolarShared.Enums.WeatherType.Windy => "大风",
                _ => "未知"
            };
        }

        private void OnPlayerUpdated(string playerId, PlayerState state)
        {
            if (playerId == _networkClient?.PlayerId)
            {
                UpdateLocalPlayerUI(state);
            }
            else
            {
                UpdateRemotePlayerUI(playerId, state);
            }
        }

        private void UpdateLocalPlayerUI(PlayerState state)
        {
            if (healthSlider != null)
            {
                healthSlider.value = state.Health / 100f;
            }
            if (healthText != null)
            {
                healthText.text = $"生命: {state.Health:F0}";
            }

            if (warmthSlider != null)
            {
                warmthSlider.value = state.Warmth / 100f;
            }
            if (warmthText != null)
            {
                warmthText.text = $"体温: {state.Warmth:F0}";
            }

            if (energySlider != null)
            {
                energySlider.value = state.Energy / 100f;
            }
            if (energyText != null)
            {
                energyText.text = $"体力: {state.Energy:F0}";
            }
        }

        private void UpdateRemotePlayerUI(string playerId, PlayerState state)
        {
            if (playerListContainer == null) return;

            var existingItem = playerListContainer.Find(playerId);
            if (existingItem == null)
            {
                if (playerItemPrefab != null)
                {
                    var item = Instantiate(playerItemPrefab, playerListContainer);
                    item.name = playerId;
                    var itemText = item.GetComponentInChildren<Text>();
                    if (itemText != null)
                    {
                        itemText.text = state.PlayerName;
                    }
                }
            }
        }

        private void OnPlayerRemoved(string playerId)
        {
            if (playerListContainer == null) return;

            var existingItem = playerListContainer.Find(playerId);
            if (existingItem != null)
            {
                Destroy(existingItem.gameObject);
            }
        }

        private void OnMissionUpdated(ResearchMission mission)
        {
            if (missionListContainer == null || missionItemPrefab == null) return;

            var existingItem = missionListContainer.Find(mission.MissionId);
            if (existingItem == null)
            {
                var item = Instantiate(missionItemPrefab, missionListContainer);
                item.name = mission.MissionId;
                UpdateMissionItem(item, mission);
            }
            else
            {
                UpdateMissionItem(existingItem.gameObject, mission);
            }
        }

        private void UpdateMissionItem(GameObject item, ResearchMission mission)
        {
            var texts = item.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "Title")
                {
                    text.text = mission.Title;
                }
                else if (text.name == "Description")
                {
                    text.text = mission.Description;
                }
                else if (text.name == "Progress")
                {
                    text.text = $"进度: {mission.Progress:F0}%";
                }
                else if (text.name == "Status")
                {
                    text.text = GetStatusName(mission.Status);
                    text.color = GetStatusColor(mission.Status);
                }
            }

            var slider = item.GetComponentInChildren<Slider>();
            if (slider != null)
            {
                slider.value = mission.Progress / 100f;
            }
        }

        private string GetStatusName(PolarShared.Enums.MissionStatus status)
        {
            return status switch
            {
                PolarShared.Enums.MissionStatus.NotStarted => "未开始",
                PolarShared.Enums.MissionStatus.InProgress => "进行中",
                PolarShared.Enums.MissionStatus.Completed => "已完成",
                PolarShared.Enums.MissionStatus.Failed => "失败",
                _ => "未知"
            };
        }

        private Color GetStatusColor(PolarShared.Enums.MissionStatus status)
        {
            return status switch
            {
                PolarShared.Enums.MissionStatus.NotStarted => Color.gray,
                PolarShared.Enums.MissionStatus.InProgress => Color.yellow,
                PolarShared.Enums.MissionStatus.Completed => Color.green,
                PolarShared.Enums.MissionStatus.Failed => Color.red,
                _ => Color.white
            };
        }

        private void OnStateReset()
        {
            if (playerListContainer != null)
            {
                foreach (Transform child in playerListContainer)
                {
                    Destroy(child.gameObject);
                }
            }

            if (missionListContainer != null)
            {
                foreach (Transform child in missionListContainer)
                {
                    Destroy(child.gameObject);
                }
            }

            Debug.Log("[UIManager] UI状态已重置");
        }

        public void ToggleMissionPanel()
        {
            if (missionPanel != null)
            {
                missionPanel.SetActive(!missionPanel.activeSelf);
            }
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.M))
            {
                ToggleMissionPanel();
            }
        }

        private void OnDestroy()
        {
            if (_gameState != null)
            {
                _gameState.OnEnvironmentUpdated -= OnEnvironmentUpdated;
                _gameState.OnPlayerUpdated -= OnPlayerUpdated;
                _gameState.OnPlayerRemoved -= OnPlayerRemoved;
                _gameState.OnMissionUpdated -= OnMissionUpdated;
                _gameState.OnStateReset -= OnStateReset;
            }

            if (_networkClient != null)
            {
                _networkClient.OnConnected -= OnConnected;
                _networkClient.OnDisconnected -= OnDisconnected;
                _networkClient.OnConnectionFailed -= OnConnectionFailed;
                _networkClient.OnReconnectAttempt -= OnReconnectAttempt;
            }
        }
    }
}
