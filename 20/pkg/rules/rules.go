package rules

import (
	"fmt"
	"sync"

	"edge-gateway-inspector/pkg/config"
	"edge-gateway-inspector/pkg/metrics"
)

type Severity string

const (
	SeverityCritical Severity = "CRITICAL"
	SeverityWarning  Severity = "WARNING"
	SeverityInfo     Severity = "INFO"
	SeverityOK       Severity = "OK"
)

type CheckStatus string

const (
	StatusPass    CheckStatus = "PASS"
	StatusFail    CheckStatus = "FAIL"
	StatusWarning CheckStatus = "WARNING"
)

type Rule struct {
	ID          string
	Name        string
	Description string
	Severity    Severity
	Thresholds  config.RulesConfig
	Check       func(*metrics.GatewayMetrics, config.RulesConfig) RuleResult
}

type RuleResult struct {
	RuleID        string      `json:"rule_id"`
	RuleName      string      `json:"rule_name"`
	Status        CheckStatus `json:"status"`
	Severity      Severity    `json:"severity"`
	Message       string      `json:"message"`
	ActualValue   string      `json:"actual_value"`
	ExpectedValue string      `json:"expected_value"`
}

type GatewayCheckResult struct {
	GatewayName string       `json:"gateway_name"`
	Passed      int          `json:"passed"`
	Warning     int          `json:"warning"`
	Failed      int          `json:"failed"`
	Results     []RuleResult `json:"results"`
}

type RuleEngine struct {
	rules       []Rule
	thresholds  config.RulesConfig
	concurrency int
}

func NewRuleEngine(cfg config.RulesConfig) *RuleEngine {
	re := &RuleEngine{
		thresholds:  cfg,
		concurrency: 10,
	}
	re.registerDefaultRules()
	return re
}

func (re *RuleEngine) SetConcurrency(n int) {
	if n > 0 {
		re.concurrency = n
	}
}

func (re *RuleEngine) AddRule(rule Rule) {
	rule.Thresholds = re.thresholds
	re.rules = append(re.rules, rule)
}

func (re *RuleEngine) registerDefaultRules() {
	re.rules = []Rule{
		{
			ID:          "cpu_usage_high",
			Name:        "CPU使用率检查",
			Description: "检查CPU使用率是否过高",
			Severity:    SeverityWarning,
			Thresholds:  re.thresholds,
			Check:       checkCPUUsage,
		},
		{
			ID:          "memory_usage_high",
			Name:        "内存使用率检查",
			Description: "检查内存使用率是否过高",
			Severity:    SeverityCritical,
			Thresholds:  re.thresholds,
			Check:       checkMemoryUsage,
		},
		{
			ID:          "disk_usage_high",
			Name:        "磁盘使用率检查",
			Description: "检查磁盘使用率是否过高",
			Severity:    SeverityCritical,
			Thresholds:  re.thresholds,
			Check:       checkDiskUsage,
		},
		{
			ID:          "load_average_high",
			Name:        "负载均衡检查",
			Description: "检查系统负载是否过高",
			Severity:    SeverityWarning,
			Thresholds:  re.thresholds,
			Check:       checkLoadAverage,
		},
		{
			ID:          "swap_usage_high",
			Name:        "Swap使用检查",
			Description: "检查Swap分区使用率是否过高",
			Severity:    SeverityWarning,
			Thresholds:  re.thresholds,
			Check:       checkSwapUsage,
		},
		{
			ID:          "zombie_processes",
			Name:        "僵尸进程检查",
			Description: "检查是否存在僵尸进程",
			Severity:    SeverityWarning,
			Thresholds:  re.thresholds,
			Check:       checkZombieProcesses,
		},
		{
			ID:          "service_status",
			Name:        "服务状态检查",
			Description: "检查关键服务是否运行",
			Severity:    SeverityCritical,
			Thresholds:  re.thresholds,
			Check:       checkServiceStatus,
		},
		{
			ID:          "network_connections",
			Name:        "网络连接检查",
			Description: "检查网络连接数是否异常",
			Severity:    SeverityWarning,
			Thresholds:  re.thresholds,
			Check:       checkNetworkConnections,
		},
	}
}

func (re *RuleEngine) CheckGateway(gm *metrics.GatewayMetrics) GatewayCheckResult {
	result := GatewayCheckResult{
		GatewayName: gm.GatewayName,
	}

	for _, rule := range re.rules {
		ruleResult := rule.Check(gm, re.thresholds)
		ruleResult.RuleID = rule.ID
		ruleResult.RuleName = rule.Name
		ruleResult.Severity = rule.Severity
		result.Results = append(result.Results, ruleResult)

		switch ruleResult.Status {
		case StatusPass:
			result.Passed++
		case StatusWarning:
			result.Warning++
		case StatusFail:
			result.Failed++
		}
	}

	return result
}

func (re *RuleEngine) CheckAllGateways(metricsMap map[string]*metrics.GatewayMetrics) map[string]GatewayCheckResult {
	results := make(map[string]GatewayCheckResult)
	var mu sync.Mutex
	var wg sync.WaitGroup

	total := len(metricsMap)
	if total == 0 {
		return results
	}

	sem := make(chan struct{}, re.concurrency)

	for name, gm := range metricsMap {
		wg.Add(1)
		go func(name string, gm *metrics.GatewayMetrics) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			result := re.CheckGateway(gm)

			mu.Lock()
			results[name] = result
			mu.Unlock()
		}(name, gm)
	}
	wg.Wait()

	return results
}

func checkCPUUsage(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.CPUThreshold
	if threshold <= 0 {
		threshold = 80.0
	}

	actual := fmt.Sprintf("%.1f%%", gm.SystemMetrics.CPUUsage)
	expected := fmt.Sprintf("< %.1f%%", threshold)

	if gm.SystemMetrics.CPUUsage <= 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "CPU使用率采集失败或为0，可能采集命令不兼容",
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}

	if gm.SystemMetrics.CPUUsage > threshold {
		return RuleResult{
			Status:        StatusFail,
			Message:       fmt.Sprintf("CPU使用率过高: %.1f%%", gm.SystemMetrics.CPUUsage),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("CPU使用率正常: %.1f%%", gm.SystemMetrics.CPUUsage),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkMemoryUsage(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.MemoryThreshold
	if threshold <= 0 {
		threshold = 85.0
	}

	if gm.SystemMetrics.MemoryTotal == 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "内存信息采集失败，无法获取内存总量",
			ActualValue:   "N/A",
			ExpectedValue:   fmt.Sprintf("< %.1f%%", threshold),
		}
	}

	var usage float64
	usage = float64(gm.SystemMetrics.MemoryUsed) / float64(gm.SystemMetrics.MemoryTotal) * 100

	actual := fmt.Sprintf("%.1f%%", usage)
	expected := fmt.Sprintf("< %.1f%%", threshold)

	if usage > threshold {
		return RuleResult{
			Status:        StatusFail,
			Message:       fmt.Sprintf("内存使用率过高: %.1f%% (已用: %s / 总计: %s)",
				usage, formatBytes(gm.SystemMetrics.MemoryUsed), formatBytes(gm.SystemMetrics.MemoryTotal)),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("内存使用率正常: %.1f%%", usage),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkDiskUsage(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.DiskThreshold
	if threshold <= 0 {
		threshold = 90.0
	}

	if len(gm.DiskMetrics.Disks) == 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "未采集到任何磁盘信息，可能df命令不兼容或无权限",
			ActualValue:   "N/A",
			ExpectedValue: fmt.Sprintf("< %.1f%%", threshold),
		}
	}

	var maxUsage float64
	var maxMount string
	var hasError bool

	for _, disk := range gm.DiskMetrics.Disks {
		if disk.Total == 0 {
			hasError = true
			continue
		}
		if disk.UsagePercent > maxUsage {
			maxUsage = disk.UsagePercent
			maxMount = disk.MountPoint
		}
	}

	if maxUsage == 0 && hasError {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "磁盘容量信息异常，所有磁盘总容量为0",
			ActualValue:   "N/A",
			ExpectedValue: fmt.Sprintf("< %.1f%%", threshold),
		}
	}

	actual := fmt.Sprintf("%.1f%% (%s)", maxUsage, maxMount)
	expected := fmt.Sprintf("< %.1f%%", threshold)

	if maxUsage > threshold {
		return RuleResult{
			Status:        StatusFail,
			Message:       fmt.Sprintf("磁盘使用率过高: %s 使用率 %.1f%%", maxMount, maxUsage),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("磁盘使用率正常: 最高 %.1f%% (%s)", maxUsage, maxMount),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkLoadAverage(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	loadFactor := cfg.LoadThreshold
	if loadFactor <= 0 {
		loadFactor = 1.5
	}
	cpuCount := float64(gm.SystemMetrics.CPUCount)
	if cpuCount == 0 {
		cpuCount = 1
	}
	threshold := cpuCount * loadFactor

	actual := fmt.Sprintf("%.2f / %.2f (15min)", gm.SystemMetrics.LoadAverage15, threshold)
	expected := fmt.Sprintf("< %.2f", threshold)

	if gm.SystemMetrics.LoadAverage15 == 0 && gm.SystemMetrics.LoadAverage1 == 0 && gm.SystemMetrics.LoadAverage5 == 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "系统负载信息采集失败",
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}

	if gm.SystemMetrics.LoadAverage15 > threshold {
		return RuleResult{
			Status:        StatusWarning,
			Message:       fmt.Sprintf("系统负载过高: 15分钟平均负载 %.2f", gm.SystemMetrics.LoadAverage15),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("系统负载正常: 15分钟平均负载 %.2f", gm.SystemMetrics.LoadAverage15),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkSwapUsage(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.SwapThreshold
	if threshold <= 0 {
		threshold = 50.0
	}

	if gm.SystemMetrics.SwapTotal == 0 {
		return RuleResult{
			Status:        StatusPass,
			Message:       "无Swap分区或Swap已禁用",
			ActualValue:   "N/A",
			ExpectedValue: "N/A",
		}
	}

	var usage float64
	usage = float64(gm.SystemMetrics.SwapUsed) / float64(gm.SystemMetrics.SwapTotal) * 100

	actual := fmt.Sprintf("%.1f%%", usage)
	expected := fmt.Sprintf("< %.1f%%", threshold)

	if usage > threshold {
		return RuleResult{
			Status:        StatusWarning,
			Message:       fmt.Sprintf("Swap使用率过高: %.1f%%", usage),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("Swap使用率正常: %.1f%%", usage),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkZombieProcesses(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.ZombieThreshold
	if threshold <= 0 {
		threshold = 5
	}

	actual := fmt.Sprintf("%d", gm.ProcessMetrics.ZombieProcesses)
	expected := fmt.Sprintf("<= %d", threshold)

	if gm.ProcessMetrics.ZombieProcesses > threshold {
		return RuleResult{
			Status:        StatusWarning,
			Message:       fmt.Sprintf("存在过多僵尸进程: %d个", gm.ProcessMetrics.ZombieProcesses),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("僵尸进程数正常: %d个", gm.ProcessMetrics.ZombieProcesses),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkServiceStatus(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	var failedServices []string
	var checked int

	for _, svc := range gm.ServiceMetrics.Services {
		checked++
		if !svc.Active {
			failedServices = append(failedServices, fmt.Sprintf("%s(%s)", svc.Name, svc.Status))
		}
	}

	if checked == 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "未配置任何服务检查项",
			ActualValue:   "N/A",
			ExpectedValue: "all active",
		}
	}

	actual := fmt.Sprintf("%d/%d 失败", len(failedServices), checked)
	expected := "全部正常"

	if len(failedServices) > 0 {
		return RuleResult{
			Status:        StatusFail,
			Message:       fmt.Sprintf("关键服务未运行: %v", failedServices),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("所有 %d 个关键服务正常运行", checked),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func checkNetworkConnections(gm *metrics.GatewayMetrics, cfg config.RulesConfig) RuleResult {
	threshold := cfg.ConnectionThreshold
	if threshold <= 0 {
		threshold = 1000
	}

	actual := fmt.Sprintf("%d", gm.NetworkMetrics.Connections)
	expected := fmt.Sprintf("<= %d", threshold)

	if gm.NetworkMetrics.Connections == 0 {
		return RuleResult{
			Status:        StatusWarning,
			Message:       "网络连接数为0，可能采集命令失败",
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}

	if gm.NetworkMetrics.Connections > threshold {
		return RuleResult{
			Status:        StatusWarning,
			Message:       fmt.Sprintf("网络连接数过多: %d个", gm.NetworkMetrics.Connections),
			ActualValue:   actual,
			ExpectedValue: expected,
		}
	}
	return RuleResult{
		Status:        StatusPass,
		Message:       fmt.Sprintf("网络连接数正常: %d个", gm.NetworkMetrics.Connections),
		ActualValue:   actual,
		ExpectedValue: expected,
	}
}

func (gcr *GatewayCheckResult) HasErrors() bool {
	return gcr.Failed > 0
}

func (gcr *GatewayCheckResult) HasWarnings() bool {
	return gcr.Warning > 0
}

func (gcr *GatewayCheckResult) GetFailedResults() []RuleResult {
	var failed []RuleResult
	for _, r := range gcr.Results {
		if r.Status == StatusFail {
			failed = append(failed, r)
		}
	}
	return failed
}

func (gcr *GatewayCheckResult) GetWarningResults() []RuleResult {
	var warnings []RuleResult
	for _, r := range gcr.Results {
		if r.Status == StatusWarning {
			warnings = append(warnings, r)
		}
	}
	return warnings
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
