
using System;
using System.Collections.Generic;
using PolarShared.Enums;
using PolarShared.Models;

namespace PolarServer.Game
{
    public class DisasterSystem
    {
        private readonly Random _random = new();
        private readonly List<DisasterEvent> _activeDisasters = new();
        private readonly object _lock = new();

        private double _disasterCheckInterval = 30;
        private double _disasterProbability = 0.15;
        private DateTime _lastCheck = DateTime.UtcNow;
        private DateTime _lastDisasterTime = DateTime.UtcNow.AddMinutes(-10);

        private readonly Dictionary<DisasterType, (string Description, float BaseRadius, float BaseDuration, float BaseDamage, int MinWeather)> _disasterConfigs = new()
        {
            { DisasterType.IceCrack, ("冰面裂缝正在扩散！小心脚下。", 15f, 20f, 8f, 0) },
            { DisasterType.Avalanche, ("雪崩来袭！立即寻找掩体躲避！", 40f, 15f, 25f, 1) },
            { DisasterType.PolarStorm, ("极地风暴逼近！返回基地避风！", 100f, 45f, 12f, 2) },
            { DisasterType.Blizzard, ("暴风雪即将到来！能见度急剧下降。", 80f, 60f, 10f, 2) },
            { DisasterType.Whiteout, ("白化天气！注意不要迷失方向。", 120f, 30f, 5f, 1) },
            { DisasterType.IceQuake, ("冰震发生！冰面不稳定，注意坠落！", 30f, 10f, 15f, 0) }
        };

        public event Action<DisasterEvent>? OnDisasterStarted;
        public event Action<DisasterEvent>? OnDisasterEnded;
        public event Action<string, DisasterSeverity>? OnDisasterWarning;

        public List<DisasterEvent> ActiveDisasters
        {
            get
            {
                lock (_lock)
                {
                    var now = DateTime.UtcNow.Ticks;
                    return _activeDisasters.Where(d => d.IsActive(now)).ToList();
                }
            }
        }

        public DisasterSystem()
        {
        }

        public void Configure(double checkIntervalSeconds, double probability)
        {
            _disasterCheckInterval = checkIntervalSeconds;
            _disasterProbability = probability;
        }

        public void Update(EnvironmentParameters currentEnvironment, List<PlayerState> players)
        {
            var now = DateTime.UtcNow;

            CleanupExpiredDisasters(now.Ticks);

            if ((now - _lastCheck).TotalSeconds >= _disasterCheckInterval)
            {
                _lastCheck = now;
                TryTriggerDisaster(currentEnvironment, players);
            }

            ApplyDisasterDamage(now.Ticks, players);
        }

        private void TryTriggerDisaster(EnvironmentParameters currentEnvironment, List<PlayerState> players)
        {
            if (players.Count == 0) return;

            var now = DateTime.UtcNow;
            if ((now - _lastDisasterTime).TotalMinutes < 5) return;

            if (_random.NextDouble() > _disasterProbability) return;

            var weatherIndex = (int)currentEnvironment.CurrentWeather;
            var possibleDisasters = _disasterConfigs
                .Where(kvp => kvp.Value.MinWeather <= weatherIndex)
                .Select(kvp => kvp.Key)
                .ToList();

            if (possibleDisasters.Count == 0) return;

            var disasterType = possibleDisasters[_random.Next(possibleDisasters.Count)];
            var targetPlayer = players[_random.Next(players.Count)];
            var config = _disasterConfigs[disasterType];

            var severity = GenerateSeverity(currentEnvironment);
            var multiplier = severity switch
            {
                DisasterSeverity.Mild => 0.7f,
                DisasterSeverity.Moderate => 1.0f,
                DisasterSeverity.Severe => 1.3f,
                DisasterSeverity.Critical => 1.6f,
                _ => 1.0f
            };

            var disaster = new DisasterEvent
            {
                Type = disasterType,
                Severity = severity,
                Position = new Vector3
                {
                    X = targetPlayer.Position.X + (float)(_random.NextDouble() - 0.5) * 20,
                    Y = targetPlayer.Position.Y,
                    Z = targetPlayer.Position.Z + (float)(_random.NextDouble() - 0.5) * 20
                },
                Radius = config.BaseRadius * multiplier,
                Duration = config.BaseDuration * multiplier,
                DamagePerSecond = config.BaseDamage * multiplier,
                Description = config.Description,
                StartTime = now.Ticks,
                EndTime = now.AddSeconds(config.BaseDuration * multiplier).Ticks
            };

            OnDisasterWarning?.Invoke($"警告：{config.Description}", severity);

            lock (_lock)
            {
                _activeDisasters.Add(disaster);
            }

            _lastDisasterTime = now;
            OnDisasterStarted?.Invoke(disaster);
        }

        private DisasterSeverity GenerateSeverity(EnvironmentParameters env)
        {
            var baseChance = _random.NextDouble();
            var modifier = (env.CalculateWindChill() + 40) / 80;
            modifier = Math.Clamp(modifier, 0, 1);

            var adjustedChance = baseChance + modifier * 0.3;

            return adjustedChance switch
            {
                < 0.4 => DisasterSeverity.Mild,
                < 0.7 => DisasterSeverity.Moderate,
                < 0.9 => DisasterSeverity.Severe,
                _ => DisasterSeverity.Critical
            };
        }

        private void CleanupExpiredDisasters(long now)
        {
            lock (_lock)
            {
                var expired = _activeDisasters.Where(d => !d.IsActive(now)).ToList();
                foreach (var disaster in expired)
                {
                    _activeDisasters.Remove(disaster);
                    OnDisasterEnded?.Invoke(disaster);
                }
            }
        }

        private void ApplyDisasterDamage(long now, List<PlayerState> players)
        {
            if (players.Count == 0) return;

            List<DisasterEvent> disasters;
            lock (_lock)
            {
                disasters = _activeDisasters.Where(d => d.IsActive(now)).ToList();
            }

            foreach (var disaster in disasters)
            {
                var intensity = disaster.GetIntensity(now);

                foreach (var player in players)
                {
                    if (!player.IsOnline) continue;

                    var distance = CalculateHorizontalDistance(player.Position, disaster.Position);

                    if (distance <= disaster.Radius)
                    {
                        var distanceFactor = 1f - (distance / disaster.Radius);
                        var damage = disaster.DamagePerSecond * intensity * distanceFactor * (_disasterCheckInterval / 60f);

                        player.Health = Math.Clamp(player.Health - damage, 0, 100);
                        player.Warmth = Math.Clamp(player.Warmth - damage * 0.5f, 0, 100);
                    }
                }
            }
        }

        private static float CalculateHorizontalDistance(Vector3 a, Vector3 b)
        {
            var dx = a.X - b.X;
            var dz = a.Z - b.Z;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        public DisasterEvent TriggerManualDisaster(DisasterType type, Vector3 position, DisasterSeverity severity)
        {
            if (!_disasterConfigs.TryGetValue(type, out var config))
                throw new ArgumentException($"未知灾害类型: {type}");

            var multiplier = severity switch
            {
                DisasterSeverity.Mild => 0.7f,
                DisasterSeverity.Moderate => 1.0f,
                DisasterSeverity.Severe => 1.3f,
                DisasterSeverity.Critical => 1.6f,
                _ => 1.0f
            };

            var now = DateTime.UtcNow;
            var disaster = new DisasterEvent
            {
                Type = type,
                Severity = severity,
                Position = position,
                Radius = config.BaseRadius * multiplier,
                Duration = config.BaseDuration * multiplier,
                DamagePerSecond = config.BaseDamage * multiplier,
                Description = config.Description,
                StartTime = now.Ticks,
                EndTime = now.AddSeconds(config.BaseDuration * multiplier).Ticks
            };

            lock (_lock)
            {
                _activeDisasters.Add(disaster);
            }

            _lastDisasterTime = now;
            OnDisasterWarning?.Invoke($"手动触发：{config.Description}", severity);
            OnDisasterStarted?.Invoke(disaster);

            return disaster;
        }

        public string GetStatusReport()
        {
            var active = ActiveDisasters;
            if (active.Count == 0)
                return "无活跃灾害";

            var report = $"活跃灾害 ({active.Count}):\n";
            foreach (var d in active)
            {
                var progress = d.GetProgress(DateTime.UtcNow.Ticks) * 100;
                report += $"  {d.Type} [{d.Severity}] 位置:({d.Position.X:F1},{d.Position.Z:F1}) 进度:{progress:F0}%\n";
            }
            return report;
        }
    }
}
