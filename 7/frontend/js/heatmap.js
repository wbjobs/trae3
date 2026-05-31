let currentDeviceIds = [];

async function initHeatmapPage() {
    await loadHeatmap();
    loadAnomalyTable();
}

function updateDeviceSelect() {
    const group = document.getElementById('heatmap-group').value;
    const deviceGroups = {
        group_motors: ['motor_001', 'motor_002', 'motor_003'],
        group_pumps: ['pump_001', 'pump_002'],
        group_sensors: ['sensor_temp_001', 'sensor_temp_002'],
        all: ['motor_001', 'motor_002', 'motor_003', 'pump_001', 'pump_002', 'sensor_temp_001']
    };
    currentDeviceIds = deviceGroups[group] || deviceGroups.group_motors;
    loadHeatmap();
}

async function loadHeatmap() {
    const metric = document.getElementById('heatmap-metric').value;
    const timeRange = document.getElementById('heatmap-time').value;
    const resolution = document.getElementById('heatmap-resolution').value;

    if (!currentDeviceIds || currentDeviceIds.length === 0) {
        currentDeviceIds = ['motor_001', 'motor_002', 'motor_003'];
    }

    const result = await api.getHeatmapData({
        device_ids: currentDeviceIds,
        metric: metric,
        time_range: timeRange,
        resolution: resolution
    });

    if (result.success && result.data && result.data.length > 0) {
        const chartOpts = {};
        if (result.visual_min !== undefined) chartOpts.min = result.visual_min;
        if (result.visual_max !== undefined) chartOpts.max = result.visual_max;
        chartManager.createHeatmapChart('heatmap-chart', result, chartOpts);
        updateStats(result);
    } else {
        chartManager.createHeatmapChart('heatmap-chart', { data: [], x_axis: [], y_axis: [] }, {});
        updateStats(null);
    }
}

function updateStats(data) {
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        document.getElementById('stat-max').textContent = '-';
        document.getElementById('stat-min').textContent = '-';
        document.getElementById('stat-avg').textContent = '-';
        document.getElementById('stat-anomaly').textContent = '0';
        return;
    }

    const values = data.data.map(d => d[2]).filter(v => typeof v === 'number');
    if (values.length === 0) return;

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;

    const metricConfig = {
        temperature: { high: 80, low: 25 },
        vibration: { high: 30, low: 0 },
        current: { high: 45, low: 5 },
        pressure: { high: 9, low: 1 },
        flow_rate: { high: 180, low: 50 },
        power: { high: 90, low: 10 }
    };
    const config = metricConfig[data.metric] || { high: 80, low: 0 };
    const anomalyCount = values.filter(v => v > config.high || v < config.low).length;

    document.getElementById('stat-max').textContent = maxVal.toFixed(2);
    document.getElementById('stat-min').textContent = minVal.toFixed(2);
    document.getElementById('stat-avg').textContent = avgVal.toFixed(2);
    document.getElementById('stat-anomaly').textContent = anomalyCount;
}

function loadAnomalyTable() {
    const anomalies = [
        { device: 'motor_002', time: '2024-01-15 14:30', metric: '温度', value: '85.5°C', status: 'high' },
        { device: 'motor_003', time: '2024-01-15 10:15', metric: '振动', value: '28.3 mm/s', status: 'warning' },
        { device: 'pump_001', time: '2024-01-15 08:45', metric: '温度', value: '72.1°C', status: 'warning' },
        { device: 'sensor_temp_001', time: '2024-01-14 22:00', metric: '温度', value: '45.2°C', status: 'normal' }
    ];

    const tbody = document.getElementById('anomaly-table');
    if (!tbody) return;
    tbody.innerHTML = anomalies.map(a => `
        <tr>
            <td>${a.device}</td>
            <td>${a.time}</td>
            <td>${a.metric}</td>
            <td>${a.value}</td>
            <td><span class="status-badge ${a.status === 'high' ? 'fault' : a.status === 'warning' ? 'standby' : 'running'}">${a.status === 'high' ? '过高' : a.status === 'warning' ? '警告' : '正常'}</span></td>
        </tr>
    `).join('');
}

function refreshHeatmap() {
    loadHeatmap();
    loadAnomalyTable();
}

document.addEventListener('DOMContentLoaded', initHeatmapPage);
