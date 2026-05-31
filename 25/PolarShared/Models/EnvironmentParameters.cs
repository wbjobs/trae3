
using PolarShared.Enums;

namespace PolarShared.Models;

[Serializable]
public class EnvironmentParameters
{
    public float Temperature { get; set; }
    public float WindSpeed { get; set; }
    public float SnowIntensity { get; set; }
    public float Visibility { get; set; }
    public WeatherType CurrentWeather { get; set; }
    public DateTime LastUpdate { get; set; }

    public EnvironmentParameters()
    {
        Temperature = -20.0f;
        WindSpeed = 5.0f;
        SnowIntensity = 0.0f;
        Visibility = 100.0f;
        CurrentWeather = WeatherType.Clear;
        LastUpdate = DateTime.Now;
    }

    public float CalculateWindChill()
    {
        if (WindSpeed < 1.3f)
            return Temperature;
        
        return 13.12f + 0.6215f * Temperature 
            - 11.37f * (float)Math.Pow(WindSpeed, 0.16) 
            + 0.3965f * Temperature * (float)Math.Pow(WindSpeed, 0.16);
    }
}
