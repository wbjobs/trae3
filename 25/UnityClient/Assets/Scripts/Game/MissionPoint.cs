
using UnityEngine;
using PolarShared.Models;
using PolarClient.Core;
using PolarClient.Network;

namespace PolarClient.Game
{
    public class MissionPoint : MonoBehaviour
    {
        public string missionId;
        public float interactionRadius = 5f;
        public KeyCode interactionKey = KeyCode.E;

        private ResearchMission? _mission;
        private bool _isPlayerNearby;
        private GameObject? _indicator;

        private IGameState? _gameState;
        private INetworkClient? _networkClient;
        private PlayerManager? _playerManager;

        private void Start()
        {
            _gameState = ServiceLocator.Get<IGameState>();
            _networkClient = ServiceLocator.Get<INetworkClient>();

            CreateIndicator();

            if (_gameState != null)
            {
                _gameState.OnMissionUpdated += OnMissionUpdated;
                _mission = _gameState.GetMission(missionId);
                UpdateIndicator();
            }
        }

        private void OnMissionUpdated(ResearchMission mission)
        {
            if (mission.MissionId == missionId)
            {
                _mission = mission;
                UpdateIndicator();
            }
        }

        private void CreateIndicator()
        {
            _indicator = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            _indicator.transform.SetParent(transform);
            _indicator.transform.localPosition = Vector3.up * 0.1f;
            _indicator.transform.localScale = new Vector3(interactionRadius * 2, 0.05f, interactionRadius * 2);
            _indicator.name = "MissionIndicator";

            var renderer = _indicator.GetComponent<Renderer>();
            renderer.material = new Material(Shader.Find("Standard"));
            renderer.material.color = new Color(1f, 1f, 0f, 0.3f);
            renderer.material.SetFloat("_Mode", 3);
            renderer.material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            renderer.material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            renderer.material.SetInt("_ZWrite", 0);
            renderer.material.DisableKeyword("_ALPHATEST_ON");
            renderer.material.EnableKeyword("_ALPHABLEND_ON");
            renderer.material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            renderer.material.renderQueue = 3000;

            Destroy(_indicator.GetComponent<Collider>());
        }

        private void Update()
        {
            if (_playerManager == null)
            {
                _playerManager = FindObjectOfType<PlayerManager>();
            }

            var player = _playerManager?.GetLocalPlayer();
            if (player != null)
            {
                var distance = Vector3.Distance(transform.position, player.transform.position);
                _isPlayerNearby = distance <= interactionRadius;

                if (_isPlayerNearby && Input.GetKeyDown(interactionKey))
                {
                    InteractWithMission();
                }
            }

            UpdateIndicator();
        }

        private void UpdateIndicator()
        {
            if (_indicator == null) return;

            var renderer = _indicator.GetComponent<Renderer>();
            if (_mission == null)
            {
                renderer.material.color = new Color(0.5f, 0.5f, 0.5f, 0.3f);
                return;
            }

            switch (_mission.Status)
            {
                case PolarShared.Enums.MissionStatus.NotStarted:
                    renderer.material.color = new Color(1f, 1f, 0f, 0.3f);
                    break;
                case PolarShared.Enums.MissionStatus.InProgress:
                    renderer.material.color = new Color(0f, 1f, 1f, 0.3f);
                    break;
                case PolarShared.Enums.MissionStatus.Completed:
                    renderer.material.color = new Color(0f, 1f, 0f, 0.3f);
                    break;
                case PolarShared.Enums.MissionStatus.Failed:
                    renderer.material.color = new Color(1f, 0f, 0f, 0.3f);
                    break;
            }
        }

        private void InteractWithMission()
        {
            if (_mission == null || _networkClient == null) return;

            switch (_mission.Status)
            {
                case PolarShared.Enums.MissionStatus.NotStarted:
                    StartMission();
                    break;
                case PolarShared.Enums.MissionStatus.InProgress:
                    AdvanceMission();
                    break;
                case PolarShared.Enums.MissionStatus.Completed:
                    Debug.Log($"任务已完成: {_mission.Title}");
                    break;
            }
        }

        private void StartMission()
        {
            _networkClient?.SendMissionUpdate(missionId, 10f);
            Debug.Log($"开始任务: {_mission?.Title}");
        }

        private void AdvanceMission()
        {
            if (_mission == null) return;

            var newProgress = Mathf.Min(_mission.Progress + 25f, 100f);
            _networkClient?.SendMissionUpdate(missionId, newProgress);

            if (newProgress >= 100f)
            {
                Debug.Log($"完成任务: {_mission.Title}, 获得 {_mission.RewardPoints} 积分");
            }
            else
            {
                Debug.Log($"任务进度: {_mission.Title} - {newProgress:F0}%");
            }
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(transform.position, interactionRadius);
        }

        private void OnDestroy()
        {
            if (_gameState != null)
            {
                _gameState.OnMissionUpdated -= OnMissionUpdated;
            }
        }
    }
}
