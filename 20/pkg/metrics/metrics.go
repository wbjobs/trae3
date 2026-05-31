package metrics

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	sshpkg "edge-gateway-inspector/pkg/ssh"
)

type GatewayMetrics struct {
	GatewayName    string                 `json:"gateway_name"`
	Group          string                 `json:"group,omitempty"`
	Timestamp      time.Time              `json:"timestamp"`
	SystemMetrics  SystemMetrics         `json:"system_metrics"`
	NetworkMetrics NetworkMetrics        `json:"network_metrics"`
	ProcessMetrics ProcessMetrics        `json:"process_metrics"`
	DiskMetrics    DiskMetrics           `json:"disk_metrics"`
	ServiceMetrics ServiceMetrics        `json:"service_metrics"`
	CustomMetrics  map[string]interface{} `json:"custom_metrics,omitempty"`
}

type SystemMetrics struct {
	Hostname      string  `json:"hostname"`
	Uptime        string  `json:"uptime"`
	LoadAverage1  float64 `json:"load_average_1"`
	LoadAverage5  float64 `json:"load_average_5"`
	LoadAverage15 float64 `json:"load_average_15"`
	CPUUsage      float64 `json:"cpu_usage"`
	MemoryTotal   uint64  `json:"memory_total"`
	MemoryUsed    uint64  `json:"memory_used"`
	MemoryFree    uint64  `json:"memory_free"`
	MemoryCached  uint64  `json:"memory_cached"`
	SwapTotal     uint64  `json:"swap_total"`
	SwapUsed      uint64  `json:"swap_used"`
	CPUCount      int     `json:"cpu_count"`
}

type NetworkMetrics struct {
	Interfaces  []NetworkInterface `json:"interfaces"`
	Connections int                `json:"connections"`
	OpenPorts   []int              `json:"open_ports"`
	TrafficIn   uint64             `json:"traffic_in"`
	TrafficOut  uint64             `json:"traffic_out"`
}

type NetworkInterface struct {
	Name      string `json:"name"`
	IPAddress string `json:"ip_address"`
	RXBytes   uint64 `json:"rx_bytes"`
	TXBytes   uint64 `json:"tx_bytes"`
	Status    string `json:"status"`
}

type ProcessMetrics struct {
	TotalProcesses  int           `json:"total_processes"`
	ZombieProcesses int           `json:"zombie_processes"`
	TopProcesses    []ProcessInfo `json:"top_processes"`
}

type ProcessInfo struct {
	PID    int     `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
	Status string  `json:"status"`
}

type DiskMetrics struct {
	Disks []DiskInfo `json:"disks"`
}

type DiskInfo struct {
	MountPoint   string  `json:"mount_point"`
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usage_percent"`
}

type ServiceMetrics struct {
	Services []ServiceInfo `json:"services"`
}

type ServiceInfo struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Active bool   `json:"active"`
}

type MetricsCollector struct {
	cluster       *sshpkg.ClusterManager
	serviceChecks []string
	concurrency   int
}

func NewMetricsCollector(cluster *sshpkg.ClusterManager) *MetricsCollector {
	concurrency := cluster.Concurrency
	if concurrency <= 0 {
		concurrency = 5
	}
	return &MetricsCollector{
		cluster:       cluster,
		serviceChecks: []string{"nginx", "docker", "mosquitto", "frps"},
		concurrency:   concurrency,
	}
}

func (mc *MetricsCollector) SetServiceChecks(services []string) {
	if len(services) > 0 {
		mc.serviceChecks = services
	}
}

func (mc *MetricsCollector) SetConcurrency(n int) {
	if n > 0 {
		mc.concurrency = n
	}
}

func (mc *MetricsCollector) CollectAll() map[string]*GatewayMetrics {
	results := make(map[string]*GatewayMetrics)
	var mu sync.Mutex
	var wg sync.WaitGroup

	clientCount := len(mc.cluster.Clients)
	if clientCount == 0 {
		return results
	}

	sem := make(chan struct{}, mc.concurrency)
	progress := make(chan string, clientCount)

	go func() {
		done := 0
		for name := range progress {
			done++
			fmt.Printf("  [%d/%d] %s 采集完成\n", done, clientCount, name)
		}
	}()

	for name, client := range mc.cluster.Clients {
		wg.Add(1)
		go func(name string, client *sshpkg.SSHClient) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			metrics := mc.CollectFromClient(client)

			mu.Lock()
			results[name] = metrics
			mu.Unlock()

			progress <- name
		}(name, client)
	}
	wg.Wait()
	close(progress)

	return results
}

func (mc *MetricsCollector) CollectFromClient(client *sshpkg.SSHClient) *GatewayMetrics {
	metrics := &GatewayMetrics{
		GatewayName:   client.Gateway.Name,
		Group:         client.Gateway.Group,
		Timestamp:     time.Now(),
		CustomMetrics: make(map[string]interface{}),
	}

	metrics.SystemMetrics = mc.collectSystemMetrics(client)
	metrics.NetworkMetrics = mc.collectNetworkMetrics(client)
	metrics.ProcessMetrics = mc.collectProcessMetrics(client)
	metrics.DiskMetrics = mc.collectDiskMetrics(client)
	metrics.ServiceMetrics = mc.collectServiceMetrics(client, mc.serviceChecks)

	return metrics
}

func (mc *MetricsCollector) collectSystemMetrics(client *sshpkg.SSHClient) SystemMetrics {
	var sys SystemMetrics

	if output, err := client.Execute("hostname"); err == nil {
		sys.Hostname = strings.TrimSpace(output)
	}

	if output, err := client.Execute("uptime -p 2>/dev/null || uptime"); err == nil {
		sys.Uptime = strings.TrimSpace(output)
	}

	if output, err := client.Execute("cat /proc/loadavg 2>/dev/null"); err == nil {
		parts := strings.Fields(output)
		if len(parts) >= 3 {
			sys.LoadAverage1, _ = strconv.ParseFloat(parts[0], 64)
			sys.LoadAverage5, _ = strconv.ParseFloat(parts[1], 64)
			sys.LoadAverage15, _ = strconv.ParseFloat(parts[2], 64)
		}
	}

	if output, err := client.Execute("nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo"); err == nil {
		sys.CPUCount, _ = strconv.Atoi(strings.TrimSpace(output))
	}
	if sys.CPUCount <= 0 {
		sys.CPUCount = 1
	}

	if output, err := client.Execute("cat /proc/meminfo 2>/dev/null"); err == nil {
		memInfo := parseMemInfo(output)
		sys.MemoryTotal = memInfo["MemTotal"]
		sys.MemoryFree = memInfo["MemFree"]
		sys.MemoryCached = memInfo["Cached"] + memInfo["Buffers"]
		if sys.MemoryTotal > 0 {
			sys.MemoryUsed = sys.MemoryTotal - sys.MemoryFree - sys.MemoryCached
		}
		sys.SwapTotal = memInfo["SwapTotal"]
		if sys.SwapTotal > 0 {
			sys.SwapUsed = sys.SwapTotal - memInfo["SwapFree"]
		}
	}

	cpuUsage := 0.0
	for _, cmd := range []string{
		"top -bn2 -d0.5 2>/dev/null | grep 'Cpu(s)' | tail -1",
		"vmstat 1 2 2>/dev/null | tail -1 | awk '{print 100-$15}'",
		"grep 'cpu ' /proc/stat; sleep 1; grep 'cpu ' /proc/stat",
	} {
		if output, err := client.Execute(cmd); err == nil {
			if usage := parseCPUUsage(output); usage >= 0 {
				cpuUsage = usage
				break
			}
		}
	}
	sys.CPUUsage = cpuUsage

	return sys
}

func parseMemInfo(output string) map[string]uint64 {
	result := make(map[string]uint64)
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			key := strings.TrimSuffix(parts[0], ":")
			if val, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
				result[key] = val * 1024
			}
		}
	}
	return result
}

func parseCPUUsage(output string) float64 {
	re := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*id`)
	if match := re.FindStringSubmatch(output); len(match) > 1 {
		if idle, err := strconv.ParseFloat(match[1], 64); err == nil && idle >= 0 && idle <= 100 {
			return 100.0 - idle
		}
	}
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) >= 2 {
		parts1 := strings.Fields(lines[0])
		parts2 := strings.Fields(lines[1])
		if len(parts1) >= 8 && len(parts2) >= 8 {
			var u1, u2, n1, n2, s1, s2, i1, i2, irq1, irq2 float64
			fmt.Sscan(parts1[1], &u1)
			fmt.Sscan(parts1[2], &n1)
			fmt.Sscan(parts1[3], &s1)
			fmt.Sscan(parts1[4], &i1)
			fmt.Sscan(parts1[5], &i1)
			fmt.Sscan(parts1[7], &irq1)
			fmt.Sscan(parts2[1], &u2)
			fmt.Sscan(parts2[2], &n2)
			fmt.Sscan(parts2[3], &s2)
			fmt.Sscan(parts2[4], &i2)
			fmt.Sscan(parts2[5], &i2)
			fmt.Sscan(parts2[7], &irq2)
			idle1 := i1
			idle2 := i2
			total1 := u1 + n1 + s1 + idle1 + irq1
			total2 := u2 + n2 + s2 + idle2 + irq2
			if total2 > total1 {
				return 100.0 * (1 - (idle2-idle1)/(total2-total1))
			}
		}
	}
	if _, err := strconv.ParseFloat(strings.TrimSpace(output), 64); err == nil {
		if val, err := strconv.ParseFloat(strings.TrimSpace(output), 64); err == nil {
			return val
		}
	}
	return -1
}

func (mc *MetricsCollector) collectNetworkMetrics(client *sshpkg.SSHClient) NetworkMetrics {
	var net NetworkMetrics

	if output, err := client.Execute("ip -4 addr show 2>/dev/null || ifconfig -a 2>/dev/null"); err == nil {
		net.Interfaces = parseNetworkInterfaces(output)
	}

	if output, err := client.Execute("cat /proc/net/dev 2>/dev/null"); err == nil {
		net.TrafficIn, net.TrafficOut = parseNetworkTraffic(output)
		for i, iface := range net.Interfaces {
			if rx, tx, ok := getInterfaceTraffic(output, iface.Name); ok {
				net.Interfaces[i].RXBytes = rx
				net.Interfaces[i].TXBytes = tx
			}
		}
	}

	if output, err := client.Execute("ss -tuln 2>/dev/null | wc -l || netstat -tuln 2>/dev/null | wc -l"); err == nil {
		net.Connections, _ = strconv.Atoi(strings.TrimSpace(output))
	}

	if output, err := client.Execute("ss -tuln 2>/dev/null | grep LISTEN | awk '{print $4}' | awk -F: '{print $NF}' | sort -n | uniq || netstat -tuln 2>/dev/null | grep LISTEN | awk '{print $4}' | awk -F: '{print $NF}' | sort -n | uniq"); err == nil {
		for _, portStr := range strings.Split(strings.TrimSpace(output), "\n") {
			if port, err := strconv.Atoi(portStr); err == nil && port > 0 {
				net.OpenPorts = append(net.OpenPorts, port)
			}
		}
	}

	return net
}

func parseNetworkInterfaces(output string) []NetworkInterface {
	var interfaces []NetworkInterface

	ifaceRegex := regexp.MustCompile(`(\d+):\s+(\w+):.*?inet\s+(\d+\.\d+\.\d+\.\d+/\d+)`)
	matches := ifaceRegex.FindAllStringSubmatch(output, -1)
	for _, match := range matches {
		interfaces = append(interfaces, NetworkInterface{
			Name:      match[2],
			IPAddress: match[3],
			Status:    "up",
		})
	}

	if len(interfaces) == 0 {
		ifaceRegex2 := regexp.MustCompile(`(\w+)\s+Link encap.*?inet addr:(\d+\.\d+\.\d+\.\d+)`)
		matches2 := ifaceRegex2.FindAllStringSubmatch(output, -1)
		for _, match := range matches2 {
			interfaces = append(interfaces, NetworkInterface{
				Name:      match[1],
				IPAddress: match[2],
				Status:    "up",
			})
		}
	}

	return interfaces
}

func parseNetworkTraffic(output string) (uint64, uint64) {
	var totalIn, totalOut uint64
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, ":") && !strings.Contains(line, "Inter-") && !strings.Contains(line, "face") {
			parts := strings.Fields(strings.Replace(line, ":", " ", 1))
			if len(parts) >= 10 {
				if rx, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
					totalIn += rx
				}
				if tx, err := strconv.ParseUint(parts[9], 10, 64); err == nil {
					totalOut += tx
				}
			}
		}
	}
	return totalIn, totalOut
}

func getInterfaceTraffic(output, ifaceName string) (uint64, uint64, bool) {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, ifaceName+":") {
			parts := strings.Fields(strings.Replace(trimmed, ":", " ", 1))
			if len(parts) >= 10 {
				rx, _ := strconv.ParseUint(parts[1], 10, 64)
				tx, _ := strconv.ParseUint(parts[9], 10, 64)
				return rx, tx, true
			}
		}
	}
	return 0, 0, false
}

func (mc *MetricsCollector) collectProcessMetrics(client *sshpkg.SSHClient) ProcessMetrics {
	var proc ProcessMetrics

	if output, err := client.Execute("ps aux --no-headers 2>/dev/null | wc -l"); err == nil {
		proc.TotalProcesses, _ = strconv.Atoi(strings.TrimSpace(output))
	}

	if output, err := client.Execute("ps aux --no-headers 2>/dev/null | awk '$8 ~ /^Z/ {count++} END {print count+0}'"); err == nil {
		proc.ZombieProcesses, _ = strconv.Atoi(strings.TrimSpace(output))
	}

	if output, err := client.Execute("ps aux --no-headers --sort=-%cpu 2>/dev/null | head -10"); err == nil {
		proc.TopProcesses = parseTopProcesses(output)
	}

	return proc
}

func parseTopProcesses(output string) []ProcessInfo {
	var processes []ProcessInfo
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 11 {
			pid, _ := strconv.Atoi(parts[1])
			cpu, _ := strconv.ParseFloat(parts[2], 64)
			mem, _ := strconv.ParseFloat(parts[3], 64)
			processes = append(processes, ProcessInfo{
				PID:    pid,
				Name:   parts[10],
				CPU:    cpu,
				Memory: mem,
				Status: parts[7],
			})
		}
	}
	return processes
}

func (mc *MetricsCollector) collectDiskMetrics(client *sshpkg.SSHClient) DiskMetrics {
	var disk DiskMetrics

	for _, cmd := range []string{
		"df -TP --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs 2>/dev/null",
		"df -TP 2>/dev/null",
		"df -hP 2>/dev/null",
	} {
		if output, err := client.Execute(cmd); err == nil {
			disk.Disks = parseDiskInfo(output, strings.Contains(cmd, "-h"))
			if len(disk.Disks) > 0 {
				break
			}
		}
	}

	return disk
}

func parseDiskInfo(output string, humanReadable bool) []DiskInfo {
	var disks []DiskInfo
	lines := strings.Split(output, "\n")
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 6 {
			var usage float64
			if humanReadable {
				usageStr := strings.TrimSuffix(parts[4], "%")
				usage, _ = strconv.ParseFloat(usageStr, 64)
				disks = append(disks, DiskInfo{
					MountPoint:   parts[5],
					Total:        parseSize(parts[1]),
					Used:         parseSize(parts[2]),
					Available:    parseSize(parts[3]),
					UsagePercent: usage,
				})
			} else {
				if len(parts) >= 7 {
					usageStr := strings.TrimSuffix(parts[5], "%")
					usage, _ = strconv.ParseFloat(usageStr, 64)
					total, _ := strconv.ParseUint(parts[2], 10, 64)
					used, _ := strconv.ParseUint(parts[3], 10, 64)
					avail, _ := strconv.ParseUint(parts[4], 10, 64)
					disks = append(disks, DiskInfo{
						MountPoint:   parts[6],
						Total:        total * 1024,
						Used:         used * 1024,
						Available:    avail * 1024,
						UsagePercent: usage,
					})
				}
			}
		}
	}
	return disks
}

func parseSize(sizeStr string) uint64 {
	sizeStr = strings.TrimSpace(sizeStr)
	if sizeStr == "0" || sizeStr == "-" {
		return 0
	}
	multiplier := uint64(1)
	upper := strings.ToUpper(sizeStr)
	if strings.HasSuffix(upper, "G") || strings.HasSuffix(upper, "GB") {
		multiplier = 1024 * 1024 * 1024
		sizeStr = strings.TrimRight(sizeStr, "GgBb")
	} else if strings.HasSuffix(upper, "M") || strings.HasSuffix(upper, "MB") {
		multiplier = 1024 * 1024
		sizeStr = strings.TrimRight(sizeStr, "MmBb")
	} else if strings.HasSuffix(upper, "K") || strings.HasSuffix(upper, "KB") {
		multiplier = 1024
		sizeStr = strings.TrimRight(sizeStr, "KkBb")
	} else if strings.HasSuffix(upper, "T") || strings.HasSuffix(upper, "TB") {
		multiplier = 1024 * 1024 * 1024 * 1024
		sizeStr = strings.TrimRight(sizeStr, "TtBb")
	}
	val, err := strconv.ParseFloat(strings.TrimSpace(sizeStr), 64)
	if err != nil {
		return 0
	}
	return uint64(val * float64(multiplier))
}

func (mc *MetricsCollector) collectServiceMetrics(client *sshpkg.SSHClient, services []string) ServiceMetrics {
	var svc ServiceMetrics

	for _, service := range services {
		status := "unknown"
		active := false
		output, err := client.Execute(fmt.Sprintf("systemctl is-active %s 2>/dev/null || service %s status >/dev/null 2>&1 && echo active || echo inactive", service, service))
		if err == nil {
			trimmed := strings.TrimSpace(output)
			lines := strings.Split(trimmed, "\n")
			lastLine := lines[len(lines)-1]
			if strings.Contains(lastLine, "active") || strings.Contains(lastLine, "running") {
				status = "active"
				active = true
			} else if strings.Contains(lastLine, "inactive") || strings.Contains(lastLine, "failed") || strings.Contains(lastLine, "dead") {
				status = lastLine
				active = false
			} else {
				status = lastLine
				active = false
			}
		} else {
			output2, err2 := client.Execute(fmt.Sprintf("ps aux | grep -v grep | grep -c '%s'", service))
			if err2 == nil {
				count, _ := strconv.Atoi(strings.TrimSpace(output2))
				if count > 0 {
					status = "running"
					active = true
				} else {
					status = "not-running"
					active = false
				}
			}
		}
		svc.Services = append(svc.Services, ServiceInfo{
			Name:   service,
			Status: status,
			Active: active,
		})
	}

	return svc
}

func (gm *GatewayMetrics) ToJSON() (string, error) {
	data, err := json.MarshalIndent(gm, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}
