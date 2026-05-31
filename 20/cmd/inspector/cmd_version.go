package main

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

var (
	buildTime = "unknown"
	gitCommit = "unknown"
)

func newVersionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "version",
		Short: "显示版本信息",
		Long:  `显示工具版本、构建时间、Git提交等详细信息。`,
		Run:   runVersion,
	}

	return cmd
}

func runVersion(cmd *cobra.Command, args []string) {
	fmt.Println("边缘网关集群巡检工具")
	fmt.Println("========================")
	fmt.Printf("版本:      %s\n", version)
	fmt.Printf("构建时间:  %s\n", buildTime)
	fmt.Printf("Git提交:   %s\n", gitCommit)
	fmt.Printf("Go版本:    %s\n", runtime.Version())
	fmt.Printf("操作系统:  %s/%s\n", runtime.GOOS, runtime.GOARCH)
}
