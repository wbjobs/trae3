package main

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"edge-gateway-inspector/pkg/config"
	"edge-gateway-inspector/pkg/metrics"
	"edge-gateway-inspector/pkg/report"
	"edge-gateway-inspector/pkg/rules"
	"edge-gateway-inspector/pkg/scheduler"
	sshpkg "edge-gateway-inspector/pkg/ssh"
)

var scheduleCronExpr string

func newScheduleCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "schedule",
		Short: "定时任务管理",
		Long:  `管理定时巡检任务，支持启动、停止、查看任务状态。`,
	}

	cmd.AddCommand(&cobra.Command{
		Use:   "start",
		Short: "启动定时巡检任务",
		Run:   runScheduleStart,
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "stop",
		Short: "停止定时巡检任务",
		Run:   runScheduleStop,
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "list",
		Short: "查看定时任务列表",
		Run:   runScheduleList,
	})

	cmd.PersistentFlags().StringVarP(&scheduleCronExpr, "cron", "e", "", "Cron表达式 (默认使用配置文件，5位标准格式)")

	return cmd
}

func runScheduleStart(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	cronExpr := scheduleCronExpr
	if cronExpr == "" {
		cronExpr = cfg.Scheduler.CronExpr
	}

	fmt.Println("启动定时巡检任务...")
	fmt.Printf("Cron表达式: %s\n", cronExpr)

	sched := scheduler.NewScheduler()

	task := scheduler.ScheduledTask{
		Name:        "auto-inspection",
		Description: "自动巡检任务",
		CronExpr:    cronExpr,
		Func: func() error {
			fmt.Printf("\n[%s] 执行定时巡检任务...\n", time.Now().Format("2006-01-02 15:04:05"))

			gateways := buildGatewayList(cfg, "", "")
			if len(gateways) == 0 {
				return fmt.Errorf("没有可用的网关配置")
			}

			cluster := sshpkg.NewClusterManager(gateways)
			if err := cluster.ConnectAll(); err != nil {
				fmt.Fprintf(os.Stderr, "集群连接错误: %v\n", err)
			}
			defer cluster.DisconnectAll()

			if len(cluster.Clients) == 0 {
				return fmt.Errorf("无法连接到任何网关")
			}

			collector := metrics.NewMetricsCollector(cluster)
			metricsMap := collector.CollectAll()

			ruleEngine := rules.NewRuleEngine(cfg.Rules)
			checkResults := ruleEngine.CheckAllGateways(metricsMap)

			reporter := report.NewReporter(cfg.Report.OutputDir)
			for _, fmtStr := range cfg.Report.Formats {
				result, err := reporter.GenerateReport(checkResults, metricsMap, report.ReportFormat(fmtStr))
				if err != nil {
					fmt.Fprintf(os.Stderr, "生成报告失败: %v\n", err)
					return err
				}
				fmt.Println(result)
			}

			return nil
		},
		OnSuccess: func(name string) {
			fmt.Printf("[OK] 任务 %s 执行成功\n", name)
		},
		OnError: func(name string, err error) {
			fmt.Fprintf(os.Stderr, "[FAIL] 任务 %s 执行失败: %v\n", name, err)
		},
	}

	if err := sched.AddTask(task); err != nil {
		fmt.Fprintf(os.Stderr, "添加任务失败: %v\n", err)
		os.Exit(1)
	}

	sched.Start()
	fmt.Println("定时任务调度器已启动，按 Ctrl+C 停止")
	fmt.Println(sched.ListTasks())

	sched.WaitForInterrupt()
}

func runScheduleStop(cmd *cobra.Command, args []string) {
	fmt.Println("请按 Ctrl+C 停止正在运行的调度器")
}

func runScheduleList(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("定时任务配置:")
	fmt.Println("================")
	fmt.Printf("启用: %v\n", cfg.Scheduler.Enabled)
	fmt.Printf("Cron表达式: %s\n", cfg.Scheduler.CronExpr)
	fmt.Println()
	fmt.Println("报告配置:")
	fmt.Printf("输出目录: %s\n", cfg.Report.OutputDir)
	fmt.Printf("输出格式: %v\n", cfg.Report.Formats)
}
