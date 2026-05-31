package report

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"

	"edge-gateway-inspector/pkg/metrics"
	"edge-gateway-inspector/pkg/rules"
)

type ReportFormat string

const (
	FormatConsole  ReportFormat = "console"
	FormatJSON     ReportFormat = "json"
	FormatHTML     ReportFormat = "html"
	FormatMarkdown ReportFormat = "markdown"
)

type AlertItem struct {
	GatewayName string                 `json:"gateway_name"`
	RuleName    string                 `json:"rule_name"`
	Status      rules.CheckStatus      `json:"status"`
	Severity    rules.Severity         `json:"severity"`
	Message     string                 `json:"message"`
	ActualValue string                 `json:"actual_value"`
}

type InspectionReport struct {
	ReportID       string                   `json:"report_id"`
	ReportTime     time.Time                `json:"report_time"`
	TotalGateways  int                      `json:"total_gateways"`
	HealthyCount   int                      `json:"healthy_count"`
	WarningCount   int                      `json:"warning_count"`
	CriticalCount  int                      `json:"critical_count"`
	GatewayResults map[string]GatewayReport `json:"gateway_results"`
	Alerts         []AlertItem              `json:"alerts"`
	CriticalAlerts []AlertItem              `json:"critical_alerts"`
	WarningAlerts  []AlertItem              `json:"warning_alerts"`
}

type GatewayReport struct {
	GatewayName string                     `json:"gateway_name"`
	Group       string                     `json:"group"`
	Status      string                     `json:"status"`
	Metrics     *metrics.GatewayMetrics    `json:"metrics"`
	CheckResult rules.GatewayCheckResult   `json:"check_result"`
	CheckTime   time.Time                  `json:"check_time"`
}

type Reporter struct {
	OutputDir string
	UseColor  bool
}

func NewReporter(outputDir string) *Reporter {
	if outputDir == "" {
		outputDir = "./reports"
	}
	os.MkdirAll(outputDir, 0755)
	return &Reporter{
		OutputDir: outputDir,
		UseColor:  !isWindowsTerminal() && os.Getenv("NO_COLOR") == "",
	}
}

func (r *Reporter) GenerateReport(checkResults map[string]rules.GatewayCheckResult,
	metricsMap map[string]*metrics.GatewayMetrics, format ReportFormat) (string, error) {

	report := r.buildReport(checkResults, metricsMap)

	switch format {
	case FormatConsole:
		return r.renderConsole(report), nil
	case FormatJSON:
		return r.renderJSON(report)
	case FormatHTML:
		return r.renderHTML(report)
	case FormatMarkdown:
		return r.renderMarkdown(report)
	default:
		return r.renderConsole(report), nil
	}
}

func (r *Reporter) buildReport(checkResults map[string]rules.GatewayCheckResult,
	metricsMap map[string]*metrics.GatewayMetrics) InspectionReport {

	report := InspectionReport{
		ReportID:       fmt.Sprintf("inspect-%s", time.Now().Format("20060102-150405")),
		ReportTime:     time.Now(),
		TotalGateways:  len(checkResults),
		GatewayResults: make(map[string]GatewayReport),
		Alerts:         []AlertItem{},
		CriticalAlerts: []AlertItem{},
		WarningAlerts:  []AlertItem{},
	}

	for name, cr := range checkResults {
		status := "HEALTHY"
		if cr.Failed > 0 {
			status = "CRITICAL"
			report.CriticalCount++
		} else if cr.Warning > 0 {
			status = "WARNING"
			report.WarningCount++
		} else {
			report.HealthyCount++
		}

		for _, result := range cr.Results {
			if result.Status != rules.StatusPass {
				alert := AlertItem{
					GatewayName: name,
					RuleName:    result.RuleName,
					Status:      result.Status,
					Severity:    result.Severity,
					Message:     result.Message,
					ActualValue: result.ActualValue,
				}
				report.Alerts = append(report.Alerts, alert)
				if result.Status == rules.StatusFail {
					report.CriticalAlerts = append(report.CriticalAlerts, alert)
				} else {
					report.WarningAlerts = append(report.WarningAlerts, alert)
				}
			}
		}

		groupName := ""
		if metricsMap[name] != nil {
			groupName = metricsMap[name].Group
		}

		report.GatewayResults[name] = GatewayReport{
			GatewayName: name,
			Group:       groupName,
			Status:      status,
			Metrics:     metricsMap[name],
			CheckResult: cr,
			CheckTime:   time.Now(),
		}
	}

	return report
}

func (r *Reporter) renderConsole(report InspectionReport) string {
	var sb strings.Builder

	sb.WriteString("\n")
	sb.WriteString(strings.Repeat("=", 80) + "\n")
	sb.WriteString(fmt.Sprintf("  边缘网关集群巡检报告 - %s\n", report.ReportTime.Format("2006-01-02 15:04:05")))
	sb.WriteString(strings.Repeat("=", 80) + "\n\n")

	if len(report.CriticalAlerts) > 0 || len(report.WarningAlerts) > 0 {
		alertTitle := "⚠  告警汇总"
		if r.UseColor {
			if len(report.CriticalAlerts) > 0 {
				alertTitle = text.BgHiRed.Sprint(text.FgHiWhite.Sprint(" " + alertTitle + " "))
			} else {
				alertTitle = text.BgHiYellow.Sprint(text.FgHiBlack.Sprint(" " + alertTitle + " "))
			}
		}
		sb.WriteString(alertTitle + "\n")
		sb.WriteString(strings.Repeat("-", 80) + "\n")

		if len(report.CriticalAlerts) > 0 {
			criticalTitle := fmt.Sprintf("  严重异常 (%d 项):", len(report.CriticalAlerts))
			if r.UseColor {
				criticalTitle = text.Bold.Sprint(text.FgHiRed.Sprint(criticalTitle))
			}
			sb.WriteString(criticalTitle + "\n")
			for i, alert := range report.CriticalAlerts {
				alertLine := fmt.Sprintf("    %d. [%s] %s: %s (实际: %s)",
					i+1, alert.GatewayName, alert.RuleName, alert.Message, alert.ActualValue)
				if r.UseColor {
					alertLine = text.FgRed.Sprint(alertLine)
				}
				sb.WriteString(alertLine + "\n")
			}
			sb.WriteString("\n")
		}

		if len(report.WarningAlerts) > 0 {
			warningTitle := fmt.Sprintf("  警告 (%d 项):", len(report.WarningAlerts))
			if r.UseColor {
				warningTitle = text.Bold.Sprint(text.FgHiYellow.Sprint(warningTitle))
			}
			sb.WriteString(warningTitle + "\n")
			for i, alert := range report.WarningAlerts {
				alertLine := fmt.Sprintf("    %d. [%s] %s: %s (实际: %s)",
					i+1, alert.GatewayName, alert.RuleName, alert.Message, alert.ActualValue)
				if r.UseColor {
					alertLine = text.FgYellow.Sprint(alertLine)
				}
				sb.WriteString(alertLine + "\n")
			}
			sb.WriteString("\n")
		}
	} else {
		okTitle := "✓ 所有网关检查通过"
		if r.UseColor {
			okTitle = text.BgHiGreen.Sprint(text.FgHiWhite.Sprint(" " + okTitle + " "))
		}
		sb.WriteString(okTitle + "\n\n")
	}

	sb.WriteString("网关状态概览:\n")
	sb.WriteString(strings.Repeat("-", 80) + "\n")
	t := table.NewWriter()
	t.SetOutputMirror(&sb)
	t.AppendHeader(table.Row{"网关名称", "分组", "状态", "通过", "警告", "严重", "整体结果"})
	t.SetColumnConfigs([]table.ColumnConfig{
		{Number: 1, WidthMax: 18},
		{Number: 2, WidthMax: 12},
		{Number: 3, Align: text.AlignCenter, WidthMax: 8},
		{Number: 4, Align: text.AlignCenter},
		{Number: 5, Align: text.AlignCenter},
		{Number: 6, Align: text.AlignCenter},
		{Number: 7, Align: text.AlignCenter, WidthMax: 8},
	})
	if !r.UseColor {
		t.Style().Color.Header = text.Colors{}
		t.Style().Color.Row = text.Colors{}
	}

	for name, gr := range report.GatewayResults {
		statusColor := text.FgGreen
		statusText := "正常"
		bgColor := text.Colors{}
		if gr.Status == "CRITICAL" {
			statusColor = text.FgHiRed
			statusText = "✗ 异常"
			if r.UseColor {
				bgColor = text.Colors{text.BgRed, text.FgHiWhite}
			}
		} else if gr.Status == "WARNING" {
			statusColor = text.FgHiYellow
			statusText = "⚠ 警告"
			if r.UseColor {
				bgColor = text.Colors{text.BgYellow, text.FgHiBlack}
			}
		}

		groupName := gr.Group
		if groupName == "" {
			groupName = "-"
		}

		coloredStatus := statusText
		coloredResult := statusText
		if r.UseColor {
			if len(bgColor) > 0 {
				coloredStatus = bgColor.Sprint(" " + statusText + " ")
				coloredResult = bgColor.Sprint(" " + statusText + " ")
			} else {
				coloredStatus = text.Bold.Sprint(statusColor.Sprint(statusText))
				coloredResult = text.Bold.Sprint(statusColor.Sprint(statusText))
			}
		}

		coloredWarning := fmt.Sprintf("%d", gr.CheckResult.Warning)
		coloredFailed := fmt.Sprintf("%d", gr.CheckResult.Failed)
		if r.UseColor {
			if gr.CheckResult.Warning > 0 {
				coloredWarning = text.Bold.Sprint(text.FgHiYellow.Sprint(coloredWarning))
			}
			if gr.CheckResult.Failed > 0 {
				coloredFailed = text.Bold.Sprint(text.FgHiRed.Sprint(coloredFailed))
			}
		}

		t.AppendRow(table.Row{
			truncate(name, 18),
			truncate(groupName, 12),
			coloredStatus,
			gr.CheckResult.Passed,
			coloredWarning,
			coloredFailed,
			coloredResult,
		})
	}
	t.AppendSeparator()
	t.AppendFooter(table.Row{"总计", "", "", report.HealthyCount, report.WarningCount, report.CriticalCount, ""})
	t.Render()

	sb.WriteString("\n\n")
	sb.WriteString("详细检查结果:\n")
	sb.WriteString(strings.Repeat("-", 80) + "\n")

	for name, gr := range report.GatewayResults {
		hasIssues := gr.Status == "CRITICAL" || gr.Status == "WARNING"
		gatewayTitle := fmt.Sprintf("\n【%s】", name)
		if r.UseColor {
			if gr.Status == "CRITICAL" {
				gatewayTitle = text.Bold.Sprint(text.BgHiRed.Sprint(text.FgHiWhite.Sprint(" " + gatewayTitle + " CRITICAL ")))
			} else if gr.Status == "WARNING" {
				gatewayTitle = text.Bold.Sprint(text.BgHiYellow.Sprint(text.FgHiBlack.Sprint(" " + gatewayTitle + " WARNING ")))
			} else {
				gatewayTitle = text.Bold.Sprint(text.FgHiGreen.Sprint(gatewayTitle + " ✓ 正常"))
			}
		} else {
			gatewayTitle += " " + gr.Status
		}
		sb.WriteString(gatewayTitle + "\n")
		sb.WriteString(strings.Repeat("-", 40) + "\n")

		dt := table.NewWriter()
		dt.SetOutputMirror(&sb)
		dt.AppendHeader(table.Row{"#", "检查项", "状态", "实际值", "期望值", "消息"})
		dt.SetColumnConfigs([]table.ColumnConfig{
			{Number: 1, WidthMax: 4},
			{Number: 2, WidthMax: 16},
			{Number: 3, WidthMax: 10, Align: text.AlignCenter},
			{Number: 4, WidthMax: 16},
			{Number: 5, WidthMax: 16},
			{Number: 6, WidthMax: 38},
		})
		if !r.UseColor {
			dt.Style().Color.Header = text.Colors{}
		}

		for idx, result := range gr.CheckResult.Results {
			statusColor := text.FgGreen
			statusText := "✓ 通过"
			rowColors := text.Colors{}
			isAbnormal := result.Status == rules.StatusFail || result.Status == rules.StatusWarning

			if result.Status == rules.StatusFail {
				statusColor = text.FgHiRed
				statusText = "✗ 失败"
				if r.UseColor {
					rowColors = text.Colors{text.BgRed, text.FgHiWhite}
				}
			} else if result.Status == rules.StatusWarning {
				statusColor = text.FgHiYellow
				statusText = "⚠ 警告"
				if r.UseColor {
					rowColors = text.Colors{text.BgYellow, text.FgHiBlack}
				}
			}

			coloredStatus := statusText
			coloredName := result.RuleName
			coloredActual := result.ActualValue
			coloredExpected := result.ExpectedValue
			coloredMessage := result.Message

			if r.UseColor {
				if len(rowColors) > 0 {
					coloredStatus = text.Bold.Sprint(rowColors.Sprint(" " + statusText + " "))
					coloredName = text.Bold.Sprint(statusColor.Sprint(coloredName))
					coloredActual = text.Bold.Sprint(statusColor.Sprint(coloredActual))
					coloredMessage = text.Bold.Sprint(statusColor.Sprint(coloredMessage))
				} else {
					coloredStatus = statusColor.Sprint(statusText)
				}
			}

			_ = isAbnormal
			dt.AppendRow(table.Row{
				idx + 1,
				truncate(coloredName, 16),
				coloredStatus,
				truncate(coloredActual, 16),
				truncate(coloredExpected, 16),
				truncate(coloredMessage, 38),
			})
		}
		dt.Render()

		if gr.Metrics != nil {
			memUsed := formatBytes(gr.Metrics.SystemMetrics.MemoryUsed)
			memTotal := formatBytes(gr.Metrics.SystemMetrics.MemoryTotal)
			rxBytes := formatBytes(gr.Metrics.NetworkMetrics.TrafficIn)
			txBytes := formatBytes(gr.Metrics.NetworkMetrics.TrafficOut)

			sysTitle := "\n  系统摘要:"
			if r.UseColor && hasIssues {
				sysTitle = text.Bold.Sprint(sysTitle)
			}
			sb.WriteString(sysTitle + "\n")

			cpuVal := fmt.Sprintf("%.1f%%", gr.Metrics.SystemMetrics.CPUUsage)
			memVal := fmt.Sprintf("%s/%s", memUsed, memTotal)
			loadVal := fmt.Sprintf("%.2f/%.2f/%.2f",
				gr.Metrics.SystemMetrics.LoadAverage1,
				gr.Metrics.SystemMetrics.LoadAverage5,
				gr.Metrics.SystemMetrics.LoadAverage15)
			trafficVal := fmt.Sprintf("入 %s / 出 %s", rxBytes, txBytes)
			connVal := fmt.Sprintf("%d", gr.Metrics.NetworkMetrics.Connections)
			uptimeVal := truncate(gr.Metrics.SystemMetrics.Uptime, 30)

			if r.UseColor {
				for _, res := range gr.CheckResult.Results {
					if res.RuleID == "cpu_usage_high" && res.Status != rules.StatusPass {
						cpuVal = text.Bold.Sprint(text.FgHiRed.Sprint(cpuVal))
					}
					if res.RuleID == "memory_usage_high" && res.Status != rules.StatusPass {
						memVal = text.Bold.Sprint(text.FgHiRed.Sprint(memVal))
					}
					if res.RuleID == "load_average_high" && res.Status != rules.StatusPass {
						loadVal = text.Bold.Sprint(text.FgHiYellow.Sprint(loadVal))
					}
					if res.RuleID == "network_connections" && res.Status != rules.StatusPass {
						connVal = text.Bold.Sprint(text.FgHiYellow.Sprint(connVal))
					}
				}
			}

			sb.WriteString(fmt.Sprintf("    CPU: %s | 内存: %s | 负载: %s\n",
				cpuVal, memVal, loadVal))
			sb.WriteString(fmt.Sprintf("    流量: %s | 连接: %s | 运行: %s\n",
				trafficVal, connVal, uptimeVal))
		}
	}

	sb.WriteString("\n")
	sb.WriteString(strings.Repeat("=", 80) + "\n")
	summary := fmt.Sprintf("  总结: 总计 %d 台网关, 正常 %d 台, 警告 %d 台, 异常 %d 台",
		report.TotalGateways, report.HealthyCount, report.WarningCount, report.CriticalCount)
	if r.UseColor {
		if report.CriticalCount > 0 {
			summary = text.Bold.Sprint(text.BgHiRed.Sprint(text.FgHiWhite.Sprint(summary)))
		} else if report.WarningCount > 0 {
			summary = text.Bold.Sprint(text.BgHiYellow.Sprint(text.FgHiBlack.Sprint(summary)))
		} else {
			summary = text.Bold.Sprint(text.BgHiGreen.Sprint(text.FgHiWhite.Sprint(summary)))
		}
	}
	sb.WriteString(summary + "\n")
	sb.WriteString(strings.Repeat("=", 80) + "\n")

	return sb.String()
}

func (r *Reporter) renderJSON(report InspectionReport) (string, error) {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return "", fmt.Errorf("JSON序列化失败: %w", err)
	}

	filename := filepath.Join(r.OutputDir, fmt.Sprintf("%s.json", report.ReportID))
	if err := os.WriteFile(filename, data, 0644); err != nil {
		return "", fmt.Errorf("写入JSON文件失败: %w", err)
	}

	return fmt.Sprintf("JSON报告已保存至: %s", filename), nil
}

func (r *Reporter) renderHTML(report InspectionReport) (string, error) {
	const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>边缘网关集群巡检报告 - {{.ReportID}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif; background: #f5f7fa; padding: 20px; color: #333; }
        .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { color: #1a365d; text-align: center; margin-bottom: 10px; font-size: 28px; }
        .subtitle { text-align: center; color: #718096; margin-bottom: 30px; }
        .alert-section { margin: 20px 0; padding: 20px; border-radius: 10px; }
        .alert-section.critical { background: linear-gradient(135deg, #fff5f5 0%, #fff0f0 100%); border: 2px solid #fc8181; }
        .alert-section.warning { background: linear-gradient(135deg, #fffbeb 0%, #fefce8 100%); border: 2px solid #f6e05e; }
        .alert-section.healthy { background: linear-gradient(135deg, #f0fff4 0%, #f0fff4 100%); border: 2px solid #68d391; }
        .alert-title { font-size: 18px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .alert-title.critical { color: #c53030; }
        .alert-title.warning { color: #b7791f; }
        .alert-title.healthy { color: #276749; }
        .alert-icon { font-size: 24px; }
        .alert-list { list-style: none; }
        .alert-list li { padding: 10px 15px; margin: 8px 0; border-radius: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; align-items: center; gap: 10px; }
        .alert-list li.critical { border-left: 4px solid #e53e3e; }
        .alert-list li.warning { border-left: 4px solid #d69e2e; }
        .alert-gateway { font-weight: 600; color: #2d3748; min-width: 120px; }
        .alert-rule { color: #4a5568; font-weight: 500; }
        .alert-msg { color: #718096; flex: 1; }
        .alert-value { color: #e53e3e; font-weight: 600; font-family: monospace; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .summary-card { padding: 25px; border-radius: 10px; text-align: center; color: white; transition: transform 0.2s; position: relative; overflow: hidden; }
        .summary-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; }
        .summary-card:hover { transform: translateY(-3px); }
        .summary-card.total { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .summary-card.total::after { background: rgba(255,255,255,0.3); }
        .summary-card.healthy { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
        .summary-card.healthy::after { background: rgba(255,255,255,0.3); }
        .summary-card.warning { background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); }
        .summary-card.warning::after { background: rgba(255,255,255,0.3); animation: pulse 2s infinite; }
        .summary-card.critical { background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); }
        .summary-card.critical::after { background: rgba(255,255,255,0.3); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .summary-card .number { font-size: 42px; font-weight: 700; margin-bottom: 5px; }
        .summary-card .label { font-size: 14px; opacity: 0.95; }
        h2 { color: #2d3748; margin: 30px 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); color: white; font-weight: 600; }
        tr:hover { background: #f7fafc; }
        tr.row-critical { background: #fff5f5; }
        tr.row-critical:hover { background: #fed7d7; }
        tr.row-warning { background: #fffbeb; }
        tr.row-warning:hover { background: #fefcbf; }
        .status-healthy { color: #38a169; font-weight: 700; }
        .status-warning { color: #d69e2e; font-weight: 700; }
        .status-critical { color: #e53e3e; font-weight: 700; }
        .gateway-section { margin: 40px 0; padding: 25px; border: 2px solid #e2e8f0; border-radius: 10px; transition: all 0.2s; }
        .gateway-section.status-critical { border-color: #fc8181; background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%); }
        .gateway-section.status-warning { border-color: #f6e05e; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); }
        .gateway-section:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .gateway-title { font-size: 20px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 10px; }
        .gateway-title::before { content: ''; width: 4px; height: 24px; border-radius: 2px; }
        .gateway-title.status-healthy::before { background: #38a169; }
        .gateway-title.status-warning::before { background: #d69e2e; }
        .gateway-title.status-critical::before { background: #e53e3e; }
        .gateway-group { font-size: 14px; color: #718096; background: #edf2f7; padding: 3px 10px; border-radius: 12px; margin-left: auto; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric-card { background: #f7fafc; padding: 18px; border-radius: 8px; border-left: 4px solid #4299e1; transition: all 0.2s; }
        .metric-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .metric-card.alert-critical { border-left-color: #e53e3e; background: #fff5f5; }
        .metric-card.alert-warning { border-left-color: #d69e2e; background: #fffbeb; }
        .metric-label { font-size: 12px; color: #718096; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .metric-value { font-size: 20px; font-weight: 700; color: #2d3748; }
        .metric-value.alert-critical { color: #e53e3e; }
        .metric-value.alert-warning { color: #d69e2e; }
        .check-pass { color: #38a169; font-weight: 600; }
        .check-fail { color: #e53e3e; font-weight: 600; }
        .check-warning { color: #d69e2e; font-weight: 600; }
        .footer { text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 13px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .badge-pass { background: #c6f6d5; color: #22543d; }
        .badge-fail { background: #fed7d7; color: #742a2a; animation: pulse 1.5s infinite; }
        .badge-warning { background: #fefcbf; color: #744210; }
    </style>
</head>
<body>
    <div class="container">
        <h1>边缘网关集群巡检报告</h1>
        <p class="subtitle">生成时间: {{.ReportTime.Format "2006-01-02 15:04:05"}} | 报告ID: {{.ReportID}}</p>

        {{if or .CriticalAlerts .WarningAlerts}}
            {{if .CriticalAlerts}}
            <div class="alert-section critical">
                <div class="alert-title critical">
                    <span class="alert-icon">🚨</span>
                    严重异常告警 ({{len .CriticalAlerts}} 项) - 需要立即处理
                </div>
                <ul class="alert-list">
                    {{range $idx, $alert := .CriticalAlerts}}
                    <li class="critical">
                        <span class="alert-gateway">{{$alert.GatewayName}}</span>
                        <span class="alert-rule">[{{$alert.RuleName}}]</span>
                        <span class="alert-msg">{{$alert.Message}}</span>
                        <span class="alert-value">{{$alert.ActualValue}}</span>
                    </li>
                    {{end}}
                </ul>
            </div>
            {{end}}

            {{if .WarningAlerts}}
            <div class="alert-section warning">
                <div class="alert-title warning">
                    <span class="alert-icon">⚠️</span>
                    警告 ({{len .WarningAlerts}} 项) - 建议关注
                </div>
                <ul class="alert-list">
                    {{range $idx, $alert := .WarningAlerts}}
                    <li class="warning">
                        <span class="alert-gateway">{{$alert.GatewayName}}</span>
                        <span class="alert-rule">[{{$alert.RuleName}}]</span>
                        <span class="alert-msg">{{$alert.Message}}</span>
                        <span class="alert-value">{{$alert.ActualValue}}</span>
                    </li>
                    {{end}}
                </ul>
            </div>
            {{end}}
        {{else}}
        <div class="alert-section healthy">
            <div class="alert-title healthy">
                <span class="alert-icon">✅</span>
                所有网关检查通过，运行正常
            </div>
        </div>
        {{end}}

        <div class="summary">
            <div class="summary-card total">
                <div class="number">{{.TotalGateways}}</div>
                <div class="label">总计网关</div>
            </div>
            <div class="summary-card healthy">
                <div class="number">{{.HealthyCount}}</div>
                <div class="label">正常运行</div>
            </div>
            <div class="summary-card warning">
                <div class="number">{{.WarningCount}}</div>
                <div class="label">存在警告</div>
            </div>
            <div class="summary-card critical">
                <div class="number">{{.CriticalCount}}</div>
                <div class="label">存在异常</div>
            </div>
        </div>

        <h2>概览表</h2>
        <table>
            <tr>
                <th>网关名称</th>
                <th>分组</th>
                <th>状态</th>
                <th>通过</th>
                <th>警告</th>
                <th>严重</th>
            </tr>
            {{range $name, $gr := .GatewayResults}}
            <tr class="{{if eq $gr.Status "CRITICAL"}}row-critical{{else if eq $gr.Status "WARNING"}}row-warning{{end}}">
                <td><strong>{{$name}}</strong></td>
                <td>{{if $gr.Group}}{{$gr.Group}}{{else}}-{{end}}</td>
                <td class="status-{{toLower $gr.Status}}">{{$gr.Status}}</td>
                <td>{{$gr.CheckResult.Passed}}</td>
                <td class="status-warning">{{$gr.CheckResult.Warning}}</td>
                <td class="status-critical">{{$gr.CheckResult.Failed}}</td>
            </tr>
            {{end}}
        </table>

        {{range $name, $gr := .GatewayResults}}
        <div class="gateway-section status-{{toLower $gr.Status}}">
            <div class="gateway-title status-{{toLower $gr.Status}}">
                {{$name}} - {{$gr.Status}}
                {{if $gr.Group}}<span class="gateway-group">{{$gr.Group}}</span>{{end}}
            </div>

            {{if $gr.Metrics}}
            <div class="metrics-grid">
                {{$cpuAlert := "none"}}
                {{$memAlert := "none"}}
                {{$loadAlert := "none"}}
                {{$connAlert := "none"}}
                {{range $result := $gr.CheckResult.Results}}
                    {{if and (eq $result.RuleID "cpu_usage_high") (ne $result.Status "PASS")}}
                        {{if eq $result.Status "FAIL"}}{{$cpuAlert = "critical"}}{{else}}{{$cpuAlert = "warning"}}{{end}}
                    {{end}}
                    {{if and (eq $result.RuleID "memory_usage_high") (ne $result.Status "PASS")}}
                        {{if eq $result.Status "FAIL"}}{{$memAlert = "critical"}}{{else}}{{$memAlert = "warning"}}{{end}}
                    {{end}}
                    {{if and (eq $result.RuleID "load_average_high") (ne $result.Status "PASS")}}
                        {{if eq $result.Status "FAIL"}}{{$loadAlert = "critical"}}{{else}}{{$loadAlert = "warning"}}{{end}}
                    {{end}}
                    {{if and (eq $result.RuleID "network_connections") (ne $result.Status "PASS")}}
                        {{if eq $result.Status "FAIL"}}{{$connAlert = "critical"}}{{else}}{{$connAlert = "warning"}}{{end}}
                    {{end}}
                {{end}}

                <div class="metric-card {{if ne $cpuAlert "none"}}alert-{{$cpuAlert}}{{end}}">
                    <div class="metric-label">CPU使用率</div>
                    <div class="metric-value {{if ne $cpuAlert "none"}}alert-{{$cpuAlert}}{{end}}">{{printf "%.1f" $gr.Metrics.SystemMetrics.CPUUsage}}%</div>
                </div>
                <div class="metric-card {{if ne $memAlert "none"}}alert-{{$memAlert}}{{end}}">
                    <div class="metric-label">内存使用</div>
                    <div class="metric-value {{if ne $memAlert "none"}}alert-{{$memAlert}}{{end}}">{{formatBytes $gr.Metrics.SystemMetrics.MemoryUsed}} / {{formatBytes $gr.Metrics.SystemMetrics.MemoryTotal}}</div>
                </div>
                <div class="metric-card {{if ne $loadAlert "none"}}alert-{{$loadAlert}}{{end}}">
                    <div class="metric-label">系统负载 (1/5/15m)</div>
                    <div class="metric-value {{if ne $loadAlert "none"}}alert-{{$loadAlert}}{{end}}">{{printf "%.2f / %.2f / %.2f" $gr.Metrics.SystemMetrics.LoadAverage1 $gr.Metrics.SystemMetrics.LoadAverage5 $gr.Metrics.SystemMetrics.LoadAverage15}}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">网络流量 (入/出)</div>
                    <div class="metric-value">{{formatBytes $gr.Metrics.NetworkMetrics.TrafficIn}} / {{formatBytes $gr.Metrics.NetworkMetrics.TrafficOut}}</div>
                </div>
                <div class="metric-card {{if ne $connAlert "none"}}alert-{{$connAlert}}{{end}}">
                    <div class="metric-label">网络连接</div>
                    <div class="metric-value {{if ne $connAlert "none"}}alert-{{$connAlert}}{{end}}">{{$gr.Metrics.NetworkMetrics.Connections}}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">运行时间</div>
                    <div class="metric-value">{{$gr.Metrics.SystemMetrics.Uptime}}</div>
                </div>
            </div>
            {{end}}

            <h3>检查详情</h3>
            <table>
                <tr>
                    <th>#</th>
                    <th>检查项</th>
                    <th>状态</th>
                    <th>实际值</th>
                    <th>期望值</th>
                    <th>消息</th>
                </tr>
                {{range $idx, $result := $gr.CheckResult.Results}}
                <tr class="{{if eq $result.Status "FAIL"}}row-critical{{else if eq $result.Status "WARNING"}}row-warning{{end}}">
                    <td>{{add $idx 1}}</td>
                    <td><strong>{{$result.RuleName}}</strong></td>
                    <td><span class="badge badge-{{toLower $result.Status}}">{{$result.Status}}</span></td>
                    <td class="{{if eq $result.Status "FAIL"}}check-fail{{else if eq $result.Status "WARNING"}}check-warning{{end}}">{{$result.ActualValue}}</td>
                    <td>{{$result.ExpectedValue}}</td>
                    <td>{{$result.Message}}</td>
                </tr>
                {{end}}
            </table>
        </div>
        {{end}}

        <div class="footer">
            边缘网关巡检系统 v1.0 | 报告ID: {{.ReportID}} | 自动生成
        </div>
    </div>
</body>
</html>`

	funcMap := template.FuncMap{
		"toLower": strings.ToLower,
		"formatBytes": func(b uint64) string {
			return formatBytes(b)
		},
		"add": func(a, b int) int {
			return a + b
		},
	}

	tmpl, err := template.New("report").Funcs(funcMap).Parse(htmlTemplate)
	if err != nil {
		return "", fmt.Errorf("解析HTML模板失败: %w", err)
	}

	filename := filepath.Join(r.OutputDir, fmt.Sprintf("%s.html", report.ReportID))
	file, err := os.Create(filename)
	if err != nil {
		return "", fmt.Errorf("创建HTML文件失败: %w", err)
	}
	defer file.Close()

	if err := tmpl.Execute(file, report); err != nil {
		return "", fmt.Errorf("渲染HTML模板失败: %w", err)
	}

	return fmt.Sprintf("HTML报告已保存至: %s", filename), nil
}

func (r *Reporter) renderMarkdown(report InspectionReport) (string, error) {
	var sb strings.Builder

	sb.WriteString("# 边缘网关集群巡检报告\n\n")
	sb.WriteString(fmt.Sprintf("**生成时间**: %s  \n", report.ReportTime.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("**报告ID**: %s  \n\n", report.ReportID))

	sb.WriteString("## 概览\n\n")
	sb.WriteString("| 总计 | 正常 | 警告 | 异常 |\n")
	sb.WriteString("|------|------|------|------|\n")
	sb.WriteString(fmt.Sprintf("| %d | %d | %d | %d |\n\n",
		report.TotalGateways, report.HealthyCount, report.WarningCount, report.CriticalCount))

	sb.WriteString("## 网关状态\n\n")
	sb.WriteString("| 网关名称 | 状态 | 通过 | 警告 | 严重 |\n")
	sb.WriteString("|----------|------|------|------|------|\n")
	for name, gr := range report.GatewayResults {
		sb.WriteString(fmt.Sprintf("| %s | %s | %d | %d | %d |\n",
			escapeMD(name), gr.Status, gr.CheckResult.Passed, gr.CheckResult.Warning, gr.CheckResult.Failed))
	}
	sb.WriteString("\n")

	for name, gr := range report.GatewayResults {
		sb.WriteString(fmt.Sprintf("## %s - %s\n\n", escapeMD(name), gr.Status))

		if gr.Metrics != nil {
			sb.WriteString("### 系统指标\n\n")
			sb.WriteString("- **CPU使用率**: " + fmt.Sprintf("%.1f%%\n", gr.Metrics.SystemMetrics.CPUUsage))
			sb.WriteString("- **内存使用**: " + formatBytes(gr.Metrics.SystemMetrics.MemoryUsed) + " / " + formatBytes(gr.Metrics.SystemMetrics.MemoryTotal) + "\n")
			sb.WriteString("- **系统负载**: " + fmt.Sprintf("%.2f / %.2f / %.2f (1/5/15分钟)\n",
				gr.Metrics.SystemMetrics.LoadAverage1,
				gr.Metrics.SystemMetrics.LoadAverage5,
				gr.Metrics.SystemMetrics.LoadAverage15))
			sb.WriteString("- **网络流量**: 入 " + formatBytes(gr.Metrics.NetworkMetrics.TrafficIn) + " / 出 " + formatBytes(gr.Metrics.NetworkMetrics.TrafficOut) + "\n")
			sb.WriteString("- **网络连接**: " + fmt.Sprintf("%d\n", gr.Metrics.NetworkMetrics.Connections))
			sb.WriteString("- **运行时间**: " + gr.Metrics.SystemMetrics.Uptime + "\n\n")
		}

		sb.WriteString("### 检查详情\n\n")
		sb.WriteString("| # | 检查项 | 状态 | 实际值 | 期望值 | 消息 |\n")
		sb.WriteString("|---|--------|------|--------|--------|------|\n")
		for idx, result := range gr.CheckResult.Results {
			sb.WriteString(fmt.Sprintf("| %d | %s | %s | %s | %s | %s |\n",
				idx+1,
				escapeMD(result.RuleName),
				result.Status,
				escapeMD(result.ActualValue),
				escapeMD(result.ExpectedValue),
				escapeMD(result.Message)))
		}
		sb.WriteString("\n")
	}

	filename := filepath.Join(r.OutputDir, fmt.Sprintf("%s.md", report.ReportID))
	if err := os.WriteFile(filename, []byte(sb.String()), 0644); err != nil {
		return "", fmt.Errorf("写入Markdown文件失败: %w", err)
	}

	return fmt.Sprintf("Markdown报告已保存至: %s", filename), nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}

func escapeMD(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "`", "\\`")
	s = strings.ReplaceAll(s, "*", "\\*")
	s = strings.ReplaceAll(s, "_", "\\_")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

func isWindowsTerminal() bool {
	return runtime.GOOS == "windows"
}
