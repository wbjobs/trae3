
using System;
using System.Collections.Generic;
using PolarShared.Models;

namespace PolarClient.Core
{
    public interface IGameState
    {
        EnvironmentParameters CurrentEnvironment { get; }
        PlayerState LocalPlayerState { get; }
        IReadOnlyDictionary<string, PlayerState> RemotePlayers { get; }
        IReadOnlyDictionary<string, ResearchMission> Missions { get; }

        event Action<EnvironmentParameters>? OnEnvironmentUpdated;
        event Action<string, PlayerState>? OnPlayerUpdated;
        event Action<string>? OnPlayerRemoved;
        event Action<ResearchMission>? OnMissionUpdated;
        event Action? OnStateReset;

        PlayerState? GetPlayer(string playerId);
        ResearchMission? GetMission(string missionId);
        void UpdateLocalPlayerState(float health, float warmth, float energy);
        void ResetState();
    }
}
