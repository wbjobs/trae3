
using System.Collections.Concurrent;
using PolarShared.Models;
using PolarShared.Enums;
using PolarShared.Network;

namespace PolarServer.Game;

public class GameStateManager
{
    private readonly ConcurrentDictionary<string, PlayerState> _players;
    private readonly ConcurrentDictionary<string, ResearchMission> _missions;
    private readonly EnvironmentParameters _environment;
    private readonly object _environmentLock = new object();

    public event Action<string, PlayerState>? OnPlayerUpdated;
    public event Action<EnvironmentParameters>? OnEnvironmentUpdated;
    public event Action<ResearchMission>? OnMissionUpdated;

    public GameStateManager()
    {
        _players = new ConcurrentDictionary<string, PlayerState>();
        _missions = new ConcurrentDictionary<string, ResearchMission>();
        _environment = new EnvironmentParameters();
    }

    public PlayerState AddPlayer(string playerId, string playerName)
    {
        var player = new PlayerState
        {
            PlayerId = playerId,
            PlayerName = playerName,
            Position = new Vector3(0, 0, 0),
            IsOnline = true,
            LastUpdate = DateTime.Now
        };

        _players.TryAdd(playerId, player);
        OnPlayerUpdated?.Invoke(playerId, player);
        return player;
    }

    public void RemovePlayer(string playerId)
    {
        if (_players.TryRemove(playerId, out var player))
        {
            player.IsOnline = false;
            OnPlayerUpdated?.Invoke(playerId, player);
        }
    }

    public void UpdatePlayerPosition(string playerId, Vector3 position, Vector3 rotation)
    {
        if (_players.TryGetValue(playerId, out var player))
        {
            player.Position = position;
            player.Rotation = rotation;
            player.LastUpdate = DateTime.Now;
            OnPlayerUpdated?.Invoke(playerId, player);
        }
    }

    public void UpdatePlayerState(string playerId, float health, float warmth, float energy)
    {
        if (_players.TryGetValue(playerId, out var player))
        {
            player.Health = Math.Clamp(health, 0, 100);
            player.Warmth = Math.Clamp(warmth, 0, 100);
            player.Energy = Math.Clamp(energy, 0, 100);
            player.LastUpdate = DateTime.Now;
            OnPlayerUpdated?.Invoke(playerId, player);
        }
    }

    public PlayerState? GetPlayer(string playerId)
    {
        return _players.TryGetValue(playerId, out var player) ? player : null;
    }

    public List<PlayerState> GetAllPlayers()
    {
        return _players.Values.Where(p => p.IsOnline).ToList();
    }

    public EnvironmentParameters GetEnvironment()
    {
        lock (_environmentLock)
        {
            return new EnvironmentParameters
            {
                Temperature = _environment.Temperature,
                WindSpeed = _environment.WindSpeed,
                SnowIntensity = _environment.SnowIntensity,
                Visibility = _environment.Visibility,
                CurrentWeather = _environment.CurrentWeather,
                LastUpdate = _environment.LastUpdate
            };
        }
    }

    public void UpdateEnvironment(EnvironmentParameters newEnv)
    {
        lock (_environmentLock)
        {
            _environment.Temperature = newEnv.Temperature;
            _environment.WindSpeed = newEnv.WindSpeed;
            _environment.SnowIntensity = newEnv.SnowIntensity;
            _environment.Visibility = newEnv.Visibility;
            _environment.CurrentWeather = newEnv.CurrentWeather;
            _environment.LastUpdate = DateTime.Now;
        }
        OnEnvironmentUpdated?.Invoke(GetEnvironment());
    }

    public ResearchMission AddMission(string title, string description, Vector3 targetLocation, int rewardPoints)
    {
        var missionId = Guid.NewGuid().ToString();
        var mission = new ResearchMission
        {
            MissionId = missionId,
            Title = title,
            Description = description,
            TargetLocation = targetLocation,
            RewardPoints = rewardPoints,
            Status = MissionStatus.NotStarted,
            CreatedAt = DateTime.Now
        };

        _missions.TryAdd(missionId, mission);
        OnMissionUpdated?.Invoke(mission);
        return mission;
    }

    public void UpdateMissionProgress(string missionId, float progress)
    {
        if (_missions.TryGetValue(missionId, out var mission))
        {
            mission.Progress = Math.Clamp(progress, 0, 100);
            if (mission.Progress >= 100)
            {
                mission.Status = MissionStatus.Completed;
                mission.CompletedAt = DateTime.Now;
            }
            else if (mission.Status == MissionStatus.NotStarted)
            {
                mission.Status = MissionStatus.InProgress;
            }
            OnMissionUpdated?.Invoke(mission);
        }
    }

    public void AssignPlayerToMission(string missionId, string playerId)
    {
        if (_missions.TryGetValue(missionId, out var mission))
        {
            if (!mission.AssignedPlayers.Contains(playerId))
            {
                mission.AssignedPlayers.Add(playerId);
                OnMissionUpdated?.Invoke(mission);
            }
        }
    }

    public List<ResearchMission> GetAllMissions()
    {
        return _missions.Values.ToList();
    }

    public ResearchMission? GetMission(string missionId)
    {
        return _missions.TryGetValue(missionId, out var mission) ? mission : null;
    }
}
