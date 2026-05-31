
using System;
using System.Collections.Generic;

namespace PolarClient.Core
{
    public static class ServiceLocator
    {
        private static readonly Dictionary<Type, object> _services = new Dictionary<Type, object>();
        private static readonly object _lock = new object();

        public static void Register<T>(T service) where T : class
        {
            if (service == null)
                throw new ArgumentNullException(nameof(service));

            lock (_lock)
            {
                var type = typeof(T);
                if (_services.ContainsKey(type))
                {
                    _services[type] = service;
                }
                else
                {
                    _services.Add(type, service);
                }
            }
        }

        public static T? Get<T>() where T : class
        {
            lock (_lock)
            {
                var type = typeof(T);
                if (_services.TryGetValue(type, out var service))
                {
                    return service as T;
                }
                return null;
            }
        }

        public static T GetRequired<T>() where T : class
        {
            var service = Get<T>();
            if (service == null)
            {
                throw new InvalidOperationException($"Service of type {typeof(T).Name} is not registered.");
            }
            return service;
        }

        public static bool IsRegistered<T>() where T : class
        {
            lock (_lock)
            {
                return _services.ContainsKey(typeof(T));
            }
        }

        public static void Unregister<T>() where T : class
        {
            lock (_lock)
            {
                _services.Remove(typeof(T));
            }
        }

        public static void Clear()
        {
            lock (_lock)
            {
                _services.Clear();
            }
        }
    }
}
