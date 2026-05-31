
using System;
using System.Collections.Generic;
using PolarShared.Models;

namespace PolarShared.Network
{
    public class DeltaUpdateTracker
    {
        private readonly Dictionary<string, PlayerState> _lastPlayerStates = new();
        private readonly Dictionary<string, Vector3> _lastPlayerPositions = new();
        private readonly Dictionary<string, float> _lastPlayerRotations = new();
        private readonly Dictionary<string, float> _lastMissionProgress = new();
        private readonly Dictionary<string, int> _lastMissionStatus = new();

        private EnvironmentParameters _lastEnvironment = new();
        private readonly object _lock = new();

        private const float PositionEpsilon = 0.01f;
        private const float RotationEpsilon = 0.1f;
        private const float StateEpsilon = 0.1f;

        public PlayerPositionDelta? TrackPosition(string playerId, Vector3 newPosition, float newRotationY, long timestamp)
        {
            lock (_lock)
            {
                var delta = new PlayerPositionDelta
                {
                    PlayerId = playerId,
                    Timestamp = timestamp
                };

                if (!_lastPlayerPositions.TryGetValue(playerId, out var lastPos))
                {
                    delta.DeltaX = newPosition.X;
                    delta.DeltaY = newPosition.Y;
                    delta.DeltaZ = newPosition.Z;
                    delta.DeltaRotY = newRotationY;
                    _lastPlayerPositions[playerId] = newPosition;
                    _lastPlayerRotations[playerId] = newRotationY;
                    return delta;
                }

                if (Math.Abs(newPosition.X - lastPos.X) > PositionEpsilon)
                    delta.DeltaX = newPosition.X - lastPos.X;
                if (Math.Abs(newPosition.Y - lastPos.Y) > PositionEpsilon)
                    delta.DeltaY = newPosition.Y - lastPos.Y;
                if (Math.Abs(newPosition.Z - lastPos.Z) > PositionEpsilon)
                    delta.DeltaZ = newPosition.Z - lastPos.Z;
                if (Math.Abs(newRotationY - _lastPlayerRotations.GetValueOrDefault(playerId)) > RotationEpsilon)
                    delta.DeltaRotY = newRotationY - _lastPlayerRotations.GetValueOrDefault(playerId);

                if (delta.HasChanges)
                {
                    _lastPlayerPositions[playerId] = newPosition;
                    _lastPlayerRotations[playerId] = newRotationY;
                    return delta;
                }

                return null;
            }
        }

        public PlayerStateDelta? TrackPlayerState(string playerId, PlayerState newState, long timestamp)
        {
            lock (_lock)
            {
                var delta = new PlayerStateDelta
                {
                    PlayerId = playerId,
                    Timestamp = timestamp
                };

                if (!_lastPlayerStates.TryGetValue(playerId, out var lastState))
                {
                    delta.HealthDelta = newState.Health;
                    delta.WarmthDelta = newState.Warmth;
                    delta.EnergyDelta = newState.Energy;
                    _lastPlayerStates[playerId] = (PlayerState)newState.Clone();
                    return delta;
                }

                if (Math.Abs(newState.Health - lastState.Health) > StateEpsilon)
                    delta.HealthDelta = newState.Health - lastState.Health;
                if (Math.Abs(newState.Warmth - lastState.Warmth) > StateEpsilon)
                    delta.WarmthDelta = newState.Warmth - lastState.Warmth;
                if (Math.Abs(newState.Energy - lastState.Energy) > StateEpsilon)
                    delta.EnergyDelta = newState.Energy - lastState.Energy;

                if (delta.HasChanges)
                {
                    _lastPlayerStates[playerId] = (PlayerState)newState.Clone();
                    return delta;
                }

                return null;
            }
        }

        public EnvironmentDelta? TrackEnvironment(EnvironmentParameters newEnv, long timestamp)
        {
            lock (_lock)
            {
                var delta = new EnvironmentDelta
                {
                    Timestamp = timestamp
                };

                if (Math.Abs(newEnv.Temperature - _lastEnvironment.Temperature) > 0.1f)
                    delta.TemperatureDelta = newEnv.Temperature - _lastEnvironment.Temperature;
                if (Math.Abs(newEnv.WindSpeed - _lastEnvironment.WindSpeed) > 0.1f)
                    delta.WindSpeedDelta = newEnv.WindSpeed - _lastEnvironment.WindSpeed;
                if (Math.Abs(newEnv.SnowIntensity - _lastEnvironment.SnowIntensity) > 0.01f)
                    delta.SnowIntensityDelta = newEnv.SnowIntensity - _lastEnvironment.SnowIntensity;
                if (Math.Abs(newEnv.Visibility - _lastEnvironment.Visibility) > 1f)
                    delta.VisibilityDelta = newEnv.Visibility - _lastEnvironment.Visibility;
                if ((int)newEnv.CurrentWeather != (int)_lastEnvironment.CurrentWeather)
                    delta.WeatherType = (int)newEnv.CurrentWeather;

                if (delta.HasChanges)
                {
                    _lastEnvironment = (EnvironmentParameters)newEnv.Clone();
                    return delta;
                }

                return null;
            }
        }

        public MissionDelta? TrackMission(string missionId, float newProgress, int newStatus, long timestamp)
        {
            lock (_lock)
            {
                var delta = new MissionDelta
                {
                    MissionId = missionId,
                    Timestamp = timestamp
                };

                if (!_lastMissionProgress.TryGetValue(missionId, out var lastProgress))
                {
                    delta.ProgressDelta = newProgress;
                    delta.Status = newStatus;
                    _lastMissionProgress[missionId] = newProgress;
                    _lastMissionStatus[missionId] = newStatus;
                    return delta;
                }

                if (Math.Abs(newProgress - lastProgress) > 0.1f)
                    delta.ProgressDelta = newProgress - lastProgress;
                if (newStatus != _lastMissionStatus.GetValueOrDefault(missionId, -1))
                    delta.Status = newStatus;

                if (delta.HasChanges)
                {
                    _lastMissionProgress[missionId] = newProgress;
                    _lastMissionStatus[missionId] = newStatus;
                    return delta;
                }

                return null;
            }
        }

        public void Reset()
        {
            lock (_lock)
            {
                _lastPlayerStates.Clear();
                _lastPlayerPositions.Clear();
                _lastPlayerRotations.Clear();
                _lastMissionProgress.Clear();
                _lastMissionStatus.Clear();
                _lastEnvironment = new EnvironmentParameters();
            }
        }

        public void RemovePlayer(string playerId)
        {
            lock (_lock)
            {
                _lastPlayerStates.Remove(playerId);
                _lastPlayerPositions.Remove(playerId);
                _lastPlayerRotations.Remove(playerId);
            }
        }

        public Vector3 GetLastPosition(string playerId)
        {
            lock (_lock)
            {
                return _lastPlayerPositions.TryGetValue(playerId, out var pos) ? pos : new Vector3();
            }
        }

        public PlayerState GetLastState(string playerId)
        {
            lock (_lock)
            {
                return _lastPlayerStates.TryGetValue(playerId, out var state) ? state : new PlayerState();
            }
        }

        public float GetLastRotationY(string playerId)
        {
            lock (_lock)
            {
                return _lastPlayerRotations.TryGetValue(playerId, out var rot) ? rot : 0f;
            }
        }
    }
}
