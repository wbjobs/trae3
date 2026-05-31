
using Newtonsoft.Json;
using PolarShared.Models;
using PolarShared.Enums;
using System.Security.Cryptography;
using System.Text;
using System.IO;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using System.Runtime.Serialization.Formatters.Binary;

namespace PolarServer.Game;

public class SaveLoadManager
{
    private readonly string _saveDirectory;
    private readonly string _binarySaveDirectory;
    private const string SaveFileName = "polar_research_save.json";
    private const string BinarySaveFileName = "polar_research_save.bin";
    private const string BackupFileExtension = ".bak";
    private const int MaxBackupFiles = 5;
    private const string CurrentSaveVersion = "1.0.0";
    private const bool UseBinarySerialization = true;

    private readonly ConcurrentDictionary<string, GameSaveData> _cache = new();
    private readonly object _saveLock = new();

    public SaveLoadManager(string saveDirectory = "Saves")
    {
        _saveDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, saveDirectory);
        _binarySaveDirectory = Path.Combine(_saveDirectory, "binary");

        if (!Directory.Exists(_saveDirectory))
            Directory.CreateDirectory(_saveDirectory);
        if (!Directory.Exists(_binarySaveDirectory))
            Directory.CreateDirectory(_binarySaveDirectory);
    }

    public SaveResult SaveGame(GameStateManager stateManager)
    {
        try
        {
            var saveData = CreateSaveData(stateManager);
            var savePath = Path.Combine(_saveDirectory, SaveFileName);
            var binaryPath = Path.Combine(_binarySaveDirectory, BinarySaveFileName);

            lock (_saveLock)
            {
                CreateBackup(savePath);

                if (UseBinarySerialization)
                {
                    SaveBinaryAsync(binaryPath, saveData).Wait();
                    SaveJsonAsync(savePath, saveData).Wait();
                }
                else
                {
                    SaveJsonAsync(savePath, saveData).Wait();
                }

                _cache[SaveFileName] = saveData;
            }

            Console.WriteLine($"[SaveLoadManager] 游戏已保存: {savePath}, 版本: {saveData.Version}");
            return new SaveResult { Success = true, Message = "保存成功", SaveTime = saveData.SaveTime };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 保存失败: {ex.Message}");
            return new SaveResult { Success = false, Message = $"保存失败: {ex.Message}" };
        }
    }

    public async Task<SaveResult> SaveGameAsync(GameStateManager stateManager)
    {
        try
        {
            var saveData = CreateSaveData(stateManager);
            var savePath = Path.Combine(_saveDirectory, SaveFileName);
            var binaryPath = Path.Combine(_binarySaveDirectory, BinarySaveFileName);

            CreateBackup(savePath);

            var tasks = new List<Task>
            {
                SaveJsonAsync(savePath, saveData)
            };

            if (UseBinarySerialization)
            {
                tasks.Add(SaveBinaryAsync(binaryPath, saveData));
            }

            await Task.WhenAll(tasks);

            _cache[SaveFileName] = saveData;

            Console.WriteLine($"[SaveLoadManager] 异步保存完成: {savePath}");
            return new SaveResult { Success = true, Message = "保存成功", SaveTime = saveData.SaveTime };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 异步保存失败: {ex.Message}");
            return new SaveResult { Success = false, Message = $"保存失败: {ex.Message}" };
        }
    }

    private static async Task SaveJsonAsync(string path, GameSaveData data)
    {
        var json = JsonConvert.SerializeObject(data, Formatting.None);
        using var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, true);
        using var writer = new StreamWriter(stream);
        await writer.WriteAsync(json);
    }

    private static async Task SaveBinaryAsync(string path, GameSaveData data)
    {
        using var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, true);
        using var writer = new BinaryWriter(stream, Encoding.UTF8);

        writer.Write(data.Version ?? string.Empty);
        writer.Write(data.Checksum ?? string.Empty);
        writer.Write(data.SaveTime.ToBinary());

        writer.Write(data.Players.Count);
        foreach (var p in data.Players)
        {
            writer.Write(p.PlayerId ?? string.Empty);
            writer.Write(p.PlayerName ?? string.Empty);
            writer.Write(p.IsOnline);
            writer.Write(p.Position.X);
            writer.Write(p.Position.Y);
            writer.Write(p.Position.Z);
            writer.Write(p.Rotation.X);
            writer.Write(p.Rotation.Y);
            writer.Write(p.Rotation.Z);
            writer.Write(p.Health);
            writer.Write(p.Warmth);
            writer.Write(p.Energy);
        }

        writer.Write(data.Missions.Count);
        foreach (var m in data.Missions)
        {
            writer.Write(m.MissionId ?? string.Empty);
            writer.Write(m.Title ?? string.Empty);
            writer.Write(m.Description ?? string.Empty);
            writer.Write(m.TargetLocation.X);
            writer.Write(m.TargetLocation.Y);
            writer.Write(m.TargetLocation.Z);
            writer.Write(m.RewardPoints);
            writer.Write(m.Progress);
            writer.Write((int)m.Status);
        }

        writer.Write(data.Environment.Temperature);
        writer.Write(data.Environment.WindSpeed);
        writer.Write(data.Environment.SnowIntensity);
        writer.Write(data.Environment.Visibility);
        writer.Write((int)data.Environment.CurrentWeather);
    }

    private static async Task<GameSaveData?> LoadBinaryAsync(string path)
    {
        if (!File.Exists(path)) return null;

        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, true);
            using var reader = new BinaryReader(stream, Encoding.UTF8);

            var data = new GameSaveData
            {
                Version = reader.ReadString(),
                Checksum = reader.ReadString(),
                SaveTime = DateTime.FromBinary(reader.ReadInt64())
            };

            var playerCount = reader.ReadInt32();
            for (var i = 0; i < playerCount; i++)
            {
                var p = new PlayerState
                {
                    PlayerId = reader.ReadString(),
                    PlayerName = reader.ReadString(),
                    IsOnline = reader.ReadBoolean(),
                    Position = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()),
                    Rotation = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()),
                    Health = reader.ReadSingle(),
                    Warmth = reader.ReadSingle(),
                    Energy = reader.ReadSingle()
                };
                data.Players.Add(p);
            }

            var missionCount = reader.ReadInt32();
            for (var i = 0; i < missionCount; i++)
            {
                var m = new ResearchMission
                {
                    MissionId = reader.ReadString(),
                    Title = reader.ReadString(),
                    Description = reader.ReadString(),
                    TargetLocation = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()),
                    RewardPoints = reader.ReadInt32(),
                    Progress = reader.ReadSingle(),
                    Status = (MissionStatus)reader.ReadInt32()
                };
                data.Missions.Add(m);
            }

            data.Environment = new EnvironmentParameters
            {
                Temperature = reader.ReadSingle(),
                WindSpeed = reader.ReadSingle(),
                SnowIntensity = reader.ReadSingle(),
                Visibility = reader.ReadSingle(),
                CurrentWeather = (WeatherType)reader.ReadInt32()
            };

            return data;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 二进制加载失败: {ex.Message}");
            return null;
        }
    }

    public LoadResult LoadGame(GameStateManager stateManager)
    {
        try
        {
            var binaryPath = Path.Combine(_binarySaveDirectory, BinarySaveFileName);
            var savePath = Path.Combine(_saveDirectory, SaveFileName);
            GameSaveData? saveData = null;
            var usedBinary = false;

            if (_cache.TryGetValue(SaveFileName, out var cached))
            {
                var validation = ValidateSaveData(cached);
                if (validation.IsValid)
                {
                    Console.WriteLine("[SaveLoadManager] 使用缓存存档");
                    saveData = cached;
                }
            }

            if (saveData == null && UseBinarySerialization && File.Exists(binaryPath))
            {
                var binaryTask = LoadBinaryAsync(binaryPath);
                binaryTask.Wait();
                saveData = binaryTask.Result;
                if (saveData != null) usedBinary = true;
            }

            if (saveData == null)
            {
                if (!File.Exists(savePath))
                {
                    var backupPath = FindLatestBackup();
                    if (backupPath != null)
                    {
                        Console.WriteLine($"[SaveLoadManager] 主存档不存在，尝试加载备份: {backupPath}");
                        File.Copy(backupPath, savePath);
                    }
                    else
                    {
                        return new LoadResult { Success = false, Message = "未找到存档文件" };
                    }
                }

                var json = File.ReadAllText(savePath);
                if (string.IsNullOrWhiteSpace(json))
                    return TryRestoreFromBackup(stateManager, savePath, "存档文件为空");

                saveData = JsonConvert.DeserializeObject<GameSaveData>(json);
            }

            if (saveData == null)
                return TryRestoreFromBackup(stateManager, savePath, "存档数据反序列化失败");

            var validationResult = ValidateSaveData(saveData);
            if (!validationResult.IsValid)
                return TryRestoreFromBackup(stateManager, savePath, validationResult.ErrorMessage);

            var versionResult = CheckVersionCompatibility(saveData.Version);
            if (!versionResult.IsCompatible)
            {
                Console.WriteLine($"[SaveLoadManager] {versionResult.Message}");
                if (!versionResult.CanMigrate)
                    return new LoadResult { Success = false, Message = versionResult.Message };
            }

            RestoreSaveData(stateManager, saveData);

            if (!usedBinary)
                _cache[SaveFileName] = saveData;

            var source = usedBinary ? "二进制" : "JSON";
            Console.WriteLine($"[SaveLoadManager] 加载存档成功({source}), 时间: {saveData.SaveTime}, 版本: {saveData.Version}");

            return new LoadResult
            {
                Success = true,
                Message = "加载成功",
                SaveTime = saveData.SaveTime,
                Version = saveData.Version,
                PlayerCount = saveData.Players.Count,
                MissionCount = saveData.Missions.Count
            };
        }
        catch (JsonException ex)
        {
            Console.WriteLine($"[SaveLoadManager] JSON解析失败: {ex.Message}");
            return TryRestoreFromBackup(stateManager, Path.Combine(_saveDirectory, SaveFileName), $"JSON格式错误: {ex.Message}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 加载失败: {ex.Message}");
            return new LoadResult { Success = false, Message = $"加载失败: {ex.Message}" };
        }
    }

    private GameSaveData CreateSaveData(GameStateManager stateManager)
    {
        var saveData = new GameSaveData
        {
            Version = CurrentSaveVersion,
            SaveTime = DateTime.Now,
            Players = stateManager.GetAllPlayers(),
            Missions = stateManager.GetAllMissions(),
            Environment = stateManager.GetEnvironment()
        };

        saveData.Checksum = CalculateChecksum(saveData);
        return saveData;
    }

    private string CalculateChecksum(GameSaveData data)
    {
        var content = $"{data.Version}|{data.SaveTime.Ticks}|{data.Players.Count}|{data.Missions.Count}";
        foreach (var player in data.Players)
        {
            content += $"|{player.PlayerId},{player.Health},{player.Warmth},{player.Energy}";
        }
        foreach (var mission in data.Missions)
        {
            content += $"|{mission.MissionId},{mission.Progress},{(int)mission.Status}";
        }
        content += $"|{data.Environment.Temperature},{data.Environment.WindSpeed},{(int)data.Environment.CurrentWeather}";

        using var sha256 = SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(content));
        return Convert.ToBase64String(bytes);
    }

    private ValidationResult ValidateSaveData(GameSaveData data)
    {
        if (string.IsNullOrWhiteSpace(data.Version))
            return new ValidationResult { IsValid = false, ErrorMessage = "存档版本号缺失" };
        if (data.SaveTime == default)
            return new ValidationResult { IsValid = false, ErrorMessage = "存档时间无效" };
        if (data.Players == null)
            return new ValidationResult { IsValid = false, ErrorMessage = "玩家数据为空" };
        if (data.Missions == null)
            return new ValidationResult { IsValid = false, ErrorMessage = "任务数据为空" };
        if (data.Environment == null)
            return new ValidationResult { IsValid = false, ErrorMessage = "环境数据为空" };

        var calculatedChecksum = CalculateChecksum(data);
        if (!string.Equals(data.Checksum, calculatedChecksum))
            return new ValidationResult { IsValid = false, ErrorMessage = "存档校验和不匹配" };

        return new ValidationResult { IsValid = true };
    }

    private VersionCheckResult CheckVersionCompatibility(string saveVersion)
    {
        if (saveVersion == CurrentSaveVersion)
            return new VersionCheckResult { IsCompatible = true, CanMigrate = true, Message = "版本完全兼容" };

        var saveParts = saveVersion.Split('.');
        var currentParts = CurrentSaveVersion.Split('.');

        if (saveParts.Length < 2 || currentParts.Length < 2)
            return new VersionCheckResult { IsCompatible = false, CanMigrate = false, Message = "版本格式无效" };

        if (saveParts[0] != currentParts[0])
            return new VersionCheckResult
            {
                IsCompatible = false,
                CanMigrate = false,
                Message = $"主版本不兼容，存档: {saveVersion}, 当前: {CurrentSaveVersion}"
            };

        return new VersionCheckResult
        {
            IsCompatible = true,
            CanMigrate = true,
            Message = $"次版本兼容，存档: {saveVersion}, 当前: {CurrentSaveVersion}"
        };
    }

    private void RestoreSaveData(GameStateManager stateManager, GameSaveData saveData)
    {
        if (saveData.Environment != null)
            stateManager.UpdateEnvironment(saveData.Environment);

        foreach (var mission in saveData.Missions)
        {
            var existingMission = stateManager.GetMission(mission.MissionId);
            if (existingMission != null)
            {
                stateManager.UpdateMissionProgress(mission.MissionId, mission.Progress);
                foreach (var playerId in mission.AssignedPlayers)
                {
                    stateManager.AssignPlayerToMission(mission.MissionId, playerId);
                }
            }
        }

        Console.WriteLine($"[SaveLoadManager] 已恢复 {saveData.Missions.Count} 个任务状态");
    }

    private void CreateBackup(string savePath)
    {
        if (!File.Exists(savePath)) return;

        try
        {
            var backupPath = $"{savePath}.{DateTime.Now:yyyyMMddHHmmss}{BackupFileExtension}";
            File.Copy(savePath, backupPath, true);
            CleanupOldBackups(savePath);
            Console.WriteLine($"[SaveLoadManager] 创建备份: {Path.GetFileName(backupPath)}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 创建备份失败: {ex.Message}");
        }
    }

    private string? FindLatestBackup()
    {
        try
        {
            var backupFiles = Directory.GetFiles(_saveDirectory, $"*{BackupFileExtension}")
                .OrderByDescending(f => File.GetLastWriteTime(f))
                .ToList();
            return backupFiles.FirstOrDefault();
        }
        catch { return null; }
    }

    private void CleanupOldBackups(string savePath)
    {
        try
        {
            var backupFiles = Directory.GetFiles(_saveDirectory, $"*{BackupFileExtension}")
                .OrderByDescending(f => File.GetLastWriteTime(f))
                .Skip(MaxBackupFiles)
                .ToList();

            foreach (var file in backupFiles)
                File.Delete(file);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 清理旧备份失败: {ex.Message}");
        }
    }

    private LoadResult TryRestoreFromBackup(GameStateManager stateManager, string corruptedFilePath, string errorMessage)
    {
        Console.WriteLine($"[SaveLoadManager] {errorMessage}，尝试从备份恢复...");

        var backupPath = FindLatestBackup();
        if (backupPath == null)
            return new LoadResult { Success = false, Message = $"{errorMessage}，且无可用备份" };

        try
        {
            var backupJson = File.ReadAllText(backupPath);
            var backupData = JsonConvert.DeserializeObject<GameSaveData>(backupJson);

            if (backupData == null || !ValidateSaveData(backupData).IsValid)
                return new LoadResult { Success = false, Message = "备份数据也无效" };

            File.Copy(backupPath, corruptedFilePath, true);
            RestoreSaveData(stateManager, backupData);

            Console.WriteLine($"[SaveLoadManager] 从备份恢复成功: {Path.GetFileName(backupPath)}");
            return new LoadResult
            {
                Success = true,
                Message = $"已从备份恢复: {errorMessage}",
                SaveTime = backupData.SaveTime,
                Version = backupData.Version,
                RestoredFromBackup = true
            };
        }
        catch (Exception ex)
        {
            return new LoadResult { Success = false, Message = $"备份恢复失败: {ex.Message}" };
        }
    }

    public List<SaveFileInfo> GetSaveFiles()
    {
        var saves = new List<SaveFileInfo>();
        if (!Directory.Exists(_saveDirectory)) return saves;

        foreach (var file in Directory.GetFiles(_saveDirectory, "*.json"))
        {
            try
            {
                var json = File.ReadAllText(file);
                var saveData = JsonConvert.DeserializeObject<GameSaveData>(json);
                if (saveData != null)
                {
                    var validation = ValidateSaveData(saveData);
                    saves.Add(new SaveFileInfo
                    {
                        FileName = Path.GetFileName(file),
                        SaveTime = saveData.SaveTime,
                        PlayerCount = saveData.Players?.Count ?? 0,
                        MissionCount = saveData.Missions?.Count ?? 0,
                        Version = saveData.Version,
                        IsValid = validation.IsValid
                    });
                }
            }
            catch
            {
                saves.Add(new SaveFileInfo
                {
                    FileName = Path.GetFileName(file),
                    SaveTime = File.GetLastWriteTime(file),
                    IsValid = false
                });
            }
        }

        return saves.OrderByDescending(s => s.SaveTime).ToList();
    }

    public async void AutoSave(GameStateManager stateManager)
    {
        try
        {
            var result = await SaveGameAsync(stateManager);
            if (result.Success)
                Console.WriteLine($"[SaveLoadManager] 自动保存完成: {DateTime.Now}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLoadManager] 自动保存失败: {ex.Message}");
        }
    }

    public void ClearCache()
    {
        _cache.Clear();
    }
}

[Serializable]
public class GameSaveData
{
    public string Version { get; set; }
    public string Checksum { get; set; }
    public DateTime SaveTime { get; set; }
    public List<PlayerState> Players { get; set; }
    public List<ResearchMission> Missions { get; set; }
    public EnvironmentParameters Environment { get; set; }

    public GameSaveData()
    {
        Version = "1.0.0";
        Checksum = string.Empty;
        Players = new List<PlayerState>();
        Missions = new List<ResearchMission>();
        Environment = new EnvironmentParameters();
    }
}

[Serializable]
public class SaveFileInfo
{
    public string FileName { get; set; }
    public DateTime SaveTime { get; set; }
    public int PlayerCount { get; set; }
    public int MissionCount { get; set; }
    public string Version { get; set; }
    public bool IsValid { get; set; }

    public SaveFileInfo()
    {
        FileName = string.Empty;
        Version = string.Empty;
    }
}

public class SaveResult
{
    public bool Success { get; set; }
    public string Message { get; set; }
    public DateTime SaveTime { get; set; }

    public SaveResult()
    {
        Message = string.Empty;
    }
}

public class LoadResult
{
    public bool Success { get; set; }
    public string Message { get; set; }
    public DateTime SaveTime { get; set; }
    public string Version { get; set; }
    public int PlayerCount { get; set; }
    public int MissionCount { get; set; }
    public bool RestoredFromBackup { get; set; }

    public LoadResult()
    {
        Message = string.Empty;
        Version = string.Empty;
    }
}

public class ValidationResult
{
    public bool IsValid { get; set; }
    public string ErrorMessage { get; set; }

    public ValidationResult()
    {
        ErrorMessage = string.Empty;
    }
}

public class VersionCheckResult
{
    public bool IsCompatible { get; set; }
    public bool CanMigrate { get; set; }
    public string Message { get; set; }

    public VersionCheckResult()
    {
        Message = string.Empty;
    }
}
