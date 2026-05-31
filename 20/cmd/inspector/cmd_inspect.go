package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"edge-gateway-inspector/pkg/config"
	"edge-gateway-inspector/pkg/metrics"
	"edge-gateway-inspector/pkg/report"
	"edge-gateway-inspector/pkg/rules"
	sshpkg "edge-gateway-inspector/pkg/ssh"
)

var (
	inspectOutputDir   string
	inspectFormats     []string
	inspectGateway     string
	inspectGroup       string
	inspectConcurrency int
)

func newInspectCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "inspect",
		Short: "执行一次巡检任务",
		Long:  `连接所有网关（或指定网关/分组），采集指标，执行规则校验，并生成巡检报告。`,
		Run:   runInspect,
	}

	cmd.Flags().StringVarP(&inspectOutputDir, "output", "o", "", "报告输出目录")
	cmd.Flags().StringSliceVarP(&inspectFormats, "format", "f", []string{"console"}, "报告格式: console, json, html, markdown")
	cmd.Flags().StringVarP(&inspectGateway, "gateway", "g", "", "仅巡检指定网关")
	cmd.Flags().StringVarP(&inspectGroup, "group", "G", "", "仅巡检指定分组的网关")
	cmd.Flags().IntVarP(&inspectConcurrency, "concurrency", "C", 0, "并发连接数 (默认5, 超大集群建议10-20)")

	return cmd
}

func runInspect(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	gateways := buildGatewayList(cfg, inspectGateway, inspectGroup)
	if len(gateways) == 0 {
		if inspectGroup != "" {
			fmt.Fprintf(os.Stderr, "未找到分组 '%s' 的网关，请检查配置。\n", inspectGroup)
		} else if inspectGateway != "" {
			fmt.Fprintf(os.Stderr, "未找到网关 '%s'，请检查配置。\n", inspectGateway)
		} else {
			fmt.Fprintln(os.Stderr, "没有可用的网关，请先配置。使用 'inspector config init' 生成示例配置。")
		}
		os.Exit(1)
	}

	if inspectGroup != "" {
		fmt.Printf("目标分组: %s\n", inspectGroup)
	}
	fmt.Printf("开始执行巡检任务，共 %d 台网关...\n", len(gateways))
	fmt.Println("================================")

	cluster := sshpkg.NewClusterManager(gateways)
	if inspectConcurrency > 0 {
		cluster.Concurrency = inspectConcurrency
	}
	fmt.Printf("并发连接数: %d\n", cluster.Concurrency)

	if err := cluster.ConnectAll(); err != nil {
		fmt.Fprintf(os.Stderr, "集群连接错误: %v\n", err)
	}
	defer cluster.DisconnectAll()

	if len(cluster.Clients) == 0 {
		fmt.Fprintln(os.Stderr, "错误: 无法连接到任何网关")
		os.Exit(1)
	}

	fmt.Printf("成功连接 %d/%d 台网关\n", len(cluster.Clients), len(gateways))
	fmt.Println("正在并发采集指标...")

	collector := metrics.NewMetricsCollector(cluster)
	collector.SetServiceChecks(cfg.Rules.ServiceChecks)
	if inspectConcurrency > 0 {
		collector.SetConcurrency(inspectConcurrency)
	}
	metricsMap := collector.CollectAll()

	fmt.Println("正在并发执行规则校验...")
	ruleEngine := rules.NewRuleEngine(cfg.Rules)
	if inspectConcurrency > 0 {
		ruleEngine.SetConcurrency(inspectConcurrency * 2)
	}
	checkResults := ruleEngine.CheckAllGateways(metricsMap)

	fmt.Println("正在生成报告...")
	outDir := inspectOutputDir
	if outDir == "" {
		outDir = cfg.Report.OutputDir
	}
	reporter := report.NewReporter(outDir)

	for _, fmtStr := range inspectFormats {
		result, err := reporter.GenerateReport(checkResults, metricsMap, report.ReportFormat(fmtStr))
		if err != nil {
			fmt.Fprintf(os.Stderr, "生成 %s 格式报告失败: %v\n", fmtStr, err)
			continue
		}
		fmt.Println(result)
	}

	fmt.Println("巡检完成!")
}
