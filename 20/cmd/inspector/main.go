package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	cfgFile string
	verbose bool
)

var version = "1.0.0"

func main() {
	rootCmd := &cobra.Command{
		Use:   "inspector",
		Short: "边缘网关集群状态巡检工具",
		Long:  `边缘网关集群状态巡检命令行工具集 - 批量远程连接边缘网关、采集运行指标、按规则校验异常、生成结构化巡检报告、配置定时自动巡检。`,
		Version: version,
	}

	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "配置文件路径")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "详细输出模式")

	rootCmd.AddCommand(newInspectCmd())
	rootCmd.AddCommand(newScheduleCmd())
	rootCmd.AddCommand(newConfigCmd())
	rootCmd.AddCommand(newListCmd())
	rootCmd.AddCommand(newTestCmd())
	rootCmd.AddCommand(newVersionCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
