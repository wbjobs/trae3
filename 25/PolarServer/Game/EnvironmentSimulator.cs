
using PolarShared.Enums;
using PolarShared.Models;

namespace PolarServer.Game;

public class EnvironmentSimulator
{
    private readonly GameStateManager _stateManager;
    private readonly Random _random;
    private Timer? _simulationTimer;
    private bool _isRunning;

    public float MinTemperature { get; set; } = -45.0f;
    public float MaxTemperature { get; set; } = 0.0f;
    public float MaxWindSpeed { get; set; } = 50.0f;
    public int SimulationIntervalMs { get; set; } = 5000;

    public EnvironmentSimulator(GameStateManager stateManager)
    {
        _stateManager = stateManager;
        _random = new Random();
    }

    public void Start()
    {
        if (_isRunning) return;

        _isRunning = true;
        _simulationTimer = new Timer(SimulateEnvironment, null, 0, SimulationIntervalMs);
        Console.WriteLine("[EnvironmentSimulator] 环境模拟已启动");
    }

    public void Stop()
    {
        if (!_isRunning) return;

        _isRunning = false;
        _simulationTimer?.Dispose();
        Console.WriteLine("[EnvironmentSimulator] 环境模拟已停止");
    }

    private void SimulateEnvironment(object? state)
    {
        try
        {
            var currentEnv = _stateManager.GetEnvironment();
            var newEnv = GenerateNewEnvironment(currentEnv);
            _stateManager.UpdateEnvironment(newEnv);

            Console.WriteLine($"[EnvironmentSimulator] 天气: {newEnv.CurrentWeather}, " +
                            $"温度: {newEnv.Temperature:F1}°C, 风速: {newEnv.WindSpeed:F1}m/s");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EnvironmentSimulator] 错误: {ex.Message}");
        }
    }

    private EnvironmentParameters GenerateNewEnvironment(EnvironmentParameters current)
    {
        var newEnv = new EnvironmentParameters();

        newEnv.Temperature = GenerateTemperature(current.Temperature);
        newEnv.CurrentWeather = GenerateWeatherType(current.CurrentWeather);
        newEnv.WindSpeed = GenerateWindSpeed(newEnv.CurrentWeather);
        newEnv.SnowIntensity = GenerateSnowIntensity(newEnv.CurrentWeather);
        newEnv.Visibility = CalculateVisibility(newEnv);

        return newEnv;
    }

    private float GenerateTemperature(float currentTemp)
    {
        var change = (float)(_random.NextDouble() * 4 - 2);
        var newTemp = currentTemp + change;
        return Math.Clamp(newTemp, MinTemperature, MaxTemperature);
    }

    private WeatherType GenerateWeatherType(WeatherType currentWeather)
    {
        var roll = _random.NextDouble();
        var stableProbability = 0.7;

        if (roll < stableProbability)
            return currentWeather;

        var transitionMatrix = new Dictionary<WeatherType, List<(WeatherType, double)>>
        {
            { WeatherType.Clear, new List<(WeatherType, double)>
                { (WeatherType.Clear, 0.5), (WeatherType.LightSnow, 0.3), (WeatherType.Windy, 0.2) } },
            { WeatherType.LightSnow, new List<(WeatherType, double)>
                { (WeatherType.Clear, 0.2), (WeatherType.LightSnow, 0.4), (WeatherType.HeavySnow, 0.3), (WeatherType.Windy, 0.1) } },
            { WeatherType.HeavySnow, new List<(WeatherType, double)>
                { (WeatherType.LightSnow, 0.3), (WeatherType.HeavySnow, 0.4), (WeatherType.Blizzard, 0.3) } },
            { WeatherType.Blizzard, new List<(WeatherType, double)>
                { (WeatherType.HeavySnow, 0.4), (WeatherType.Blizzard, 0.6) } },
            { WeatherType.Windy, new List<(WeatherType, double)>
                { (WeatherType.Clear, 0.3), (WeatherType.LightSnow, 0.3), (WeatherType.Windy, 0.2), (WeatherType.Blizzard, 0.2) } }
        };

        if (!transitionMatrix.TryGetValue(currentWeather, out var transitions))
            return WeatherType.Clear;

        var r = _random.NextDouble();
        var cumulative = 0.0;

        foreach (var (weather, prob) in transitions)
        {
            cumulative += prob;
            if (r <= cumulative)
                return weather;
        }

        return currentWeather;
    }

    private float GenerateWindSpeed(WeatherType weather)
    {
        return weather switch
        {
            WeatherType.Clear => (float)(_random.NextDouble() * 5),
            WeatherType.LightSnow => (float)(_random.NextDouble() * 10 + 3),
            WeatherType.HeavySnow => (float)(_random.NextDouble() * 20 + 10),
            WeatherType.Blizzard => (float)(_random.NextDouble() * 20 + 30),
            WeatherType.Windy => (float)(_random.NextDouble() * 25 + 15),
            _ => 0
        };
    }

    private float GenerateSnowIntensity(WeatherType weather)
    {
        return weather switch
        {
            WeatherType.Clear => 0,
            WeatherType.LightSnow => (float)(_random.NextDouble() * 0.3 + 0.1),
            WeatherType.HeavySnow => (float)(_random.NextDouble() * 0.4 + 0.4),
            WeatherType.Blizzard => (float)(_random.NextDouble() * 0.3 + 0.7),
            WeatherType.Windy => (float)(_random.NextDouble() * 0.2),
            _ => 0
        };
    }

    private float CalculateVisibility(EnvironmentParameters env)
    {
        var baseVisibility = 100.0f;
        baseVisibility -= env.SnowIntensity * 80;
        baseVisibility -= env.WindSpeed / MaxWindSpeed * 30;
        return Math.Clamp(baseVisibility, 5, 100);
    }

    public void ForceWeather(WeatherType weatherType)
    {
        var currentEnv = _stateManager.GetEnvironment();
        currentEnv.CurrentWeather = weatherType;
        currentEnv.WindSpeed = GenerateWindSpeed(weatherType);
        currentEnv.SnowIntensity = GenerateSnowIntensity(weatherType);
        currentEnv.Visibility = CalculateVisibility(currentEnv);
        _stateManager.UpdateEnvironment(currentEnv);
    }
}
