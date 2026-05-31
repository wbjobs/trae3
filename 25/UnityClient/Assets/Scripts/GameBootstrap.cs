
using UnityEngine;
using PolarClient.Core;
using PolarClient.Network;
using PolarClient.Game;

namespace PolarClient
{
    public class GameBootstrap : MonoBehaviour
    {
        [Header("系统预制体")]
        public GameObject tcpManagerPrefab;
        public GameObject gameStatePrefab;
        public GameObject playerManagerPrefab;
        public GameObject weatherSystemPrefab;
        public GameObject uiManagerPrefab;
        public GameObject disasterSystemPrefab;

        private void Awake()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 1;
            InitializeSystems();
        }

        private void InitializeSystems()
        {
            if (!ServiceLocator.IsRegistered<INetworkClient>())
            {
                if (tcpManagerPrefab != null)
                {
                    Instantiate(tcpManagerPrefab);
                }
                else
                {
                    var tcpObj = new GameObject("TcpClientManager");
                    tcpObj.AddComponent<TcpClientManager>();
                }
            }

            if (!ServiceLocator.IsRegistered<IGameState>())
            {
                if (gameStatePrefab != null)
                {
                    Instantiate(gameStatePrefab);
                }
                else
                {
                    var stateObj = new GameObject("GameStateManager");
                    stateObj.AddComponent<GameStateManager>();
                }
            }

            if (!ServiceLocator.IsRegistered<IWeatherSystem>())
            {
                if (weatherSystemPrefab != null)
                {
                    Instantiate(weatherSystemPrefab);
                }
                else
                {
                    var weatherObj = new GameObject("WeatherSystem");
                    weatherObj.AddComponent<WeatherSystem>();
                }
            }

            if (FindObjectOfType<ClientDisasterSystem>() == null)
            {
                if (disasterSystemPrefab != null)
                {
                    Instantiate(disasterSystemPrefab);
                }
                else
                {
                    var disasterObj = new GameObject("ClientDisasterSystem");
                    disasterObj.AddComponent<ClientDisasterSystem>();
                }
            }

            if (FindObjectOfType<FrameRateSmoother>() == null)
            {
                _ = FrameRateSmoother.Instance;
            }

            if (playerManagerPrefab != null)
            {
                Instantiate(playerManagerPrefab);
            }
            else
            {
                var playerObj = new GameObject("PlayerManager");
                playerObj.AddComponent<PlayerManager>();
            }

            if (uiManagerPrefab != null)
            {
                Instantiate(uiManagerPrefab);
            }
            else
            {
                var uiObj = new GameObject("UIManager");
                uiObj.AddComponent<UIManager>();
            }

            Debug.Log("[GameBootstrap] 所有系统初始化完成");
        }

        private void OnApplicationQuit()
        {
            ServiceLocator.Clear();
            Debug.Log("[GameBootstrap] 应用退出，清理服务定位器");
        }
    }
}
