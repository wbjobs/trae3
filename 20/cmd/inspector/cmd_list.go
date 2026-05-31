package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"edge-gateway-inspector/pkg/config"
)

func newListCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出已配置的网关",
		Run:   runList,
	}

	return cmd
}

func runList(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	if len(cfg.Gateways) == 0 {
		fmt.Println("没有配置任何网关")
		return
	}

	fmt.Println("已配置的网关列表:")
	fmt.Println("================================")
	for i, gw := range cfg.Gateways {
		status := "✗ 禁用"
		if gw.Enabled {
			status = "✓ 启用"
		}
		authType := "无认证"
		if gw.PrivateKey != "" {
			authType = "密钥"
		} else if gw.Password != "" {
			authType = "密码"
		}
		fmt.Printf("%d. %s\n", i+1, gw.Name)
		fmt.Printf("   地址: %s@%s:%d\n", gw.Username, gw.Host, gw.Port)
		fmt.Printf("   认证: %s\n", authType)
		fmt.Printf("   状态: %s\n", status)
		fmt.Println()
	}
}
