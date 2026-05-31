
using System;
using PolarShared.Enums;
using PolarShared.Models;

namespace PolarClient.Core
{
    public interface IWeatherSystem
    {
        WeatherType CurrentWeather { get; }
        float CurrentVisibility { get; }

        event Action<WeatherType>? OnWeatherChanged;

        void UpdateWeather(EnvironmentParameters env);
        void ForceWeather(WeatherType weatherType);
        void SetWindOverride(bool enabled, float value = 0f);
        void SetSnowOverride(bool enabled, float value = 0f);
        void SetVisibilityOverride(bool enabled, float value = 0f);
        void ClearAllOverrides();
    }
}
