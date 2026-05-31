
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PolarClient.Core
{
    public class SpatialPartitioning<T> where T : class
    {
        private readonly Dictionary<Vector2Int, List<T>> _grid = new();
        private readonly Dictionary<T, Vector2Int> _objectCells = new();
        private readonly float _cellSize;
        private readonly object _lock = new();

        public SpatialPartitioning(float cellSize = 50f)
        {
            _cellSize = cellSize;
        }

        private Vector2Int GetCell(Vector3 position)
        {
            return new Vector2Int(
                Mathf.FloorToInt(position.x / _cellSize),
                Mathf.FloorToInt(position.z / _cellSize)
            );
        }

        public void Add(T obj, Vector3 position)
        {
            lock (_lock)
            {
                var cell = GetCell(position);
                if (!_grid.TryGetValue(cell, out var list))
                {
                    list = new List<T>();
                    _grid[cell] = list;
                }
                list.Add(obj);
                _objectCells[obj] = cell;
            }
        }

        public void UpdatePosition(T obj, Vector3 newPosition)
        {
            lock (_lock)
            {
                if (!_objectCells.TryGetValue(obj, out var oldCell)) return;

                var newCell = GetCell(newPosition);
                if (oldCell == newCell) return;

                if (_grid.TryGetValue(oldCell, out var oldList))
                {
                    oldList.Remove(obj);
                    if (oldList.Count == 0)
                        _grid.Remove(oldCell);
                }

                if (!_grid.TryGetValue(newCell, out var newList))
                {
                    newList = new List<T>();
                    _grid[newCell] = newList;
                }
                newList.Add(obj);
                _objectCells[obj] = newCell;
            }
        }

        public void Remove(T obj)
        {
            lock (_lock)
            {
                if (!_objectCells.TryGetValue(obj, out var cell)) return;

                if (_grid.TryGetValue(cell, out var list))
                {
                    list.Remove(obj);
                    if (list.Count == 0)
                        _grid.Remove(cell);
                }
                _objectCells.Remove(obj);
            }
        }

        public List<T> GetNearby(Vector3 position, float radius)
        {
            lock (_lock)
            {
                var result = new List<T>();
                var cellRadius = Mathf.CeilToInt(radius / _cellSize);
                var center = GetCell(position);

                for (var dx = -cellRadius; dx <= cellRadius; dx++)
                {
                    for (var dz = -cellRadius; dz <= cellRadius; dz++)
                    {
                        var cell = new Vector2Int(center.x + dx, center.y + dz);
                        if (_grid.TryGetValue(cell, out var objects))
                        {
                            result.AddRange(objects);
                        }
                    }
                }

                return result;
            }
        }

        public void Clear()
        {
            lock (_lock)
            {
                _grid.Clear();
                _objectCells.Clear();
            }
        }
    }

    public class FrameRateSmoother : MonoBehaviour
    {
        [Header("帧率设置")]
        public int targetFrameRate = 60;
        public float maxFrameTime = 0.033f;
        public bool enableVSync = true;

        [Header("平滑参数")]
        public int frameSamples = 30;
        public float heavyWorkThreshold = 0.016f;

        private readonly Queue<float> _frameTimes = new();
        private float _averageFrameTime;
        private float _smoothedDeltaTime;
        private int _currentFrame;

        public float AverageFrameRate => 1f / Mathf.Max(_averageFrameTime, 0.001f);
        public float SmoothedDeltaTime => _smoothedDeltaTime;
        public float CurrentFrameTime { get; private set; }

        private static FrameRateSmoother? _instance;
        public static FrameRateSmoother Instance
        {
            get
            {
                if (_instance == null)
                {
                    var go = new GameObject("FrameRateSmoother");
                    _instance = go.AddComponent<FrameRateSmoother>();
                    DontDestroyOnLoad(go);
                }
                return _instance;
            }
        }

        private void Awake()
        {
            Application.targetFrameRate = targetFrameRate;
            QualitySettings.vSyncCount = enableVSync ? 1 : 0;
        }

        private void Update()
        {
            _currentFrame = Time.frameCount;
            var unscaledDelta = Time.unscaledDeltaTime;

            _frameTimes.Enqueue(unscaledDelta);
            while (_frameTimes.Count > frameSamples)
            {
                _frameTimes.Dequeue();
            }

            var sum = 0f;
            foreach (var t in _frameTimes) sum += t;
            _averageFrameTime = sum / _frameTimes.Count;

            _smoothedDeltaTime = Mathf.Min(Time.deltaTime, maxFrameTime);

            if (_averageFrameTime > heavyWorkThreshold)
            {
                ReduceBackgroundWork();
            }
            else
            {
                RestoreBackgroundWork();
            }
        }

        private void ReduceBackgroundWork()
        {
            if (Time.fixedDeltaTime < 0.02f)
            {
                Time.fixedDeltaTime = Mathf.Min(Time.fixedDeltaTime * 1.1f, 0.033f);
            }
        }

        private void RestoreBackgroundWork()
        {
            if (Time.fixedDeltaTime > 0.02f)
            {
                Time.fixedDeltaTime = Mathf.Max(Time.fixedDeltaTime * 0.9f, 0.02f);
            }
        }

        public float GetSmoothDeltaTime(float maxDelta = 0.033f)
        {
            return Mathf.Min(Time.deltaTime, maxDelta);
        }

        public bool ShouldSkipHeavyWork(int workInterval = 2)
        {
            return _averageFrameTime > heavyWorkThreshold && _currentFrame % workInterval != 0;
        }

        public void SetTargetFrameRate(int fps)
        {
            targetFrameRate = fps;
            Application.targetFrameRate = fps;
        }
    }

    public class LODController : MonoBehaviour
    {
        [Header("LOD 设置")]
        public float lod0Distance = 20f;
        public float lod1Distance = 50f;
        public float lod2Distance = 100f;
        public float cullDistance = 200f;

        [Header("状态")]
        public int currentLOD;
        public bool isCulled;

        public event Action<int>? OnLODChanged;
        public event Action<bool>? OnCullStateChanged;

        private Transform? _cameraTransform;
        private float _lastCheckTime;
        private float _checkInterval = 0.2f;

        private void Start()
        {
            _cameraTransform = Camera.main?.transform;
        }

        private void Update()
        {
            if (_cameraTransform == null)
            {
                _cameraTransform = Camera.main?.transform;
                return;
            }

            if (Time.time - _lastCheckTime < _checkInterval) return;
            _lastCheckTime = Time.time;

            var distance = Vector3.Distance(transform.position, _cameraTransform.position);
            var newLOD = 0;
            var newCulled = distance > cullDistance;

            if (distance > lod2Distance) newLOD = 2;
            else if (distance > lod1Distance) newLOD = 1;
            else if (distance > lod0Distance) newLOD = 0;

            if (newLOD != currentLOD)
            {
                currentLOD = newLOD;
                OnLODChanged?.Invoke(currentLOD);
                ApplyLOD(currentLOD);
            }

            if (newCulled != isCulled)
            {
                isCulled = newCulled;
                OnCullStateChanged?.Invoke(isCulled);
                gameObject.SetActive(!isCulled);
            }
        }

        private void ApplyLOD(int lod)
        {
            var renderers = GetComponentsInChildren<Renderer>();
            foreach (var r in renderers)
            {
                if (r is MeshRenderer mr)
                {
                    var materials = mr.materials;
                    foreach (var mat in materials)
                    {
                        mat.shadowCastingMode = lod switch
                        {
                            0 => UnityEngine.Rendering.ShadowCastingMode.On,
                            1 => UnityEngine.Rendering.ShadowCastingMode.Off,
                            _ => UnityEngine.Rendering.ShadowCastingMode.Off
                        };
                    }
                }
            }

            var particles = GetComponentsInChildren<ParticleSystem>();
            foreach (var ps in particles)
            {
                var emission = ps.emission;
                emission.rateOverTime = lod switch
                {
                    0 => emission.rateOverTime.constant,
                    1 => emission.rateOverTime.constant * 0.5f,
                    _ => 0f
                };
            }
        }
    }
}
