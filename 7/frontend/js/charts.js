class ChartManager {
    constructor() {
        this.charts = {};
        this.colorPalette = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
            '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
        ];
    }

    _safeInit(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        if (this.charts[containerId]) {
            this.charts[containerId].dispose();
            delete this.charts[containerId];
        }
        return echarts.init(container);
    }

    _safeResize(chart) {
        if (!chart) return;
        const handler = () => { try { chart.resize(); } catch(e) {} };
        window.addEventListener('resize', handler);
    }

    _isEmpty(data) {
        return !data || !data.series || !Array.isArray(data.series) || data.series.length === 0;
    }

    createLineChart(containerId, data, options = {}) {
        const chart = this._safeInit(containerId);
        if (!chart) return null;

        if (this._isEmpty(data) || !data.timestamps || data.timestamps.length === 0) {
            chart.setOption({
                title: { text: '暂无数据', left: 'center', top: 'center',
                    textStyle: { color: '#718096', fontSize: 14, fontWeight: 'normal' } },
                xAxis: { show: false }, yAxis: { show: false }, series: []
            });
            this.charts[containerId] = chart;
            this._safeResize(chart);
            return chart;
        }

        const config = {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(26, 54, 93, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#fff' },
            },
            legend: {
                data: data.series.map((s) => s.name),
                textStyle: { color: '#a0aec0' },
                top: 0,
            },
            grid: {
                left: '3%', right: '4%', bottom: '3%', top: '15%',
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: data.timestamps || [],
                axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                axisLabel: { color: '#718096', fontSize: 11, rotate: options.xAxisRotate || 0 },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisLabel: { color: '#718096', fontSize: 11 },
                splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
            },
            series: data.series.map((s, index) => ({
                ...s,
                lineStyle: { width: 2, color: this.colorPalette[index % this.colorPalette.length] },
                itemStyle: { color: this.colorPalette[index % this.colorPalette.length] },
                areaStyle: options.showArea ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: this.colorPalette[index % this.colorPalette.length] + '40' },
                        { offset: 1, color: this.colorPalette[index % this.colorPalette.length] + '00' },
                    ]),
                } : undefined,
                showSymbol: false,
            })),
            ...options.echartsOptions,
        };

        chart.setOption(config);
        this.charts[containerId] = chart;
        this._safeResize(chart);
        return chart;
    }

    createHeatmapChart(containerId, data, options = {}) {
        const chart = this._safeInit(containerId);
        if (!chart) return null;

        if (!data || !data.data || data.data.length === 0 || !data.x_axis || data.x_axis.length === 0) {
            chart.setOption({
                title: { text: '暂无热力图数据', left: 'center', top: 'center',
                    textStyle: { color: '#718096', fontSize: 14, fontWeight: 'normal' } },
                xAxis: { show: false }, yAxis: { show: false }, series: []
            });
            this.charts[containerId] = chart;
            this._safeResize(chart);
            return chart;
        }

        const min = options.min !== undefined ? options.min : (data.visual_min || 0);
        const max = options.max !== undefined ? options.max : (data.visual_max || 100);

        const config = {
            tooltip: {
                position: 'top',
                backgroundColor: 'rgba(26, 54, 93, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#fff' },
                formatter: (params) => {
                    const yIdx = params.value[1];
                    const xIdx = params.value[0];
                    const yLabel = data.y_axis && data.y_axis[yIdx] ? data.y_axis[yIdx] : yIdx;
                    const xLabel = data.x_axis && data.x_axis[xIdx] ? data.x_axis[xIdx] : xIdx;
                    return `设备: ${yLabel}<br/>时间: ${xLabel}<br/>${data.metric || '值'}: ${params.value[2]}`;
                },
            },
            grid: { left: '15%', right: '10%', top: '10%', bottom: '15%' },
            xAxis: {
                type: 'category',
                data: data.x_axis,
                splitArea: { show: true },
                axisLabel: { color: '#718096', fontSize: 10, rotate: 45 },
            },
            yAxis: {
                type: 'category',
                data: data.y_axis || [],
                splitArea: { show: true },
                axisLabel: { color: '#718096', fontSize: 11 },
            },
            visualMap: {
                min: min,
                max: max,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: '0%',
                inRange: { color: ['#1a365d', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'] },
                textStyle: { color: '#718096' },
            },
            series: [{
                name: data.metric || 'Heatmap',
                type: 'heatmap',
                data: data.data,
                label: { show: options.showLabels || false, color: '#fff', fontSize: 10 },
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' },
                },
            }],
        };

        chart.setOption(config);
        this.charts[containerId] = chart;
        this._safeResize(chart);
        return chart;
    }

    createGaugeChart(containerId, value, options = {}) {
        const chart = this._safeInit(containerId);
        if (!chart) return null;

        const safeValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;

        const config = {
            series: [{
                type: 'gauge',
                startAngle: 180, endAngle: 0,
                min: options.min || 0, max: options.max || 100,
                splitNumber: 5,
                itemStyle: {
                    color: options.color || '#3b82f6',
                    shadowColor: 'rgba(0, 0, 0, 0.3)',
                    shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 2,
                },
                progress: { show: true, roundCap: true, width: 18 },
                pointer: { show: false },
                axisLine: {
                    roundCap: true,
                    lineStyle: { width: 18, color: [[1, 'rgba(255, 255, 255, 0.1)']] },
                },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                anchor: { show: false },
                title: { show: false },
                detail: {
                    valueAnimation: true,
                    fontSize: 24, fontWeight: 'bold', color: '#fff',
                    offsetCenter: [0, '20%'],
                    formatter: '{value}' + (options.unit || ''),
                },
                data: [{ value: safeValue }],
            }],
        };

        chart.setOption(config);
        this.charts[containerId] = chart;
        this._safeResize(chart);
        return chart;
    }

    createBarChart(containerId, data, options = {}) {
        const chart = this._safeInit(containerId);
        if (!chart) return null;

        if (!data || !data.series || data.series.length === 0 || !data.categories) {
            chart.setOption({
                title: { text: '暂无数据', left: 'center', top: 'center',
                    textStyle: { color: '#718096', fontSize: 14, fontWeight: 'normal' } },
                xAxis: { show: false }, yAxis: { show: false }, series: []
            });
            this.charts[containerId] = chart;
            this._safeResize(chart);
            return chart;
        }

        const config = {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(26, 54, 93, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#fff' },
            },
            legend: {
                data: data.series.map((s) => s.name),
                textStyle: { color: '#a0aec0' },
                top: 0,
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: data.categories,
                axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                axisLabel: { color: '#718096', fontSize: 11 },
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisLabel: { color: '#718096', fontSize: 11 },
                splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
            },
            series: data.series.map((s, index) => ({
                ...s, type: 'bar', barWidth: '40%',
                itemStyle: {
                    color: this.colorPalette[index % this.colorPalette.length],
                    borderRadius: [4, 4, 0, 0],
                },
            })),
        };

        chart.setOption(config);
        this.charts[containerId] = chart;
        this._safeResize(chart);
        return chart;
    }

    createPieChart(containerId, data, options = {}) {
        const chart = this._safeInit(containerId);
        if (!chart) return null;

        if (!data || !Array.isArray(data) || data.length === 0) {
            chart.setOption({
                title: { text: '暂无数据', left: 'center', top: 'center',
                    textStyle: { color: '#718096', fontSize: 14, fontWeight: 'normal' } },
                series: []
            });
            this.charts[containerId] = chart;
            this._safeResize(chart);
            return chart;
        }

        const config = {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(26, 54, 93, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#fff' },
            },
            legend: {
                orient: 'vertical', left: 'left',
                textStyle: { color: '#a0aec0' },
            },
            series: [{
                name: options.title || 'Data',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: { borderRadius: 8, borderColor: '#1a365d', borderWidth: 2 },
                label: { show: false, position: 'center' },
                emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold', color: '#fff' } },
                labelLine: { show: false },
                data: data.map((item, index) => ({
                    ...item,
                    itemStyle: { color: this.colorPalette[index % this.colorPalette.length] },
                })),
            }],
        };

        chart.setOption(config);
        this.charts[containerId] = chart;
        this._safeResize(chart);
        return chart;
    }

    updateChart(containerId, data) {
        if (this.charts[containerId]) {
            this.charts[containerId].setOption({
                series: data.series || [],
                xAxis: { data: data.timestamps || [] },
            });
        }
    }

    disposeChart(containerId) {
        if (this.charts[containerId]) {
            this.charts[containerId].dispose();
            delete this.charts[containerId];
        }
    }

    disposeAll() {
        Object.keys(this.charts).forEach((id) => {
            try { this.charts[id].dispose(); } catch(e) {}
        });
        this.charts = {};
    }
}

const chartManager = new ChartManager();
