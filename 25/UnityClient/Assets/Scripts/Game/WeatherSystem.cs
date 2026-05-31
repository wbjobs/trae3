
using UnityEngine;
using PolarShared.Enums;
using PolarShared.Models;
using PolarClient.Core;

namespace PolarClient.Game
{
    public class WeatherSystem : MonoBehaviour, IWeatherSystem
    {
        [Header("粒子系统")]
        public ParticleSystem snowParticles;
        public ParticleSystem windParticles;
        public ParticleSystem blizzardParticles;

        [Header("灯光")]
        public Light directionalLight;
        public Color clearColor = new Color(0.8f, 0.9f, 1.0f);
        public Color snowColor = new Color(0.5f, 0.55f, 0.6f);
        public Color blizzardColor = new Color(0.3f, 0.3f, 0.35f);

        [Header("雾效")]
        public Color clearFogColor = new Color(0.7f, 0.8f, 0.9f);
        public Color snowFogColor = new Color(0.6f, 0.65f, 0.7f);
        public Color blizzardFogColor = new Color(0.4f, 0.4f, 0.45f);

        [Header("音频")]
        public AudioSource windAudio;
        public AudioSource blizzardAudio;

        [Header("过渡设置")]
        public float transitionSpeed = 2.0f;

        public WeatherType CurrentWeather { get; private set; } = WeatherType.Clear;
        public float CurrentVisibility { get; private set; } = 100f;

        public event Action<WeatherType>? OnWeatherChanged;

        private WeatherType _targetWeather;
        private float _targetVisibility;
        private float _targetWindSpeed;
        private float _targetSnowIntensity;

        private Color _targetFogColor;
        private float _targetFogDensity;
        private Color _targetLightColor;
        private float _targetLightIntensity;
        private float _targetWindVolume;
        private float _targetBlizzardVolume;

        private float _currentSnowEmission;
        private float _targetSnowEmission;
        private float _currentWindEmission;
        private float _targetWindEmission;
        private float _currentBlizzardEmission;
        private float _targetBlizzardEmission;

        private bool _isInitialized;
        private IGameState? _gameState;

        private bool _windOverride;
        private float _windOverrideValue;
        private bool _snowOverride;
        private float _snowOverrideValue;
        private bool _visibilityOverride;
        private float _visibilityOverrideValue;

        private void Awake()
        {
            ServiceLocator.Register<IWeatherSystem>(this);
        }

        private void Start()
        {
            _gameState = ServiceLocator.Get<IGameState>();
            if (_gameState != null)
            {
                _gameState.OnEnvironmentUpdated += OnEnvironmentUpdated;
                _gameState.OnStateReset += OnStateReset;
            }

            InitializeWeather();
        }

        private void InitializeWeather()
        {
            CurrentWeather = WeatherType.Clear;
            _targetWeather = WeatherType.Clear;
            CurrentVisibility = 100f;
            _targetVisibility = 100f;
            _targetWindSpeed = 0f;
            _targetSnowIntensity = 0f;

            _targetFogColor = clearFogColor;
            _targetFogDensity = 0.005f;
            _targetLightColor = clearColor;
            _targetLightIntensity = 1.0f;
            _targetWindVolume = 0f;
            _targetBlizzardVolume = 0f;

            RenderSettings.fogColor = clearFogColor;
            RenderSettings.fogDensity = 0.005f;

            if (directionalLight != null)
            {
                directionalLight.color = clearColor;
                directionalLight.intensity = 1.0f;
            }

            SetParticleSystemEmission(snowParticles, false, 0);
            SetParticleSystemEmission(windParticles, false, 0);
            SetParticleSystemEmission(blizzardParticles, false, 0);

            _currentSnowEmission = 0;
            _currentWindEmission = 0;
            _currentBlizzardEmission = 0;
            _targetSnowEmission = 0;
            _targetWindEmission = 0;
            _targetBlizzardEmission = 0;

            if (windAudio != null)
            {
                windAudio.volume = 0;
                windAudio.Play();
            }
            if (blizzardAudio != null)
            {
                blizzardAudio.volume = 0;
                blizzardAudio.Play();
            }

            _isInitialized = true;
        }

        private void OnEnvironmentUpdated(EnvironmentParameters env)
        {
            UpdateWeather(env);
        }

        private void OnStateReset()
        {
            InitializeWeather();
        }

        public void UpdateWeather(EnvironmentParameters env)
        {
            if (env.CurrentWeather != _targetWeather)
            {
                _targetWeather = env.CurrentWeather;
                OnWeatherChanged?.Invoke(_targetWeather);
                Debug.Log($"[WeatherSystem] 天气变化: {CurrentWeather} -> {_targetWeather}");
            }

            _targetVisibility = env.Visibility;
            _targetWindSpeed = env.WindSpeed;
            _targetSnowIntensity = env.SnowIntensity;

            if (_windOverride) _targetWindSpeed = _windOverrideValue;
            if (_snowOverride) _targetSnowIntensity = _snowOverrideValue;
            if (_visibilityOverride) _targetVisibility = _visibilityOverrideValue;

            CalculateTargets();
        }

        public void ForceWeather(WeatherType weatherType)
        {
            _targetWeather = weatherType;
            OnWeatherChanged?.Invoke(_targetWeather);
            CalculateTargets();
        }

        public void SetWindOverride(bool enabled, float value = 0f)
        {
            _windOverride = enabled;
            _windOverrideValue = value;
        }

        public void SetSnowOverride(bool enabled, float value = 0f)
        {
            _snowOverride = enabled;
            _snowOverrideValue = value;
        }

        public void SetVisibilityOverride(bool enabled, float value = 0f)
        {
            _visibilityOverride = enabled;
            _visibilityOverrideValue = value;
        }

        public void ClearAllOverrides()
        {
            _windOverride = false;
            _snowOverride = false;
            _visibilityOverride = false;
        }

        private void CalculateTargets()
        {
            switch (_targetWeather)
            {
                case WeatherType.Clear:
                    _targetFogColor = clearFogColor;
                    _targetFogDensity = 0.005f;
                    _targetLightColor = clearColor;
                    _targetLightIntensity = 1.0f;
                    _targetWindVolume = 0f;
                    _targetBlizzardVolume = 0f;
                    _targetSnowEmission = 0;
                    _targetWindEmission = 0;
                    _targetBlizzardEmission = 0;
                    break;

                case WeatherType.LightSnow:
                    _targetFogColor = snowFogColor;
                    _targetFogDensity = 0.01f + _targetSnowIntensity * 0.01f;
                    _targetLightColor = snowColor;
                    _targetLightIntensity = 0.7f;
                    _targetWindVolume = _targetSnowIntensity * 0.3f;
                    _targetBlizzardVolume = 0f;
                    _targetSnowEmission = _targetSnowIntensity * 500;
                    _targetWindEmission = 0;
                    _targetBlizzardEmission = 0;
                    break;

                case WeatherType.HeavySnow:
                    _targetFogColor = snowFogColor;
                    _targetFogDensity = 0.02f + _targetSnowIntensity * 0.02f;
                    _targetLightColor = snowColor;
                    _targetLightIntensity = 0.5f;
                    _targetWindVolume = 0.5f + _targetSnowIntensity * 0.3f;
                    _targetBlizzardVolume = 0f;
                    _targetSnowEmission = _targetSnowIntensity * 1000;
                    _targetWindEmission = _targetSnowIntensity * 200;
                    _targetBlizzardEmission = 0;
                    break;

                case WeatherType.Blizzard:
                    _targetFogColor = blizzardFogColor;
                    _targetFogDensity = 0.05f + _targetSnowIntensity * 0.03f;
                    _targetLightColor = blizzardColor;
                    _targetLightIntensity = 0.3f;
                    _targetWindVolume = 0.8f;
                    _targetBlizzardVolume = _targetSnowIntensity;
                    _targetSnowEmission = _targetSnowIntensity * 1500;
                    _targetWindEmission = _targetWindSpeed * 10;
                    _targetBlizzardEmission = _targetSnowIntensity * 800;
                    break;

                case WeatherType.Windy:
                    _targetFogColor = clearFogColor;
                    _targetFogDensity = 0.008f;
                    _targetLightColor = clearColor;
                    _targetLightIntensity = 0.9f;
                    _targetWindVolume = Mathf.Clamp01(_targetWindSpeed / 50f);
                    _targetBlizzardVolume = 0f;
                    _targetSnowEmission = 0;
                    _targetWindEmission = _targetWindSpeed * 15;
                    _targetBlizzardEmission = 0;
                    break;
            }
        }

        private void Update()
        {
            if (!_isInitialized) return;

            var deltaLerp = Time.deltaTime * transitionSpeed;

            CurrentVisibility = Mathf.Lerp(CurrentVisibility, _targetVisibility, deltaLerp);

            RenderSettings.fogColor = Color.Lerp(RenderSettings.fogColor, _targetFogColor, deltaLerp);
            RenderSettings.fogDensity = Mathf.Lerp(RenderSettings.fogDensity, _targetFogDensity, deltaLerp);

            if (directionalLight != null)
            {
                directionalLight.color = Color.Lerp(directionalLight.color, _targetLightColor, deltaLerp);
                directionalLight.intensity = Mathf.Lerp(directionalLight.intensity, _targetLightIntensity, deltaLerp);
            }

            if (windAudio != null)
            {
                windAudio.volume = Mathf.Lerp(windAudio.volume, _targetWindVolume, deltaLerp);
            }
            if (blizzardAudio != null)
            {
                blizzardAudio.volume = Mathf.Lerp(blizzardAudio.volume, _targetBlizzardVolume, deltaLerp);
            }

            UpdateParticleEmission(snowParticles, ref _currentSnowEmission, _targetSnowEmission, deltaLerp);
            UpdateParticleEmission(windParticles, ref _currentWindEmission, _targetWindEmission, deltaLerp);
            UpdateParticleEmission(blizzardParticles, ref _currentBlizzardEmission, _targetBlizzardEmission, deltaLerp);

            if (Mathf.Abs(CurrentVisibility - _targetVisibility) < 0.1f &&
                CurrentWeather != _targetWeather)
            {
                CurrentWeather = _targetWeather;
                Debug.Log($"[WeatherSystem] 天气过渡完成: {CurrentWeather}");
            }
        }

        private void UpdateParticleEmission(ParticleSystem system, ref float currentEmission, float targetEmission, float deltaLerp)
        {
            if (system == null) return;

            currentEmission = Mathf.Lerp(currentEmission, targetEmission, deltaLerp);

            var em = system.emission;
            em.rateOverTime = currentEmission;

            if (currentEmission > 0.1f && !system.isPlaying)
            {
                system.Play();
            }
            else if (currentEmission <= 0.1f && system.isPlaying)
            {
                system.Stop();
            }

            if (currentEmission > 0.1f)
            {
                var main = system.main;
                var velocity = Mathf.Clamp(_targetWindSpeed * 0.2f, 1f, 20f);
                main.startSpeed = Mathf.Lerp(main.startSpeed.constant, velocity, deltaLerp);
            }
        }

        private void SetParticleSystemEmission(ParticleSystem system, bool enabled, float rate)
        {
            if (system == null) return;

            var em = system.emission;
            em.enabled = enabled;
            em.rateOverTime = rate;

            if (enabled && !system.isPlaying)
            {
                system.Play();
            }
            else if (!enabled && system.isPlaying)
            {
                system.Stop();
            }
        }

        private void OnDestroy()
        {
            if (_gameState != null)
            {
                _gameState.OnEnvironmentUpdated -= OnEnvironmentUpdated;
                _gameState.OnStateReset -= OnStateReset;
            }
            ServiceLocator.Unregister<IWeatherSystem>();
        }
    }
}
