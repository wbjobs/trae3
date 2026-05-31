let currentEditDevice = null;
let selectedDeviceId = null;

async function initDevicesPage() {
    await loadDevices();
    const urlParams = new URLSearchParams(window.location.search);
    const deviceId = urlParams.get('device');
    if (deviceId) {
        await viewDevice(deviceId);
    }
}

async function loadDevices() {
    const groupFilter = document.getElementById('group-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const typeFilter = document.getElementById('type-filter').value;

    const result = await api.getDevices({
        group_id: groupFilter,
        status: statusFilter
    });

    let devices = [];
    if (result.success && result.devices) {
        devices = result.devices;
    } else {
        devices = [
            { device_id: 'motor_001', device_name: '主电机-1号', device_type: 'motor', group_id: 'group_motors', status: 'running', location: 'A车间-1号线', metrics: ['temperature', 'vibration', 'current'] },
            { device_id: 'motor_002', device_name: '主电机-2号', device_type: 'motor', group_id: 'group_motors', status: 'running', location: 'A车间-2号线', metrics: ['temperature', 'vibration', 'current'] },
            { device_id: 'pump_001', device_name: '冷却水泵', device_type: 'pump', group_id: 'group_pumps', status: 'running', location: 'B车间-冷却水系统', metrics: ['flow_rate', 'pressure', 'power'] },
            { device_id: 'sensor_temp_001', device_name: '温度传感器-A1', device_type: 'sensor', group_id: 'group_sensors', status: 'active', location: 'A车间-设备区', metrics: ['temperature'] },
            { device_id: 'motor_003', device_name: '输送电机', device_type: 'motor', group_id: 'group_motors', status: 'standby', location: 'C车间-输送线', metrics: ['temperature', 'vibration', 'current'] },
            { device_id: 'pump_002', device_name: '油泵-主', device_type: 'pump', group_id: 'group_pumps', status: 'running', location: 'B车间-液压站', metrics: ['pressure', 'flow_rate', 'temperature'] }
        ];
    }

    if (typeFilter) {
        devices = devices.filter(d => d.device_type === typeFilter);
    }

    renderDeviceCards(devices);
}

function renderDeviceCards(devices) {
    const grid = document.getElementById('device-grid');
    
    if (devices.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">未找到设备</div>
                <div class="empty-desc">请尝试调整筛选条件</div>
            </div>
        `;
        return;
    }

    const typeNames = {
        motor: '电机',
        pump: '泵类',
        sensor: '传感器',
        other: '其他'
    };

    const statusNames = {
        running: '运行中',
        standby: '待机',
        fault: '故障',
        active: '活跃'
    };

    grid.innerHTML = devices.map(device => `
        <div class="device-card" onclick="viewDevice('${device.device_id}')">
            <div class="device-header">
                <div>
                    <div class="device-name">${device.device_name}</div>
                    <div class="device-id">${device.device_id} · ${typeNames[device.device_type] || device.device_type}</div>
                </div>
                <span class="status-badge ${device.status}">${statusNames[device.status] || device.status}</span>
            </div>
            <div class="device-metrics">
                <div class="metric-item">
                    <span class="metric-label">位置</span>
                    <span class="metric-value" style="font-size: 14px; font-weight: normal;">${device.location}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">监测指标</span>
                    <span class="metric-value" style="font-size: 12px; font-weight: normal;">${(device.metrics || []).join(', ')}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function openAddDeviceModal() {
    currentEditDevice = null;
    document.getElementById('modal-title').textContent = '添加设备';
    document.getElementById('device-form').reset();
    document.getElementById('device-id').disabled = false;
    openModal('device-modal');
}

async function openEditDeviceModal(deviceId) {
    const result = await api.getDevice(deviceId);
    if (result.success && result.device) {
        currentEditDevice = result.device;
        document.getElementById('modal-title').textContent = '编辑设备';
        document.getElementById('device-id').value = result.device.device_id;
        document.getElementById('device-id').disabled = true;
        document.getElementById('device-name').value = result.device.device_name;
        document.getElementById('device-type').value = result.device.device_type;
        document.getElementById('device-group').value = result.device.group_id;
        document.getElementById('device-location').value = result.device.location;
        document.getElementById('device-metrics').value = (result.device.metrics || []).join(',');
        openModal('device-modal');
    }
}

async function saveDevice() {
    const deviceData = {
        device_id: document.getElementById('device-id').value,
        device_name: document.getElementById('device-name').value,
        device_type: document.getElementById('device-type').value,
        group_id: document.getElementById('device-group').value,
        location: document.getElementById('device-location').value,
        metrics: document.getElementById('device-metrics').value.split(',').map(m => m.trim()),
        status: 'running'
    };

    let result;
    if (currentEditDevice) {
        result = await api.updateDevice(currentEditDevice.device_id, deviceData);
    } else {
        result = await api.addDevice(deviceData);
    }

    if (result.success) {
        closeModal('device-modal');
        loadDevices();
        alert(currentEditDevice ? '设备更新成功！' : '设备添加成功！');
    } else {
        alert('操作失败: ' + result.message);
    }
}

async function deleteDevice(deviceId) {
    if (confirm('确定要删除这个设备吗？')) {
        const result = await api.deleteDevice(deviceId);
        if (result.success) {
            loadDevices();
            alert('设备删除成功！');
        } else {
            alert('删除失败: ' + result.message);
        }
    }
}

async function viewDevice(deviceId) {
    selectedDeviceId = deviceId;
    document.getElementById('detail-title').textContent = `设备详情 - ${deviceId}`;
    
    let device = null;
    const result = await api.getDevice(deviceId);
    if (result.success && result.device) {
        device = result.device;
    } else {
        device = {
            device_id: deviceId,
            device_name: '主电机-1号',
            device_type: 'motor',
            group_id: 'group_motors',
            status: 'running',
            location: 'A车间-1号线',
            install_date: '2023-01-15',
            metrics: ['temperature', 'vibration', 'current', 'rpm']
        };
    }

    const typeNames = {
        motor: '电机',
        pump: '泵类',
        sensor: '传感器',
        other: '其他'
    };

    const statusNames = {
        running: '运行中',
        standby: '待机',
        fault: '故障',
        active: '活跃'
    };

    const statsResult = await api.getDeviceStatistics(deviceId);
    let statistics = {};
    if (statsResult.success) {
        statistics = statsResult.statistics;
    }

    const statItems = Object.entries(statistics).map(([key, value]) => `
        <div class="metric-item">
            <span class="metric-label">${key}</span>
            <span class="metric-value" style="font-size: 16px;">${value.avg}</span>
        </div>
    `).join('');

    document.getElementById('detail-content').innerHTML = `
        <div style="margin-bottom: 24px;">
            <h4 style="color: #fff; margin-bottom: 16px;">基本信息</h4>
            <div class="group-stats" style="flex-wrap: wrap;">
                <div class="group-stat">
                    <span class="group-stat-label">设备名称</span>
                    <span class="group-stat-value" style="font-size: 16px;">${device.device_name}</span>
                </div>
                <div class="group-stat">
                    <span class="group-stat-label">设备类型</span>
                    <span class="group-stat-value" style="font-size: 16px;">${typeNames[device.device_type] || device.device_type}</span>
                </div>
                <div class="group-stat">
                    <span class="group-stat-label">状态</span>
                    <span class="status-badge ${device.status}">${statusNames[device.status] || device.status}</span>
                </div>
            </div>
        </div>
        <div style="margin-bottom: 24px;">
            <h4 style="color: #fff; margin-bottom: 16px;">安装信息</h4>
            <div class="group-stats" style="flex-wrap: wrap;">
                <div class="group-stat">
                    <span class="group-stat-label">安装位置</span>
                    <span class="group-stat-value" style="font-size: 16px;">${device.location}</span>
                </div>
                <div class="group-stat">
                    <span class="group-stat-label">安装日期</span>
                    <span class="group-stat-value" style="font-size: 16px;">${device.install_date || '-'}</span>
                </div>
            </div>
        </div>
        <div>
            <h4 style="color: #fff; margin-bottom: 16px;">统计数据</h4>
            <div class="device-metrics">
                ${statItems || '<div style="color: #a0aec0;">暂无统计数据</div>'}
            </div>
        </div>
    `;

    const chartResult = await api.getDeviceTimeseries(deviceId, {
        metrics: 'temperature,vibration',
        time_range: '24h'
    });

    if (chartResult.success) {
        setTimeout(() => {
            chartManager.createLineChart('detail-chart', chartResult, { showArea: true });
        }, 100);
    }

    openModal('device-detail-modal');
}

async function generateDetailReport() {
    if (selectedDeviceId) {
        const result = await api.generateDeviceReport(selectedDeviceId, {
            time_range: '24h',
            format: 'pdf'
        });

        if (result.success) {
            alert(`报表生成成功！文件名: ${result.filename}`);
            api.downloadReport(result.filename);
        } else {
            alert('报表生成失败: ' + result.message);
        }
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

document.addEventListener('DOMContentLoaded', initDevicesPage);
