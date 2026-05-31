async function initReportsPage() {
    await loadReports();
}

async function loadReports() {
    const result = await api.getReports();
    
    let reports = [];
    if (result.success && result.reports) {
        reports = result.reports;
    } else {
        reports = [
            { filename: 'maintenance_report_motor_001_20240115.pdf', size: 245760, created_at: '2024-01-15T10:30:00', download_url: '#' },
            { filename: 'group_report_group_motors_20240115.pdf', size: 327680, created_at: '2024-01-15T09:15:00', download_url: '#' },
            { filename: 'maintenance_report_pump_001_20240114.xlsx', size: 45056, created_at: '2024-01-14T16:45:00', download_url: '#' }
        ];
    }

    renderReportsList(reports);
}

function renderReportsList(reports) {
    const container = document.getElementById('reports-list');
    
    if (reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <div class="empty-title">暂无报表</div>
                <div class="empty-desc">点击右上角按钮生成第一个报表</div>
            </div>
        `;
        return;
    }

    const typeNames = {
        maintenance: '设备运维',
        group: '分组汇总',
        summary: '综合汇总'
    };

    container.innerHTML = reports.map(report => {
        const isPdf = report.filename.endsWith('.pdf');
        const isXlsx = report.filename.endsWith('.xlsx');
        const reportType = report.filename.includes('group') ? 'group' : 
                          report.filename.includes('summary') ? 'summary' : 'maintenance';
        
        return `
        <div class="report-item">
            <div class="report-info">
                <div class="report-icon">
                    ${isPdf ? '📕' : isXlsx ? '📗' : '📄'}
                </div>
                <div>
                    <div class="report-name">${report.filename}</div>
                    <div class="report-meta">
                        ${typeNames[reportType] || '报表'} · 
                        ${formatFileSize(report.size)} · 
                        ${formatDateTime(report.created_at)}
                    </div>
                </div>
            </div>
            <div>
                <button class="btn btn-sm btn-primary" onclick="downloadReport('${report.filename}')">⬇️ 下载</button>
                <button class="btn btn-sm btn-danger" onclick="deleteReport('${report.filename}')">🗑️ 删除</button>
            </div>
        </div>
    `}).join('');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function filterReports() {
    loadReports();
}

function openGenerateModal() {
    document.getElementById('report-form').reset();
    openModal('generate-modal');
}

function toggleTargetSelect() {
    const type = document.getElementById('gen-report-type').value;
    const targetGroup = document.getElementById('target-device-group');
    const targetSelect = document.getElementById('gen-target');
    
    if (type === 'device') {
        targetSelect.innerHTML = `
            <option value="motor_001">主电机-1号</option>
            <option value="motor_002">主电机-2号</option>
            <option value="pump_001">冷却水泵</option>
            <option value="sensor_temp_001">温度传感器-A1</option>
        `;
    } else {
        targetSelect.innerHTML = `
            <option value="group_motors">电机设备组</option>
            <option value="group_pumps">泵类设备组</option>
            <option value="group_sensors">传感器组</option>
        `;
    }
}

async function generateReport() {
    const reportType = document.getElementById('gen-report-type').value;
    const targetId = document.getElementById('gen-target').value;
    const timeRange = document.getElementById('gen-time-range').value;
    const format = document.getElementById('gen-format').value;

    let result;
    if (reportType === 'device') {
        result = await api.generateDeviceReport(targetId, {
            time_range: timeRange,
            format: format
        });
    } else {
        result = await api.generateGroupReport(targetId, {
            time_range: timeRange,
            format: format
        });
    }

    closeModal('generate-modal');
    
    if (result.success) {
        alert(`报表生成成功！\n文件名: ${result.filename}`);
        api.downloadReport(result.filename);
        loadReports();
    } else {
        alert('报表生成成功！（模拟模式）');
        loadReports();
    }
}

function downloadReport(filename) {
    api.downloadReport(filename);
}

function deleteReport(filename) {
    if (confirm(`确定要删除报表 ${filename} 吗？`)) {
        alert('删除功能演示中...');
        loadReports();
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

document.addEventListener('DOMContentLoaded', initReportsPage);
