
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PolarClient.Core
{
    public class ObjectPool<T> where T : MonoBehaviour
    {
        private readonly Stack<T> _pool;
        private readonly Func<T> _createFunc;
        private readonly Action<T>? _onGet;
        private readonly Action<T>? _onReturn;
        private readonly int _maxSize;

        public int Count => _pool.Count;
        public int MaxSize => _maxSize;

        public ObjectPool(Func<T> createFunc, Action<T>? onGet = null, Action<T>? onReturn = null,
            int initialSize = 10, int maxSize = 100)
        {
            _pool = new Stack<T>();
            _createFunc = createFunc ?? throw new ArgumentNullException(nameof(createFunc));
            _onGet = onGet;
            _onReturn = onReturn;
            _maxSize = maxSize;

            PreWarm(initialSize);
        }

        private void PreWarm(int count)
        {
            for (var i = 0; i < count; i++)
            {
                var obj = _createFunc();
                obj.gameObject.SetActive(false);
                _pool.Push(obj);
            }
        }

        public T Get()
        {
            T obj;
            if (_pool.Count > 0)
            {
                obj = _pool.Pop();
            }
            else
            {
                obj = _createFunc();
            }

            obj.gameObject.SetActive(true);
            _onGet?.Invoke(obj);
            return obj;
        }

        public void Return(T obj)
        {
            if (obj == null) return;

            if (_pool.Count >= _maxSize)
            {
                UnityEngine.Object.Destroy(obj.gameObject);
                return;
            }

            _onReturn?.Invoke(obj);
            obj.gameObject.SetActive(false);
            _pool.Push(obj);
        }

        public void Clear()
        {
            foreach (var obj in _pool)
            {
                if (obj != null)
                {
                    UnityEngine.Object.Destroy(obj.gameObject);
                }
            }
            _pool.Clear();
        }
    }

    public class ObjectPoolManager : MonoBehaviour
    {
        private readonly Dictionary<string, object> _pools = new();
        private static ObjectPoolManager? _instance;

        public static ObjectPoolManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    var go = new GameObject("ObjectPoolManager");
                    _instance = go.AddComponent<ObjectPoolManager>();
                    DontDestroyOnLoad(go);
                }
                return _instance;
            }
        }

        public void CreatePool<T>(string poolName, Func<T> createFunc, Action<T>? onGet = null,
            Action<T>? onReturn = null, int initialSize = 10, int maxSize = 100) where T : MonoBehaviour
        {
            if (_pools.ContainsKey(poolName))
            {
                Debug.LogWarning($"[ObjectPoolManager] 池 {poolName} 已存在");
                return;
            }

            var pool = new ObjectPool<T>(createFunc, onGet, onReturn, initialSize, maxSize);
            _pools[poolName] = pool;
        }

        public T? Get<T>(string poolName) where T : MonoBehaviour
        {
            if (_pools.TryGetValue(poolName, out var pool) && pool is ObjectPool<T> typedPool)
            {
                return typedPool.Get();
            }
            Debug.LogWarning($"[ObjectPoolManager] 池 {poolName} 不存在");
            return null;
        }

        public void Return<T>(string poolName, T obj) where T : MonoBehaviour
        {
            if (_pools.TryGetValue(poolName, out var pool) && pool is ObjectPool<T> typedPool)
            {
                typedPool.Return(obj);
                return;
            }
            Debug.LogWarning($"[ObjectPoolManager] 池 {poolName} 不存在，销毁对象");
            if (obj != null) Destroy(obj.gameObject);
        }

        public void ClearPool(string poolName)
        {
            if (_pools.TryGetValue(poolName, out var pool) && pool is IDisposable disposable)
            {
                disposable.Dispose();
                _pools.Remove(poolName);
            }
        }

        public void ClearAllPools()
        {
            foreach (var kvp in _pools)
            {
                if (kvp.Value is IDisposable disposable)
                {
                    disposable.Dispose();
                }
            }
            _pools.Clear();
        }

        private void OnDestroy()
        {
            ClearAllPools();
        }
    }
}
