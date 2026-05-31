package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"edge-gateway-inspector/pkg/config"
)

func newConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "配置文件管理",
		Long:  `管理巡检工具配置文件，包括生成、查看、验证配置。`,
	}

	cmd.AddCommand(&cobra.Command{
		Use:   "init",
		Short: "生成示例配置文件",
		Run:   runConfigInit,
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "show",
		Short: "显示当前配置",
		Run:   runConfigShow,
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "validate",
		Short: "验证配置文件",
		Run:   runConfigValidate,
	})

	return cmd
}

func runConfigInit(cmd *cobra.Command, args []string) {
	configPath := cfgFile
	if configPath == "" {
		configPath = "config.yaml"
	}

	if _, err := os.Stat(configPath); err == nil {
		fmt.Fprintf(os.Stderr, "配置文件 %s 已存在，请先删除或指定其他路径\n", configPath)
		os.Exit(1)
	}

	if err := config.GenerateSampleConfig(configPath); err != nil {
		fmt.Fprintf(os.Stderr, "生成配置文件失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("示例配置文件已生成: %s\n", configPath)
	fmt.Println("请编辑配置文件，填入正确的网关信息后使用。")
}

func runConfigShow(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("当前配置:")
	fmt.Println("================")
	fmt.Printf("网关数量: %d\n", len(cfg.Gateways))
	for _, gw := range cfg.Gateways {
		status := "禁用"
		if gw.Enabled {
			status = "启用"
		}
		fmt.Printf("  - %s (%s@%s:%d) [%s]\n", gw.Name, gw.Username, gw.Host, gw.Port, status)
	}
	fmt.Println()
	fmt.Printf("调度器: 启用=%v, Cron=%s\n", cfg.Scheduler.Enabled, cfg.Scheduler.CronExpr)
	fmt.Printf("报告: 目录=%s, 格式=%v\n", cfg.Report.OutputDir, cfg.Report.Formats)
	fmt.Println()
	fmt.Println("规则阈值:")
	fmt.Printf("  CPU: %.0f%% | 内存: %.0f%% | 磁盘: %.0f%% | 负载: %.1fx\n",
		cfg.Rules.CPUThreshold, cfg.Rules.MemoryThreshold, cfg.Rules.DiskThreshold, cfg.Rules.LoadThreshold)
	fmt.Printf("  Swap: %.0f%% | 僵尸进程: %d | 连接数: %d\n",
		cfg.Rules.SwapThreshold, cfg.Rules.ZombieThreshold, cfg.Rules.ConnectionThreshold)
}

func runConfigValidate(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "配置验证失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("配置验证结果:")
	fmt.Println("================")

	hasError := false

	if len(cfg.Gateways) == 0 {
		fmt.Println("[警告] 没有配置任何网关")
	} else {
		fmt.Printf("[OK] 配置了 %d 个网关\n", len(cfg.Gateways))
		for i, gw := range cfg.Gateways {
			if gw.Name == "" {
				fmt.Printf("  [错误] 网关 %d 没有名称\n", i+1)
				hasError = true
			}
			if gw.Host == "" {
				fmt.Printf("  [错误] 网关 %s 没有主机地址\n", gw.Name)
				hasError = true
			}
			if gw.Username == "" {
				fmt.Printf("  [错误] 网关 %s 没有用户名\n", gw.Name)
				hasError = true
			}
			if gw.Password == "" && gw.PrivateKey == "" {
				fmt.Printf("  [警告] 网关 %s 未配置密码或私钥\n", gw.Name)
			}
			if gw.Port <= 0 || gw.Port > 65535 {
				fmt.Printf("  [错误] 网关 %s 端口无效: %d\n", gw.Name, gw.Port)
				hasError = true
			}
		}
	}

	if cfg.Scheduler.CronExpr == "" {
		fmt.Println("[错误] 调度器Cron表达式为空")
		hasError = true
	}

	fmt.Println()
	if hasError {
		fmt.Println("配置验证失败，请修复以上错误!")
		os.Exit(1)
	}
	fmt.Println("配置验证通过!")
}
