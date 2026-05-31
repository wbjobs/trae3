package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"edge-gateway-inspector/pkg/config"
	sshpkg "edge-gateway-inspector/pkg/ssh"
)

func newTestCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "test [gateway-name]",
		Short: "测试网关连接",
		Long:  `测试指定网关或所有网关的SSH连接是否正常。`,
		Args:  cobra.MaximumNArgs(1),
		Run:   runTest,
	}

	return cmd
}

func runTest(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	targetName := ""
	if len(args) > 0 {
		targetName = args[0]
	}

	testGateways := buildGatewayList(cfg, targetName, "")
	if len(testGateways) == 0 {
		if targetName != "" {
			fmt.Fprintf(os.Stderr, "未找到网关: %s\n", targetName)
		} else {
			fmt.Fprintln(os.Stderr, "没有找到可测试的网关")
		}
		os.Exit(1)
	}

	fmt.Printf("测试 %d 个网关的连接...\n", len(testGateways))
	fmt.Println("================================")

	success := 0
	for _, gw := range testGateways {
		fmt.Printf("测试 %s (%s)... ", gw.Name, gw.Host)
		client, err := sshpkg.NewSSHClient(gw)
		if err != nil {
			fmt.Printf("✗ 失败: %v\n", err)
		} else {
			fmt.Println("✓ 成功")
			client.Close()
			success++
		}
	}

	fmt.Println("================================")
	fmt.Printf("测试完成: %d/%d 成功\n", success, len(testGateways))

	if success < len(testGateways) {
		os.Exit(1)
	}
}
