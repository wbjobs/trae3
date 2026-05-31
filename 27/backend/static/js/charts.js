const ChartManager = {
    charts: {},
    _lastData: {},
    _refreshTimers: {},

    initChart(containerId, option) {
        const dom = document.getElementById(containerId);
        if (!dom) return null;

        if (this.charts[containerId]) {
            this.charts[containerId].dispose();
        }

        const chart = echarts.init(dom, null, { renderer: 'canvas' });
        chart.setOption(option || this._getEmptyOption('暂无数据'));
        this.charts[containerId] = chart;

        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(dom);
        chart._ro = ro;

        return chart;
    },

    updateChart(containerId, option, merge = true) {
        if (this.charts[containerId]) {
            this.charts[containerId].setOption(
                option || this._getEmptyOption('暂无数据'),
                { notMerge: !merge }
            );
        }
    },

    incrementalUpdate(containerId, newPoints, field) {
        const chart = this.charts[containerId];
        if (!chart || !newPoints || newPoints.length === 0) return;

        const option = chart.getOption();
        if (!option || !option.series || !option.series[0]) return;

        const existingData = option.series[0].data || [];
        const existingTimes = (option.xAxis && option.xAxis[0] && option.xAxis[0].data) || [];

        let appended = 0;
        const maxPoints = 200;

        for (const point of newPoints) {
            const timeLabel = this._formatTime(point.time);
            const value = point[field] !== undefined ? point[field] : (point.value || 0);

            if (!existingTimes.includes(timeLabel)) {
                existingTimes.push(timeLabel);
                existingData.push(value);
                appended++;
            }
        }

        while (existingTimes.length > maxPoints) {
            existingTimes.shift();
            existingData.shift();
        }

        chart.setOption({
            xAxis: { data: existingTimes },
            series: [{ data: existingData }]
        });

        return appended;
    },

    startAutoRefresh(containerId, fetchFn, interval = 30000) {
        this.stopAutoRefresh(containerId);
        this._refreshTimers[containerId] = setInterval(async () => {
            try {
                const data = await fetchFn();
                if (data) {
                    const field = containerId.includes('pressure') ? 'pressure' : 'flow';
                    this.incrementalUpdate(containerId, data, field);
                }
            } catch (e) {
                console.warn(`自动刷新${containerId}失败:`, e);
            }
        }, interval);
    },

    stopAutoRefresh(containerId) {
        if (this._refreshTimers[containerId]) {
            clearInterval(this._refreshTimers[containerId]);
            delete this._refreshTimers[containerId];
        }
    },

    stopAllAutoRefresh() {
        Object.keys(this._refreshTimers).forEach(id => this.stopAutoRefresh(id));
    },

    _formatTime(timeStr) {
        const d = new Date(timeStr);
        return `${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    _getEmptyOption(message) {
        return {
            title: {
                text: message,
                left: 'center',
                top: 'center',
                textStyle: { color: '#888', fontSize: 14 }
            }
        };
    },

    _isValidData(data) {
        return data && Array.isArray(data) && data.length > 0;
    },

    _extractData(response, field) {
        if (Array.isArray(response)) return response;
        if (response && response.data && Array.isArray(response.data)) return response.data;
        return [];
    },

    createTrendChart(data, field, color, faultPoints) {
        const chartData = this._extractData(data, field);
        if (!this._isValidData(chartData)) {
            return this._getEmptyOption('暂无趋势数据');
        }

        const times = [...new Set(chartData.map(d => d.time))];
        const values = chartData.map(d => d[field] !== undefined ? d[field] : (d.value !== undefined ? d.value : 0));
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);

        const markPointData = [];
        const markLineData = [];

        if (field === 'pressure') {
            markLineData.push(
                { yAxis: 0.7, name: '压力上限', lineStyle: { color: '#ff6b6b', type: 'dashed' } },
                { yAxis: 0.15, name: '压力下限', lineStyle: { color: '#ffa500', type: 'dashed' } }
            );
        } else if (field === 'flow') {
            markLineData.push(
                { yAxis: 200, name: '流量上限', lineStyle: { color: '#ff6b6b', type: 'dashed' } },
                { yAxis: 5, name: '流量下限', lineStyle: { color: '#ffa500', type: 'dashed' } }
            );
        }

        const faultIndices = [];
        if (this._isValidData(faultPoints)) {
            faultPoints.forEach(fp => {
                const idx = times.indexOf(fp.time);
                if (idx >= 0) {
                    faultIndices.push(idx);
                }
            });
        }

        chartData.forEach((d, i) => {
            if (d.is_fault === 1 || faultIndices.includes(i)) {
                markPointData.push({
                    name: '故障',
                    coord: [i, values[i]],
                    value: values[i],
                    itemStyle: { color: '#ff4444' },
                    symbol: 'diamond',
                    symbolSize: 12
                });
            }
        });

        const seriesData = values.map((v, i) => ({
            value: v,
            itemStyle: (markPointData.some(mp => mp.coord && mp.coord[0] === i))
                ? { color: '#ff4444' } : {}
        }));

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                borderColor: '#00d4ff',
                textStyle: { color: '#fff' },
                formatter: function(params) {
                    const p = params[0];
                    const isFault = markPointData.some(mp => mp.coord && mp.coord[0] === p.dataIndex);
                    let html = `<div style="font-weight:bold">${p.axisValue}</div>`;
                    html += `<div>${field === 'pressure' ? '压力' : '流量'}: ${typeof p.value === 'object' ? p.value.value || p.value : p.value}</div>`;
                    if (isFault) {
                        html += `<div style="color:#ff4444;font-weight:bold">⚠ 故障点</div>`;
                    }
                    return html;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            dataZoom: [
                { type: 'inside', start: 0, end: 100 },
                { start: 0, end: 100, height: 20, bottom: 5 }
            ],
            xAxis: {
                type: 'category',
                data: times.map(t => this._formatTime(t)),
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [{
                name: field === 'pressure' ? '压力' : '流量',
                type: 'line',
                smooth: true,
                data: values,
                lineStyle: { color, width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: color + '40' },
                        { offset: 1, color: color + '00' }
                    ])
                },
                itemStyle: { color },
                markPoint: markPointData.length > 0 ? {
                    data: markPointData,
                    animation: true,
                    label: { show: true, color: '#fff', fontSize: 10, formatter: '⚠' }
                } : undefined,
                markLine: markLineData.length > 0 ? {
                    silent: true,
                    data: markLineData,
                    label: { show: true, color: '#ccc', fontSize: 10 },
                    symbol: 'none'
                } : undefined
            }]
        };
    },

    createZonePressureChart(overviewData) {
        if (!this._isValidData(overviewData)) {
            return this._getEmptyOption('暂无分区数据');
        }

        const zones = overviewData.map(d => d.zone || '未知分区');
        const avgPressures = overviewData.map(d => d.pressure?.avg !== undefined ? d.pressure.avg : 0);
        const statusColors = overviewData.map(d => {
            if (d.status === 'warning') return '#ffa500';
            if (d.status === 'fault') return '#ff4444';
            if (d.status === 'offline') return '#888';
            return '#00d4ff';
        });

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#00d4ff',
                textStyle: { color: '#fff' }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
                type: 'category',
                data: zones,
                axisLabel: { color: '#888', rotate: 30 }
            },
            yAxis: {
                type: 'value',
                name: 'MPa',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [{
                name: '平均压力',
                type: 'bar',
                data: avgPressures.map((value, index) => ({
                    value,
                    itemStyle: { color: statusColors[index] }
                })),
                barWidth: '60%',
                markLine: {
                    silent: true,
                    data: [
                        { yAxis: 0.7, lineStyle: { color: '#ff6b6b', type: 'dashed' }, label: { formatter: '上限' } },
                        { yAxis: 0.15, lineStyle: { color: '#ffa500', type: 'dashed' }, label: { formatter: '下限' } }
                    ]
                }
            }]
        };
    },

    createDeviceMapChart(deviceData) {
        if (!this._isValidData(deviceData)) {
            return this._getEmptyOption('暂无设备数据');
        }

        const zones = [...new Set(deviceData.map(d => d.zone))].filter(Boolean);
        const zoneColors = {
            '东城区': '#00d4ff', '西城区': '#00ff88', '南城区': '#ffa500',
            '北城区': '#ff6b6b', '中心区': '#9b59b6', '工业区': '#1abc9c',
            '住宅区A': '#e74c3c', '住宅区B': '#3498db'
        };

        const normalSeries = [];
        const faultDevices = deviceData.filter(d => d.status === 'fault' || d.has_fault);

        zones.forEach(zone => {
            const zoneDevices = deviceData.filter(d => d.zone === zone && d.status !== 'fault' && !d.has_fault);
            if (zoneDevices.length === 0) return;
            normalSeries.push({
                name: zone,
                type: 'scatter',
                data: zoneDevices.map(d => ({
                    name: d.device_id || d.name || '未知设备',
                    value: [
                        d.longitude !== undefined ? d.longitude : 116.5,
                        d.latitude !== undefined ? d.latitude : 39.9
                    ],
                    itemStyle: { color: zoneColors[zone] || '#00d4ff' },
                    symbolSize: 8
                }))
            });
        });

        const faultSeries = faultDevices.length > 0 ? [{
            name: '故障设备',
            type: 'effectScatter',
            data: faultDevices.map(d => ({
                name: (d.device_id || d.name || '未知') + ' [故障]',
                value: [
                    d.longitude !== undefined ? d.longitude : 116.5,
                    d.latitude !== undefined ? d.latitude : 39.9
                ],
                device_id: d.device_id,
                zone: d.zone,
                status: d.status
            })),
            symbolSize: 16,
            showEffectOn: 'render',
            rippleEffect: {
                brushType: 'stroke',
                scale: 4,
                period: 3
            },
            itemStyle: { color: '#ff4444', shadowBlur: 10, shadowColor: '#ff4444' },
            label: {
                show: true,
                formatter: '{b}',
                position: 'right',
                color: '#ff4444',
                fontSize: 10
            },
            zlevel: 10
        }] : [];

        return {
            tooltip: {
                formatter: params => {
                    const d = params.data;
                    let html = `<div style="font-weight:bold">${d.name}</div>`;
                    html += `<div>经度: ${d.value[0].toFixed(4)}</div>`;
                    html += `<div>纬度: ${d.value[1].toFixed(4)}</div>`;
                    if (d.status === 'fault' || d.name.includes('故障')) {
                        html += `<div style="color:#ff4444;font-weight:bold">⚠ 故障设备</div>`;
                    }
                    return html;
                }
            },
            grid: { left: '10%', right: '10%', top: '10%', bottom: '10%' },
            xAxis: {
                type: 'value', name: '经度', min: 116.3, max: 116.7,
                axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value', name: '纬度', min: 39.8, max: 40.1,
                axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888' }
            },
            series: [...normalSeries, ...faultSeries]
        };
    },

    createFaultTypeChart(faultTypes) {
        if (!this._isValidData(faultTypes)) {
            return this._getEmptyOption('暂无故障数据');
        }

        const typeNames = {
            'low_pressure': '压力过低', 'high_pressure': '压力过高',
            'low_flow': '流量过低', 'high_flow': '流量过高',
            'offline': '设备离线', 'abnormal': '数据异常'
        };
        const typeColors = {
            'low_pressure': '#ff6b6b', 'high_pressure': '#ffa500',
            'low_flow': '#3498db', 'high_flow': '#9b59b6',
            'offline': '#888', 'abnormal': '#e74c3c'
        };

        return {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#ff4444',
                textStyle: { color: '#fff' }
            },
            legend: {
                orient: 'vertical', right: '10%', top: 'center',
                textStyle: { color: '#888' }
            },
            series: [{
                name: '故障类型',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10, borderColor: '#1a1a2e', borderWidth: 2
                },
                label: { show: false },
                emphasis: {
                    label: { show: true, fontSize: 16, fontWeight: 'bold' }
                },
                data: faultTypes.map(d => ({
                    value: d.count || 0,
                    name: typeNames[d.fault_type] || d.fault_type || '未知',
                    itemStyle: { color: typeColors[d.fault_type] || '#00d4ff' }
                }))
            }]
        };
    },

    createFaultTrendChart(dailyData) {
        if (!this._isValidData(dailyData)) {
            return this._getEmptyOption('暂无趋势数据');
        }

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#ff6b6b',
                textStyle: { color: '#fff' }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
                type: 'category',
                data: dailyData.map(d => {
                    if (!d.date) return '';
                    const parts = d.date.split('-');
                    return parts.length >= 2 ? `${parts[1]}/${parts[2]}` : d.date;
                }),
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [{
                name: '故障数',
                type: 'line',
                smooth: true,
                data: dailyData.map(d => d.count || 0),
                lineStyle: { color: '#ff6b6b', width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(255,107,107,0.4)' },
                        { offset: 1, color: 'rgba(255,107,107,0)' }
                    ])
                },
                itemStyle: { color: '#ff6b6b' },
                markPoint: {
                    data: [{ type: 'max', name: '最大值' }],
                    symbol: 'pin',
                    symbolSize: 40,
                    itemStyle: { color: '#ff4444' }
                }
            }]
        };
    },

    createQualityScoreChart(qualityData) {
        if (!qualityData) {
            return this._getEmptyOption('暂无质量数据');
        }

        const completeness = qualityData.completeness !== undefined ? qualityData.completeness : 0;
        const validity = qualityData.validity !== undefined ? qualityData.validity : 0;
        const consistency = qualityData.consistency !== undefined ? qualityData.consistency : 0;
        const overall_score = qualityData.overall_score !== undefined ? qualityData.overall_score : 0;

        return {
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#00d4ff',
                textStyle: { color: '#fff' }
            },
            radar: {
                indicator: [
                    { name: '完整性', max: 100 }, { name: '有效性', max: 100 },
                    { name: '一致性', max: 100 }, { name: '总体评分', max: 100 }
                ],
                radius: '70%',
                axisName: { color: '#888' },
                splitArea: { areaStyle: { color: ['rgba(0,212,255,0.05)'] } },
                axisLine: { lineStyle: { color: '#444' } },
                splitLine: { lineStyle: { color: '#444' } }
            },
            series: [{
                type: 'radar',
                data: [{
                    value: [completeness, validity, consistency, overall_score],
                    name: '数据质量',
                    areaStyle: { color: 'rgba(0,212,255,0.3)' },
                    lineStyle: { color: '#00d4ff' },
                    itemStyle: { color: '#00d4ff' }
                }]
            }]
        };
    },

    createAnomalyChart(cleaningData) {
        if (!cleaningData || !cleaningData.pressure) {
            return this._getEmptyOption('暂无异常数据');
        }

        const pressureDetails = cleaningData.pressure?.details || {};
        const flowDetails = cleaningData.flow?.details || {};

        return {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { data: ['压力异常', '流量异常'], textStyle: { color: '#888' } },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
                type: 'category',
                data: ['超范围', 'IQR异常', '突变', '负值'],
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [
                {
                    name: '压力异常', type: 'bar',
                    data: [
                        pressureDetails.out_of_range || 0,
                        pressureDetails.iqr_outliers || 0,
                        pressureDetails.sudden_jump || 0,
                        0
                    ],
                    itemStyle: { color: '#00d4ff' }
                },
                {
                    name: '流量异常', type: 'bar',
                    data: [
                        flowDetails.out_of_range || 0,
                        flowDetails.iqr_outliers || 0,
                        flowDetails.sudden_jump || 0,
                        flowDetails.negative_values || 0
                    ],
                    itemStyle: { color: '#00ff88' }
                }
            ]
        };
    },

    createHourlyChart(data, field, color) {
        const chartData = this._extractData(data, field);
        if (!this._isValidData(chartData)) {
            return this._getEmptyOption('暂无小时数据');
        }

        const hours = Array.from({ length: 24 }, (_, i) => i);
        const values = hours.map(h => {
            const hourData = chartData.filter(d => {
                try {
                    const date = new Date(d.time);
                    return date.getHours() === h;
                } catch { return false; }
            });
            if (hourData.length === 0) return 0;
            const sum = hourData.reduce((s, d) => s + (d[field] !== undefined ? d[field] : (d.value || 0)), 0);
            return sum / hourData.length;
        });

        const threshold = field === 'pressure' ? 0.7 : 200;
        const lowerThreshold = field === 'pressure' ? 0.15 : 5;

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#00d4ff',
                textStyle: { color: '#fff' }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
                type: 'category',
                data: hours.map(h => `${h}:00`),
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [{
                name: field === 'pressure' ? '压力' : '流量',
                type: 'bar',
                data: values.map(v => ({
                    value: v,
                    itemStyle: {
                        color: v > threshold ? '#ff4444' : (v < lowerThreshold ? '#ffa500' : color)
                    }
                }))
            }]
        };
    },

    createMultiZoneTrendChart(comparisonData, metric) {
        const zones = comparisonData?.data || [];
        if (!this._isValidData(zones)) {
            return this._getEmptyOption('暂无对比数据');
        }

        const colors = ['#00d4ff', '#00ff88', '#ffa500', '#ff6b6b', '#9b59b6', '#1abc9c', '#e74c3c', '#3498db'];

        const series = zones.map((zoneData, index) => ({
            name: zoneData.zone || `分区${index + 1}`,
            type: 'line',
            smooth: true,
            data: zoneData.values || [],
            lineStyle: { color: colors[index % colors.length], width: 2 },
            itemStyle: { color: colors[index % colors.length] }
        }));

        const xAxisData = zones[0]?.values?.map((_, i) => `Day ${i + 1}`) || [];

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: '#00d4ff',
                textStyle: { color: '#fff' }
            },
            legend: { data: zones.map(z => z.zone), textStyle: { color: '#888' } },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            dataZoom: [
                { type: 'inside', start: 0, end: 100 },
                { start: 0, end: 100, height: 20, bottom: 5 }
            ],
            xAxis: {
                type: 'category', data: xAxisData,
                axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value', name: metric === 'pressure' ? 'MPa' : 'm³/h',
                axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series
        };
    }
};
