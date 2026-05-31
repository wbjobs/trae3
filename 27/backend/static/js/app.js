const App = {
    currentZone: '',
    _refreshInterval: null,
    _dataBuffers: {},

    async init() {
        this.setupTabs();
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);

        await this.loadZones();
        await this.loadDashboard();
        await this.loadFaultData();
        await this.loadReports();

        this.setupEventListeners();
        this.initCharts();
        this.startDashboardAutoRefresh();
    },

    setupTabs() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');

                if (tab.dataset.tab === 'zone') {
                    this.loadZoneData();
                } else if (tab.dataset.tab === 'trend') {
                    this.loadTrendAnalysis();
                } else if (tab.dataset.tab === 'quality') {
                    this.loadQualityData();
                }
            });
        });
    },

    updateTime() {
        const now = new Date();
        document.getElementById('current-time').textContent =
            now.toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
    },

    startDashboardAutoRefresh() {
        if (this._refreshInterval) clearInterval(this._refreshInterval);
        this._refreshInterval = setInterval(() => this.refreshDashboard(), 30000);
    },

    async refreshDashboard() {
        try {
            const data = await API.getDashboardOverview();
            if (data.summary) {
                document.getElementById('avg-pressure').textContent = data.summary.avg_pressure || '--';
                document.getElementById('avg-flow').textContent = data.summary.avg_flow || '--';
                document.getElementById('online-rate').textContent = data.summary.online_rate || '--';
                document.getElementById('active-faults').textContent = data.summary.active_faults || '--';
            }

            const pressureData = data.pressure_trend || [];
            if (pressureData.length > 0) {
                const pressureOption = ChartManager.createTrendChart(pressureData, 'pressure', '#00d4ff');
                ChartManager.updateChart('pressure-trend-chart', pressureOption, true);
            }

            const flowData = data.flow_trend || [];
            if (flowData.length > 0) {
                const flowOption = ChartManager.createTrendChart(flowData, 'flow', '#00ff88');
                ChartManager.updateChart('flow-trend-chart', flowOption, true);
            }
        } catch (e) {
            console.warn('仪表盘自动刷新失败:', e);
        }
    },

    async loadZones() {
        const data = await API.getZones();
        const zones = data.zones || [];

        const selects = [
            'pressure-zone-select', 'flow-zone-select', 'zone-select',
            'trend-zone-select', 'quality-zone-select'
        ];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                zones.forEach(zone => {
                    const option = document.createElement('option');
                    option.value = zone;
                    option.textContent = zone;
                    select.appendChild(option);
                });
            }
        });
    },

    async loadDashboard() {
        const [data, zoneOverview, deviceMapData] = await Promise.all([
            API.getDashboardOverview(),
            API.getZoneOverview(),
            API.getDeviceMapData()
        ]);

        if (data.summary) {
            document.getElementById('avg-pressure').textContent = data.summary.avg_pressure || '--';
            document.getElementById('avg-flow').textContent = data.summary.avg_flow || '--';
            document.getElementById('online-rate').textContent = data.summary.online_rate || '--';
            document.getElementById('active-faults').textContent = data.summary.active_faults || '--';
        }

        const pressureData = data.pressure_trend || [];
        if (pressureData.length > 0) {
            const faultPoints = await API.getFaultPoints({ field: 'pressure' }).catch(() => ({ fault_points: [] }));
            const pressureOption = ChartManager.createTrendChart(
                pressureData, 'pressure', '#00d4ff', faultPoints.fault_points
            );
            ChartManager.initChart('pressure-trend-chart', pressureOption);
        }

        const flowData = data.flow_trend || [];
        if (flowData.length > 0) {
            const flowOption = ChartManager.createTrendChart(flowData, 'flow', '#00ff88');
            ChartManager.initChart('flow-trend-chart', flowOption);
        }

        if (zoneOverview.overview) {
            const zoneOption = ChartManager.createZonePressureChart(zoneOverview.overview);
            ChartManager.initChart('zone-pressure-chart', zoneOption);
        }

        if (deviceMapData.devices && deviceMapData.devices.length > 0) {
            const mapOption = ChartManager.createDeviceMapChart(deviceMapData.devices);
            ChartManager.initChart('device-map-chart', mapOption);
        }
    },

    async loadZoneData() {
        const zone = document.getElementById('zone-select').value;
        const timeRange = document.getElementById('time-range-select').value;

        const endTime = new Date();
        let startTime;

        switch (timeRange) {
            case '1h': startTime = new Date(endTime - 3600000); break;
            case '24h': startTime = new Date(endTime - 86400000); break;
            case '7d': startTime = new Date(endTime - 7 * 86400000); break;
            case '30d': startTime = new Date(endTime - 30 * 86400000); break;
            default: startTime = new Date(endTime - 86400000);
        }

        const params = {
            zone,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString()
        };

        const [pressureData, flowData, statsData] = await Promise.all([
            API.getPressureData(params),
            API.getFlowData(params),
            API.getZoneStatistics(params)
        ]);

        const pList = pressureData.data || pressureData;
        const fList = flowData.data || flowData;

        if (pList && pList.length > 0) {
            const pressureOption = ChartManager.createTrendChart(pList, 'pressure', '#00d4ff');
            ChartManager.initChart('zone-pressure-detail-chart', pressureOption);

            const hourlyPressureOption = ChartManager.createHourlyChart(pList, 'pressure', '#00d4ff');
            ChartManager.initChart('pressure-hourly-chart', hourlyPressureOption);
        }

        if (fList && fList.length > 0) {
            const flowOption = ChartManager.createTrendChart(fList, 'flow', '#00ff88');
            ChartManager.initChart('zone-flow-detail-chart', flowOption);

            const hourlyFlowOption = ChartManager.createHourlyChart(fList, 'flow', '#00ff88');
            ChartManager.initChart('flow-hourly-chart', hourlyFlowOption);
        }

        if (statsData.statistics && zone) {
            const zoneStats = statsData.statistics[zone];
            if (zoneStats) {
                this.updateZoneOverview(zoneStats);
            }
        }
    },

    updateZoneOverview(stats) {
        const container = document.getElementById('zone-overview');
        container.innerHTML = `
            <div class="zone-card">
                <div class="zone-card-title">平均压力</div>
                <div class="zone-card-value">${stats.pressure.overall.avg.toFixed(3)} MPa</div>
            </div>
            <div class="zone-card">
                <div class="zone-card-title">压力范围</div>
                <div class="zone-card-value">${stats.pressure.overall.min.toFixed(3)} - ${stats.pressure.overall.max.toFixed(3)}</div>
            </div>
            <div class="zone-card">
                <div class="zone-card-title">平均流量</div>
                <div class="zone-card-value">${stats.flow.overall.avg.toFixed(2)} m³/h</div>
            </div>
            <div class="zone-card">
                <div class="zone-card-title">流量范围</div>
                <div class="zone-card-value">${stats.flow.overall.min.toFixed(2)} - ${stats.flow.overall.max.toFixed(2)}</div>
            </div>
            <div class="zone-card">
                <div class="zone-card-title">故障次数</div>
                <div class="zone-card-value">${stats.fault_count}</div>
            </div>
        `;
    },

    async loadTrendAnalysis() {
        const metric = document.getElementById('trend-metric-select').value;
        const comparison = await API.getZoneComparison({ metric });

        if (comparison.comparison) {
            const trendOption = ChartManager.createMultiZoneTrendChart(comparison.comparison, metric);
            ChartManager.initChart('multi-zone-trend-chart', trendOption);
        }
    },

    async loadFaultData() {
        const [stats, faultList] = await Promise.all([
            API.getFaultStatistics(),
            API.getFaultList({ days: 7 })
        ]);

        if (stats.statistics) {
            const s = stats.statistics;
            document.getElementById('total-faults').textContent = s.total;
            document.getElementById('resolved-faults').textContent = s.resolved;
            document.getElementById('unresolved-faults').textContent = s.active;
            document.getElementById('resolution-rate').textContent = s.resolution_rate + '%';

            if (s.by_type && s.by_type.length > 0) {
                const typeOption = ChartManager.createFaultTypeChart(s.by_type);
                ChartManager.initChart('fault-type-chart', typeOption);
            }

            if (s.daily) {
                const trendOption = ChartManager.createFaultTrendChart(s.daily);
                ChartManager.initChart('fault-trend-chart', trendOption);
            }
        }

        if (faultList.faults) {
            this.renderFaultTable(faultList.faults);
        }
    },

    renderFaultTable(faults) {
        const tbody = document.getElementById('fault-table-body');
        const maxRender = 100;
        const toRender = faults.slice(0, maxRender);

        tbody.innerHTML = toRender.map(fault => `
            <tr class="${fault.resolved ? '' : 'fault-active-row'}">
                <td>${fault.device_id}</td>
                <td>${fault.zone_name}</td>
                <td>${fault.fault_type_display}</td>
                <td>${fault.fault_value}</td>
                <td>${fault.threshold}</td>
                <td>${new Date(fault.fault_time).toLocaleString('zh-CN')}</td>
                <td><span class="fault-status ${fault.resolved ? 'resolved' : 'pending'}">${fault.resolved ? '已解决' : '待处理'}</span></td>
                <td>${!fault.resolved ? `<button class="btn btn-small btn-primary" onclick="App.resolveFault(${fault.id})">解决</button>` : '-'}</td>
            </tr>
        `).join('');

        if (faults.length > maxRender) {
            tbody.innerHTML += `<tr><td colspan="8" style="text-align:center;color:#888">显示前${maxRender}条，共${faults.length}条记录</td></tr>`;
        }
    },

    async resolveFault(faultId) {
        await API.resolveFault(faultId);
        this.loadFaultData();
    },

    async loadQualityData() {
        const zone = document.getElementById('quality-zone-select').value;
        const startDate = document.getElementById('quality-start-date').value;
        const endDate = document.getElementById('quality-end-date').value;

        const params = { zone };
        if (startDate) params.start_time = new Date(startDate).toISOString();
        if (endDate) params.end_time = new Date(endDate).toISOString();

        const quality = await API.getDataQuality(params);

        if (quality.quality) {
            this.renderQualitySummary(quality.quality);

            const scoreOption = ChartManager.createQualityScoreChart(quality.quality.pressure_quality);
            ChartManager.initChart('quality-score-chart', scoreOption);
        }
    },

    renderQualitySummary(quality) {
        const container = document.getElementById('quality-summary');
        const score = quality.overall_quality_score;
        let scoreClass = 'poor';
        if (score >= 90) scoreClass = 'excellent';
        else if (score >= 75) scoreClass = 'good';
        else if (score >= 60) scoreClass = 'medium';

        container.innerHTML = `
            <div class="quality-card">
                <div class="quality-score ${scoreClass}">${score}</div>
                <div class="quality-label">总体质量评分</div>
            </div>
            <div class="quality-card">
                <div class="quality-score ${quality.pressure_quality.overall_score >= 90 ? 'excellent' : quality.pressure_quality.overall_score >= 75 ? 'good' : 'medium'}">${quality.pressure_quality.overall_score}</div>
                <div class="quality-label">压力数据质量</div>
            </div>
            <div class="quality-card">
                <div class="quality-score ${quality.flow_quality.overall_score >= 90 ? 'excellent' : quality.flow_quality.overall_score >= 75 ? 'good' : 'medium'}">${quality.flow_quality.overall_score}</div>
                <div class="quality-label">流量数据质量</div>
            </div>
        `;
    },

    async loadReports() {
        const reports = await API.getReports();

        if (reports.results) {
            const tbody = document.getElementById('report-table-body');
            tbody.innerHTML = reports.results.map(report => `
                <tr>
                    <td>${report.report_date}</td>
                    <td>${report.total_devices}</td>
                    <td>${report.online_devices}</td>
                    <td>${report.fault_devices}</td>
                    <td>${report.avg_pressure} MPa</td>
                    <td>${report.avg_flow} m³/h</td>
                    <td><button class="btn btn-small btn-primary" onclick="window.open('/api/report/${report.id}/download/')">下载</button></td>
                </tr>
            `).join('');
        }
    },

    setupEventListeners() {
        document.getElementById('pressure-zone-select')?.addEventListener('change', async (e) => {
            const data = await API.getPressureData({ zone: e.target.value });
            const pList = data.data || data;
            if (pList) {
                const option = ChartManager.createTrendChart(pList, 'pressure', '#00d4ff');
                ChartManager.updateChart('pressure-trend-chart', option);
            }
        });

        document.getElementById('flow-zone-select')?.addEventListener('change', async (e) => {
            const data = await API.getFlowData({ zone: e.target.value });
            const fList = data.data || data;
            if (fList) {
                const option = ChartManager.createTrendChart(fList, 'flow', '#00ff88');
                ChartManager.updateChart('flow-trend-chart', option);
            }
        });

        document.getElementById('refresh-zone-btn')?.addEventListener('click', () => this.loadZoneData());
        document.getElementById('analyze-btn')?.addEventListener('click', () => this.loadTrendAnalysis());

        document.getElementById('check-fault-btn')?.addEventListener('click', async () => {
            const result = await API.checkFaults();
            alert(`检测到 ${result.detected_count} 个新故障`);
            this.loadFaultData();
        });

        document.getElementById('fault-status-filter')?.addEventListener('change', async (e) => {
            const data = await API.getFaultList({ resolved: e.target.value, days: 30 });
            if (data.faults) {
                this.renderFaultTable(data.faults);
            }
        });

        document.getElementById('check-quality-btn')?.addEventListener('click', () => this.loadQualityData());

        document.getElementById('clean-data-btn')?.addEventListener('click', async () => {
            const zone = document.getElementById('quality-zone-select').value;
            const result = await API.cleanData({ zone });
            alert('数据清洗完成！');
            this.loadQualityData();
        });

        document.getElementById('generate-report-btn')?.addEventListener('click', async () => {
            const reportDate = document.getElementById('report-date').value;
            const result = await API.generateReport(reportDate);
            if (result.status === 'success') {
                alert('报表生成成功！');
                this.loadReports();
            }
        });

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('report-date').value = today;
        document.getElementById('quality-start-date').value = today;
        document.getElementById('quality-end-date').value = today;
    },

    initCharts() {
        const emptyOption = {
            title: {
                text: '加载中...',
                left: 'center',
                top: 'center',
                textStyle: { color: '#888' }
            }
        };

        const chartIds = [
            'pressure-trend-chart', 'flow-trend-chart', 'device-map-chart',
            'zone-pressure-chart', 'zone-pressure-detail-chart',
            'zone-flow-detail-chart', 'pressure-hourly-chart', 'flow-hourly-chart',
            'multi-zone-trend-chart', 'fault-type-chart', 'fault-trend-chart',
            'quality-score-chart', 'anomaly-dist-chart'
        ];

        chartIds.forEach(id => {
            if (document.getElementById(id)) {
                ChartManager.initChart(id, emptyOption);
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
