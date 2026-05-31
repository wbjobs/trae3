using System;
using System.Collections.Generic;
using Shared.Proto;
using UnityEngine;

namespace Client.SceneLogic
{
    public class EnvironmentManager : MonoBehaviour
    {
        public float TimeOfDay { get; private set; }
        public WeatherType WeatherType { get; private set; } = WeatherType.Clear;
        public float Temperature { get; private set; } = 22f;
        public float Humidity { get; private set; } = 0.5f;

        [SerializeField] private Light _directionalLight;
        [SerializeField] private ParticleSystem _rainParticles;
        [SerializeField] private ParticleSystem _fogParticles;
        [SerializeField] private Light _ambientLight;

        private WeatherType _targetWeather;
        private float _weatherTransitionProgress = 1f;
        private float _weatherTransitionDuration = 30f;
        private float _weatherIntensity;
        private float _currentRainRate;
        private float _targetRainRate;
        private float _currentFogRate;
        private float _targetFogRate;
        private float _currentSunIntensity;
        private float _targetSunIntensity;

        private const float SunriseHour = 6f;
        private const float SunsetHour = 18f;

        private void Update()
        {
            if (_weatherTransitionProgress < 1f)
            {
                _weatherTransitionProgress += Time.deltaTime / _weatherTransitionDuration;
                if (_weatherTransitionProgress >= 1f)
                {
                    _weatherTransitionProgress = 1f;
                    WeatherType = _targetWeather;
                }
                UpdateWeatherTransition();
            }
            UpdateLighting();
            UpdateWeatherEffects();
        }

        public void ApplySceneState(SceneStateData state)
        {
            if (state == null) return;

            TimeOfDay = state.TimeOfDay;
            Temperature = state.Temperature;
            Humidity = state.Humidity;

            if (Enum.TryParse<WeatherType>(state.WeatherType, out var parsedWeather))
            {
                WeatherType = parsedWeather;
                _targetWeather = parsedWeather;
                _weatherTransitionProgress = 1f;
                SetWeatherTargets(parsedWeather, 1f);
            }

            UpdateLighting();
            UpdateWeatherEffects();
        }

        public void StartWeatherTransition(WeatherUpdatePayload update)
        {
            if (update == null) return;

            _targetWeather = update.TargetWeather;
            _weatherTransitionDuration = update.TransitionDuration;
            _weatherTransitionProgress = 0f;
            _weatherIntensity = update.Intensity;

            SetWeatherTargets(_targetWeather, _weatherIntensity);
            Debug.Log($"[Weather] Transitioning to {_targetWeather} over {_weatherTransitionDuration:F1}s");
        }

        private void SetWeatherTargets(WeatherType weather, float intensity)
        {
            switch (weather)
            {
                case WeatherType.Clear:
                    _targetRainRate = 0f;
                    _targetFogRate = 0f;
                    _targetSunIntensity = 1f;
                    break;
                case WeatherType.Cloudy:
                    _targetRainRate = 0f;
                    _targetFogRate = 5f;
                    _targetSunIntensity = 0.7f;
                    break;
                case WeatherType.Rainy:
                    _targetRainRate = 200f * intensity;
                    _targetFogRate = 10f;
                    _targetSunIntensity = 0.4f;
                    break;
                case WeatherType.Foggy:
                    _targetRainRate = 0f;
                    _targetFogRate = 80f;
                    _targetSunIntensity = 0.3f;
                    break;
                case WeatherType.Stormy:
                    _targetRainRate = 400f * intensity;
                    _targetFogRate = 30f;
                    _targetSunIntensity = 0.2f;
                    break;
            }
        }

        private void UpdateWeatherTransition()
        {
            float t = _weatherTransitionProgress;
            _currentRainRate = Mathf.Lerp(_currentRainRate, _targetRainRate, t);
            _currentFogRate = Mathf.Lerp(_currentFogRate, _targetFogRate, t);
            _currentSunIntensity = Mathf.Lerp(_currentSunIntensity, _targetSunIntensity, t);
        }

        private void UpdateLighting()
        {
            if (_directionalLight == null) return;

            float sunAngle;
            float baseIntensity;

            if (TimeOfDay >= SunriseHour && TimeOfDay <= SunsetHour)
            {
                float t = (TimeOfDay - SunriseHour) / (SunsetHour - SunriseHour);
                sunAngle = Mathf.Lerp(0f, 180f, t);
                baseIntensity = Mathf.Lerp(0.3f, 1f, Mathf.Sin(t * Mathf.PI));
            }
            else
            {
                float nightT;
                if (TimeOfDay > SunsetHour)
                    nightT = (TimeOfDay - SunsetHour) / (24f - SunsetHour + SunriseHour);
                else
                    nightT = (TimeOfDay + 24f - SunsetHour) / (24f - SunsetHour + SunriseHour);
                sunAngle = 180f + nightT * 180f;
                baseIntensity = 0.05f;
            }

            float finalIntensity = baseIntensity * _currentSunIntensity;
            _directionalLight.transform.rotation = Quaternion.Euler(sunAngle, 30f, 0f);
            _directionalLight.intensity = Mathf.Lerp(_directionalLight.intensity, finalIntensity, 2f * Time.deltaTime);

            if (TimeOfDay >= SunriseHour && TimeOfDay < SunriseHour + 1f)
            {
                _directionalLight.color = Color.Lerp(new Color(1f, 0.7f, 0.5f), Color.white, TimeOfDay - SunriseHour);
            }
            else if (TimeOfDay >= SunsetHour - 1f && TimeOfDay <= SunsetHour)
            {
                _directionalLight.color = Color.Lerp(Color.white, new Color(1f, 0.5f, 0.3f), TimeOfDay - (SunsetHour - 1f));
            }
            else if (TimeOfDay > SunsetHour || TimeOfDay < SunriseHour)
            {
                _directionalLight.color = new Color(0.4f, 0.4f, 0.8f);
            }
            else
            {
                _directionalLight.color = Color.Lerp(_directionalLight.color, Color.white, 2f * Time.deltaTime);
            }
        }

        private void UpdateWeatherEffects()
        {
            if (_rainParticles != null)
            {
                var rainEmission = _rainParticles.emission;
                rainEmission.rateOverTime = _currentRainRate;
            }

            if (_fogParticles != null)
            {
                var fogEmission = _fogParticles.emission;
                fogEmission.rateOverTime = _currentFogRate;
            }
        }

        public SceneStateData GetCurrentState()
        {
            return new SceneStateData
            {
                SceneId = "mystic_realm_01",
                TimeOfDay = TimeOfDay,
                WeatherType = WeatherType.ToString(),
                Temperature = Temperature,
                Humidity = Humidity
            };
        }
    }
}
