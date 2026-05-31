
using PolarServer.Network;
using PolarServer.Game;
using PolarShared.Enums;

namespace PolarServer;

class Program
{
    static async Task Main(string[] args)
    {
        Console.WriteLine("=== 极地科考站点 - TCP 服务器 ===");
        Console.WriteLine();

        var port = args.Length > 0 ? int.Parse(args[0]) : 8888;

        var stateManager = new GameStateManager();
        var tcpServer = new TcpServer(port);
        var networkOptimizer = new NetworkOptimizer();
        var disasterSystem = new DisasterSystem();
        var messageHandler = new MessageHandler(tcpServer, stateManager, networkOptimizer, disasterSystem);
        var envSimulator = new EnvironmentSimulator(stateManager);
        var saveManager = new SaveLoadManager();

        InitializeGameData(stateManager);

        tcpServer.OnClientConnected += clientId =>
        {
            Console.WriteLine($"[Server] 客户端连接: {clientId}");
        };

        tcpServer.OnClientDisconnected += clientId =>
        {
            Console.WriteLine($"[Server] 客户端断开: {clientId}");
            stateManager.RemovePlayer(clientId);
            networkOptimizer.RemovePlayer(clientId);
        };

        tcpServer.OnMessageReceived += (clientId, message) =>
        {
            messageHandler.HandleMessage(clientId, message);
        };

        stateManager.OnEnvironmentUpdated += env =>
        {
            messageHandler.BroadcastEnvironmentUpdate(env);
        };

        stateManager.OnMissionUpdated += mission =>
        {
            messageHandler.BroadcastMissionUpdate(mission);
        };

        networkOptimizer.OnBatchReady += (batch, clientIds) =>
        {
            messageHandler.BroadcastBatchUpdate(batch, clientIds);
        };

        networkOptimizer.OnMessageReady += (clientId, message) =>
        {
            if (clientId == "broadcast")
                tcpServer.Broadcast(message);
            else
                tcpServer.SendToClient(clientId, message);
        };

        disasterSystem.OnDisasterStarted += disaster =>
        {
            Console.WriteLine($"[灾害] {disaster.Type} [{disaster.Severity}] 开始于 ({disaster.Position.X:F1}, {disaster.Position.Z:F1})");
            messageHandler.BroadcastDisasterEvent(disaster);
        };

        disasterSystem.OnDisasterEnded += disaster =>
        {
            Console.WriteLine($"[灾害] {disaster.Type} 已结束");
            messageHandler.BroadcastDisasterEnd(disaster);
        };

        disasterSystem.OnDisasterWarning += (message, severity) =>
        {
            Console.WriteLine($"[警告] [{severity}] {message}");
        };

        tcpServer.Start();
        envSimulator.Start();

        var autoSaveTimer = new Timer(_ =>
        {
            saveManager.AutoSave(stateManager);
        }, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));

        var disasterTimer = new Timer(_ =>
        {
            disasterSystem.Update(stateManager.GetEnvironment(), stateManager.GetAllPlayers());
        }, null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));

        Console.WriteLine();
        Console.WriteLine("服务器运行中...");
        Console.WriteLine("可用命令:");
        Console.WriteLine("  list - 列出在线玩家");
        Console.WriteLine("  weather <类型> - 强制天气 (Clear/LightSnow/HeavySnow/Blizzard/Windy)");
        Console.WriteLine("  save - 手动保存游戏");
        Console.WriteLine("  load - 加载存档");
        Console.WriteLine("  saves - 列出存档");
        Console.WriteLine("  disaster <类型> [位置] - 触发灾害 (IceCrack/Avalanche/PolarStorm/Blizzard/Whiteout/IceQuake)");
        Console.WriteLine("  disasters - 查看活跃灾害");
        Console.WriteLine("  netstat - 查看网络统计");
        Console.WriteLine("  exit - 关闭服务器");
        Console.WriteLine();

        while (true)
        {
            var command = Console.ReadLine()?.Trim().ToLower();
            if (string.IsNullOrEmpty(command)) continue;

            if (command == "exit")
            {
                Console.WriteLine("正在关闭服务器...");
                envSimulator.Stop();
                tcpServer.Stop();
                networkOptimizer.Dispose();
                autoSaveTimer.Dispose();
                disasterTimer.Dispose();
                saveManager.SaveGame(stateManager);
                break;
            }
            else if (command == "list")
            {
                var players = stateManager.GetAllPlayers();
                Console.WriteLine($"在线玩家数: {players.Count}");
                foreach (var p in players)
                {
                    Console.WriteLine($"  - {p.PlayerName} ({p.PlayerId.Substring(0, 8)}...) 位置: {p.Position}");
                }
            }
            else if (command.StartsWith("weather "))
            {
                var weatherName = command.Substring(8);
                if (Enum.TryParse<PolarShared.Enums.WeatherType>(weatherName, true, out var weather))
                {
                    envSimulator.ForceWeather(weather);
                    Console.WriteLine($"已强制设置天气为: {weather}");
                }
                else
                {
                    Console.WriteLine("无效的天气类型");
                }
            }
            else if (command == "save")
            {
                var result = saveManager.SaveGame(stateManager);
                Console.WriteLine(result.Message);
            }
            else if (command == "load")
            {
                var result = saveManager.LoadGame(stateManager);
                Console.WriteLine(result.Message);
                if (result.Success)
                {
                    Console.WriteLine($"  存档时间: {result.SaveTime}");
                    Console.WriteLine($"  版本: {result.Version}");
                    Console.WriteLine($"  玩家: {result.PlayerCount}");
                    Console.WriteLine($"  任务: {result.MissionCount}");
                    if (result.RestoredFromBackup)
                    {
                        Console.WriteLine("  注意: 已从备份恢复");
                    }
                }
            }
            else if (command == "saves")
            {
                var saves = saveManager.GetSaveFiles();
                Console.WriteLine($"存档列表 (共 {saves.Count} 个):");
                foreach (var save in saves)
                {
                    var status = save.IsValid ? "有效" : "损坏";
                    Console.WriteLine($"  [{status}] {save.FileName} - {save.SaveTime} - v{save.Version}");
                }
            }
            else if (command.StartsWith("disaster "))
            {
                var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2)
                {
                    if (Enum.TryParse<DisasterType>(parts[1], true, out var disasterType))
                    {
                        var players = stateManager.GetAllPlayers();
                        if (players.Count > 0)
                        {
                            var target = players[0];
                            var severity = DisasterSeverity.Moderate;
                            if (parts.Length >= 3 && Enum.TryParse<DisasterSeverity>(parts[2], true, out var s))
                            {
                                severity = s;
                            }

                            disasterSystem.TriggerManualDisaster(disasterType, target.Position, severity);
                            Console.WriteLine($"已触发灾害: {disasterType} [{severity}]");
                        }
                        else
                        {
                            Console.WriteLine("没有在线玩家可供灾害目标");
                        }
                    }
                    else
                    {
                        Console.WriteLine("无效的灾害类型");
                    }
                }
            }
            else if (command == "disasters")
            {
                Console.WriteLine(disasterSystem.GetStatusReport());
            }
            else if (command == "netstat")
            {
                Console.WriteLine("=== 网络统计 ===");
                Console.WriteLine($"  发送消息总数: {networkOptimizer.TotalMessagesSent}");
                Console.WriteLine($"  发送字节总数: {networkOptimizer.TotalBytesSent:N0} bytes");
                Console.WriteLine($"  队列中消息数: {networkOptimizer.QueueCount}");
            }
        }

        Console.WriteLine("服务器已关闭");
    }

    static void InitializeGameData(GameStateManager stateManager)
    {
        stateManager.AddMission(
            "冰芯取样",
            "前往指定地点采集冰芯样本，带回基地进行分析",
            new PolarShared.Models.Vector3(100, 0, 150),
            100
        );

        stateManager.AddMission(
            "气象数据收集",
            "在多个地点部署气象传感器并收集24小时数据",
            new PolarShared.Models.Vector3(-80, 0, 120),
            150
        );

        stateManager.AddMission(
            "极光观测记录",
            "夜间前往观测点记录极光活动数据",
            new PolarShared.Models.Vector3(50, 0, -100),
            200
        );

        stateManager.AddMission(
            "企鹅种群调查",
            "追踪并记录企鹅种群的数量和行为",
            new PolarShared.Models.Vector3(-150, 0, -80),
            180
        );

        Console.WriteLine("[Server] 初始化任务数据完成");
    }
}
