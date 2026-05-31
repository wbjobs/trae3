let currentDeviceId = 'motor_001';
let currentTimeRange = '24h';
let currentMetrics = ['temperature', 'vibration', 'current', 'rpm'];
let refreshInterval = null;
let incrementalRefreshInterval = null;
let lastTimestamp = null;
let currentDataCache = { timestamps: [], series: [] };

async function initDashboard() {
    loadPerformanceInfo();
    await loadDeviceData();
    await loadDeviceTable();
    loadStatusPieChart();
    loadGaugeChart();
    startAutoRefresh();
    startIncrementalRefresh();
}

async function loadDeviceData() {
    try {
        currentDeviceId = document.getElementById('device-select').value;
        currentTimeRange = document.getElementById('time-range').value;
        const metricSelect = document.getElementById('metric-select').value;

        if (metricSelect !== 'all') {
            currentMetrics = [metricSelect];
        } else {
            currentMetrics = ['temperature', 'vibration', 'current', 'rpm'];
        }

        showLoadingIndicator(true);

        const result = await api.getDeviceTimeseries(currentDeviceId, {
            metrics: currentMetrics.join(','),
            time_range: currentTimeRange,
            apply_cleaning: 'true',
            enable_alerts: 'true'
        });

        if (result.success && result.series && result.series.length > 0) {
            currentDataCache = {
                timestamps: [...result.timestamps],
                series: JSON.parse(JSON.stringify(result.series))
            };

            if (result.timestamps && result.timestamps.length > 0) {
                lastTimestamp = new Date(result.timestamps[result.timestamps.length - 1]).toISOString();
            }

            chartManager.createLineChart('main-chart', result, {
                showArea: true,
                xAxisRotate: 45
            });

            const tempSeries = result.series.find(s => s.name === 'temperature');
            const vibrationSeries = result.series.find(s => s.name === 'vibration');

            if (tempSeries) {
                chartManager.createLineChart('temp-chart', {
                    timestamps: result.timestamps,
                    series: [tempSeries]
                }, { showArea: true });
            }

            if (vibrationSeries) {
                chartManager.createLineChart('vibration-chart', {
                    timestamps: result.timestamps,
                    series: [vibrationSeries]
                }, { showArea: true });
            }

            updateAlertsDisplay(result.alerts || []);
            updatePerformanceDisplay(result);
            updateDeviceStatusBadge(result);
        } else {
            chartManager.createLineChart('main-chart', { timestamps: [], series: [] }, {});
            updateAlertsDisplay([]);
        }
    } catch (error) {
        console.error('Error loading device data:', error);
        chartManager.createLineChart('main-chart', { timestamps: [], series: [] }, {});
    } finally {
        showLoadingIndicator(false);
    }
}

async function applyIncrementalUpdate(incrementalResult) {
    if (!incrementalResult.success || incrementalResult.new_points === 0) {
        return false;
    }

    if (!currentDataCache.timestamps || currentDataCache.timestamps.length === 0) {
        return false;
    }

    const newTimestamps = incrementalResult.timestamps || [];
    const newSeries = incrementalResult.series || [];

    currentDataCache.timestamps = [...currentDataCache.timestamps, ...newTimestamps];

    const maxPoints = 800;
    if (currentDataCache.timestamps.length > maxPoints) {
        const overflow = currentDataCache.timestamps.length - maxPoints;
        currentDataCache.timestamps = currentDataCache.timestamps.slice(overflow);
        currentDataCache.series.forEach(s => {
            if (s.data) s.data = s.data.slice(overflow);
        });
    }

    for (const newSeries of newSeries) {
        const existing = currentDataCache.series.find(s => s.name === newSeries.name);
        if (existing && newSeries.data) {
            existing.data = [...existing.data, ...newSeries.data];
            if (existing.data.length > maxPoints) {
                existing.data = existing.data.slice(-maxPoints);
            }
        }
    }

    if (newTimestamps.length > 0) {
        lastTimestamp = new Date(newTimestamps[newTimestamps.length - 1]).toISOString();
    }

    chartManager.updateChart('main-chart', currentDataCache);

    if (incrementalResult.alerts && incrementalResult.alerts.length > 0) {
        showAlertNotification(incrementalResult.alerts);
    }

    return true;
}

async function incrementalRefresh() {
    if (!lastTimestamp || !currentDeviceId) return;

    try {
        const result = await api.getIncrementalTimeseries(currentDeviceId, {
            metrics: currentMetrics.join(','),
            last_timestamp: lastTimestamp,
            time_range: currentTimeRange
        });

        if (result.success && result.incremental) {
            if (result.new_points > 0) {
                applyIncrementalUpdate(result);
            }
        }
    } catch (error) {
        console.error('Incremental refresh error:', error);
    }
}

function showLoadingIndicator(show) {
    const loader = document.getElementById('data-loader');
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}

function updateAlertsDisplay(alerts) {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="alert-item normal">
                <span class="alert-icon">✅</span>
                <span class="alert-text">所有指标运行正常，无异常预警</span>
            </div>
        `;
        return;
    }

    const dangerCount = alerts.filter(a => a.level === 'danger').length;
    const warningCount = alerts.filter(a => a.level === 'warning').length;

    container.innerHTML = `
        <div class="alert-summary">
            <span class="alert-badge danger">${dangerCount} 严重</span>
            <span class="alert-badge warning">${warningCount} 警告</span>
        </div>
        ${alerts.slice(0, 5).map(alert => `
            <div class="alert-item ${alert.level}">
                <span class="alert-icon">${alert.level === 'danger' ? '🔴' : '🟡'}</span>
                <div class="alert-content">
                    <div class="alert-title">${alert.message}</div>
                    <div class="alert-time">${alert.timestamp || ''} · ${alert.metric}</div>
                </div>
            </div>
        `).join('')}
    `;
}

function showAlertNotification(alerts) {
    const container = document.getElementById('alerts-container');
    if (!container || !alerts || alerts.length === 0) return;

    const notification = document.createElement('div');
    notification.className = 'alert-notification';
    notification.innerHTML = `
        <div class="alert-notification-header">
            <span>🔔 新预警 (${alerts.length})</span>
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="alert-notification-body">
            ${alerts.slice(0, 3).map(a => `<div>${a.message}</div>`).join('')}
        </div>
    `;
    container.insertBefore(notification, container.firstChild);

    setTimeout(() => notification.remove(), 8000);
}

function updatePerformanceDisplay(result) {
    const info = document.getElementById('perf-info');
    if (!info) return;

    const parts = [];
    parts.push(`📊 ${result.total_points || 0} 点`);
    if (result.data_source) {
        parts.push(`📡 ${result.data_source === 'influxdb' ? '时序数据库' : '模拟数据'}`);
    }
    if (result.from_cache) {
        parts.push(`⚡ 缓存`);
    }
    if (result.downsample_ratio && result.downsample_ratio > 1) {
        parts.push(`⬇️ ${result.downsample_ratio}:1 降采样`);
    }
    if (result._decompressed) {
        parts.push(`🗜️ ${result._compression_ratio}x 压缩`);
    }

    info.innerHTML = parts.join(' · ');
}

function updateDeviceStatusBadge(result) {
    const badge = document.getElementById('device-status-badge');
    if (!badge || !result.alerts) return;

    const dangerCount = result.alerts.filter(a => a.level === 'danger').length;
    const warningCount = result.alerts.filter(a => a.level === 'warning').length;

    let status, statusClass, statusColor;
    if (dangerCount > 0) {
        status = '严重';
        statusClass = 'fault';
        statusColor = '#ef4444';
    } else if (warningCount > 0) {
        status = '警告';
        statusClass = 'standby';
        statusColor = '#f59e0b';
    } else {
        status = '正常';
        statusClass = 'running';
        statusColor = '#10b981';
    }

    badge.textContent = status;
    badge.className = `status-badge ${statusClass}`;
}

async function loadPerformanceInfo() {
    try {
        const result = await api.getHealth();
        if (result.success && result.cache_stats) {
            const info = result.cache_stats;
            console.log('Cache stats:', info);
        }
    } catch (e) {
        console.log('Performance info unavailable');
    }
}

function loadStatusPieChart() {
    const data = [
        { value: 10, name: '运行中' },
        { value: 2, name: '待机' },
        { value: 1, name: '故障' }
    ];
    chartManager.createPieChart('status-chart', data, { title: '设备状态' });
}

function loadGaugeChart() {
    chartManager.createGaugeChart('gauge-chart', 65, {
        min: 0, max: 100, color: '#10b981', unit: '%'
    });
}

async function loadDeviceTable() {
    try {
        const result = await api.getDevices();
        let devices = [];
        if (result.success && result.devices) {
            devices = result.devices;
        } else {
            devices = [
                { device_id: 'motor_001', name: '主电机-1号', status: 'running' },
                { device_id: 'motor_002', name: '主电机-2号', status: 'running' },
                { device_id: 'pump_001', name: '冷却水泵', status: 'running' },
                { device_id: 'sensor_temp_001', name: '温度传感器-A1', status: 'active' }
            ];
        }

        const tbody = document.getElementById('device-table-body');
        if (!tbody) return;

        const enrichedDevices = await Promise.all(devices.map(async d => {
            try {
                const stat = await api.getDeviceStatistics(d.device_id, {
                    metrics: 'temperature,vibration',
                    time_range: '1h',
                    enable_alerts: 'true'
                });
                return { ...d, stats: stat };
            } catch {
                return d;
            }
        }));

        tbody.innerHTML = enrichedDevices.map(device => {
            const stat = device.stats && device.stats.statistics || {};
            const temp = stat.temperature ? stat.temperature.latest : '-';
            const vib = stat.vibration ? stat.vibration.latest : '-';
            const alertSummary = device.stats && device.stats.alert_summary || {};
            const statusClass = alertSummary.status || device.status;
            const statusText = statusClass === 'running' ? '运行中' : statusClass === 'active' ? '活跃' : statusClass === 'warning' ? '警告' : statusClass === 'critical' ? '严重' : statusClass;

            return `
                <tr>
                    <td>${device.device_id}</td>
                    <td>${device.name}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${temp}°C</td>
                    <td>${vib} mm/s</td>
                    <td>
                        ${alertSummary.danger_count > 0 ? `<span class="alert-mini danger">${alertSummary.danger_count}</span>` : ''}
                        ${alertSummary.warning_count > 0 ? `<span class="alert-mini warning">${alertSummary.warning_count}</span>` : ''}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewDeviceDetail('${device.device_id}')">查看</button>
                        <button class="btn btn-sm btn-outline" onclick="generateDeviceReport('${device.device_id}')">报表</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading device table:', error);
    }
}

async function viewDeviceDetail(deviceId) {
    window.location.href = `pages/devices.html?device=${deviceId}`;
}

async function generateDeviceReport(deviceId) {
    const result = await api.generateDeviceReport(deviceId, {
        time_range: currentTimeRange,
        format: 'pdf'
    });

    if (result.success) {
        alert(`报表生成成功！文件名: ${result.filename}`);
        api.downloadReport(result.filename);
    } else {
        alert('报表生成失败: ' + (result.message || '未知错误'));
    }
}

function refreshDashboard() {
    lastTimestamp = null;
    loadDeviceData();
    loadDeviceTable();
    loadPerformanceInfo();
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        loadDeviceData();
    }, 60000);
}

function startIncrementalRefresh() {
    if (incrementalRefreshInterval) clearInterval(incrementalRefreshInterval);
    incrementalRefreshInterval = setInterval(() => {
        incrementalRefresh();
    }, 5000);
}

function toggleChartType() {
    console.log('Toggle chart type');
}

function toggleCompression() {
    api.enableCompression = !api.enableCompression;
    const btn = document.getElementById('compression-toggle');
    if (btn) {
        btn.textContent = api.enableCompression ? '🗜️ 压缩: 开' : '🗜️ 压缩: 关';
    }
    refreshDashboard();
}

document.addEventListener('DOMContentLoaded', initDashboard);

window.addEventListener('beforeunload', () => {
    if (refreshInterval) clearInterval(refreshInterval);
    if (incrementalRefreshInterval) clearInterval(incrementalRefreshInterval);
    chartManager.disposeAll();
});
