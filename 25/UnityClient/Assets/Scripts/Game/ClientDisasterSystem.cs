
using System.Collections.Generic;
using UnityEngine;
using PolarShared.Models;
using PolarShared.Enums;
using PolarClient.Core;

namespace PolarClient.Game
{
    public class ClientDisasterSystem : MonoBehaviour
    {
        private readonly List<DisasterEvent> _activeDisasters = new();
        private readonly object _lock = new();

        [Header("视觉效果")]
        public GameObject? iceCrackPrefab;
        public GameObject? avalanchePrefab;
        public GameObject? polarStormPrefab;
        public GameObject? disasterWarningPrefab;

        [Header("性能")]
        public float updateInterval = 0.1f;
        public float cullDistance = 300f;

        private float _lastUpdateTime;
        private Camera? _mainCamera;

        public event Action<DisasterEvent>? OnDisasterStarted;
        public event Action<DisasterEvent>? OnDisasterEnded;
        public event Action<string, DisasterSeverity>? OnWarning;

        public List<DisasterEvent> ActiveDisasters
        {
            get
            {
                lock (_lock)
                {
                    return new List<DisasterEvent>(_activeDisasters);
                }
            }
        }

        private void Start()
        {
            _mainCamera = Camera.main;
        }

        public void HandleDiscreteEvent(DiscreteEventData eventData)
        {
            if (eventData == null || eventData.Disaster == null) return;

            if (eventData.EventType == 0)
            {
                StartDisaster(eventData.Disaster);
                OnWarning?.Invoke(eventData.Message, eventData.Disaster.Severity);
            }
            else if (eventData.EventType == 1)
            {
                EndDisaster(eventData.Disaster.Type);
            }
        }

        private void StartDisaster(DisasterEvent disaster)
        {
            lock (_lock)
            {
                _activeDisasters.Add(disaster);
            }

            OnDisasterStarted?.Invoke(disaster);
            ShowDisasterVisual(disaster);
            ShowWarningUI(disaster);

            Debug.Log($"[Disaster] {disaster.Type} [{disaster.Severity}] 开始于 ({disaster.Position.X:F1}, {disaster.Position.Z:F1})");
        }

        private void EndDisaster(DisasterType type)
        {
            lock (_lock)
            {
                var toRemove = _activeDisasters.FindAll(d => d.Type == type);
                foreach (var d in toRemove)
                {
                    _activeDisasters.Remove(d);
                    OnDisasterEnded?.Invoke(d);
                    HideDisasterVisual(d);
                }
            }

            Debug.Log($"[Disaster] {type} 已结束");
        }

        private void ShowDisasterVisual(DisasterEvent disaster)
        {
            if (_mainCamera == null) return;

            var distance = Vector3.Distance(
                _mainCamera.transform.position,
                new Vector3(disaster.Position.X, disaster.Position.Y, disaster.Position.Z)
            );

            if (distance > cullDistance) return;

            GameObject? prefab = disaster.Type switch
            {
                DisasterType.IceCrack => iceCrackPrefab,
                DisasterType.Avalanche => avalanchePrefab,
                DisasterType.PolarStorm => polarStormPrefab,
                DisasterType.Blizzard => polarStormPrefab,
                DisasterType.Whiteout => polarStormPrefab,
                DisasterType.IceQuake => iceCrackPrefab,
                _ => null
            };

            if (prefab != null)
            {
                var go = Instantiate(
                    prefab,
                    new Vector3(disaster.Position.X, disaster.Position.Y, disaster.Position.Z),
                    Quaternion.identity
                );

                var duration = disaster.Duration > 0 ? disaster.Duration : 30f;
                Destroy(go, duration);
            }
        }

        private void HideDisasterVisual(DisasterEvent disaster)
        {
        }

        private void ShowWarningUI(DisasterEvent disaster)
        {
            if (disasterWarningPrefab != null)
            {
                var go = Instantiate(disasterWarningPrefab);
                if (go.TryGetComponent<DisasterWarningUI>(out var warning))
                {
                    warning.Initialize(disaster);
                }
                Destroy(go, 5f);
            }
        }

        private void Update()
        {
            if (Time.time - _lastUpdateTime < updateInterval) return;
            _lastUpdateTime = Time.time;

            var now = System.DateTime.UtcNow.Ticks;

            lock (_lock)
            {
                for (var i = _activeDisasters.Count - 1; i >= 0; i--)
                {
                    if (!_activeDisasters[i].IsActive(now))
                    {
                        var disaster = _activeDisasters[i];
                        _activeDisasters.RemoveAt(i);
                        OnDisasterEnded?.Invoke(disaster);
                    }
                }
            }
        }

        public float GetPlayerDisasterIntensity(Vector3 playerPos)
        {
            var maxIntensity = 0f;
            var now = System.DateTime.UtcNow.Ticks;

            lock (_lock)
            {
                foreach (var disaster in _activeDisasters)
                {
                    if (!disaster.IsActive(now)) continue;

                    var disasterPos = new Vector3(disaster.Position.X, disaster.Position.Y, disaster.Position.Z);
                    var distance = Vector3.Distance(playerPos, disasterPos);

                    if (distance <= disaster.Radius)
                    {
                        var distanceFactor = 1f - (distance / disaster.Radius);
                        var intensity = disaster.GetIntensity(now) * distanceFactor;
                        maxIntensity = Mathf.Max(maxIntensity, intensity);
                    }
                }
            }

            return maxIntensity;
        }

        public void ClearAllDisasters()
        {
            lock (_lock)
            {
                foreach (var d in _activeDisasters)
                {
                    OnDisasterEnded?.Invoke(d);
                }
                _activeDisasters.Clear();
            }
        }
    }

    public class DisasterWarningUI : MonoBehaviour
    {
        private DisasterEvent? _disaster;

        public void Initialize(DisasterEvent disaster)
        {
            _disaster = disaster;

            var color = disaster.Severity switch
            {
                DisasterSeverity.Mild => Color.yellow,
                DisasterSeverity.Moderate => new Color(1f, 0.5f, 0f),
                DisasterSeverity.Severe => Color.red,
                DisasterSeverity.Critical => Color.magenta,
                _ => Color.white
            };

            Debug.Log($"[Warning] [{disaster.Severity}] {disaster.Description}");
        }
    }
}
