import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Select, DatePicker, Button, Space, Tag, Spin, Empty, message,
  Row, Col, Statistic, Divider, Timeline, Slider,
} from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, StepForwardOutlined,
  FastForwardOutlined, ReloadOutlined, HistoryOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { logApi, terminalApi, Log } from '../services/api';

const TimelinePage: React.FC = () => {
  const [terminals, setTerminals] = useState<Array<{ id: string; name?: string }>>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'day'),
    dayjs(),
  ]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [playSpeed, setPlaySpeed] = useState(1);
  const playTimerRef = useRef<any>(null);

  useEffect(() => {
    loadTerminals();
  }, []);

  useEffect(() => {
    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (playing && logs.length > 0) {
      playTimerRef.current = setInterval(() => {
        setPlayIndex(prev => {
          if (prev >= logs.length - 1) {
            setPlaying(false);
            clearInterval(playTimerRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, Math.max(50, 500 / playSpeed));
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [playing, playSpeed, logs.length]);

  const loadTerminals = async () => {
    try {
      const response = await terminalApi.getTerminals({ pageSize: 1000 });
      setTerminals(response.data.data);
    } catch (error) {
      message.error('加载终端列表失败');
    }
  };

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setPlaying(false);
    setPlayIndex(0);
    try {
      const response = await logApi.getTimeline({
        terminalId: selectedTerminal,
        startDate: dateRange[0].toISOString(),
        endDate: dateRange[1].toISOString(),
      });
      setLogs(response.data);
      if (response.data.length === 0) {
        message.info('未找到匹配的日志');
      }
    } catch (error) {
      message.error('加载历史日志失败');
    } finally {
      setLoading(false);
    }
  }, [selectedTerminal, dateRange]);

  const handlePlay = () => {
    if (logs.length === 0) return;
    if (playIndex >= logs.length - 1) {
      setPlayIndex(0);
    }
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  const handleStep = () => {
    if (playIndex < logs.length - 1) {
      setPlayIndex(prev => prev + 1);
    }
  };

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      debug: 'default', info: 'blue', warning: 'orange', error: 'red', critical: 'red',
    };
    return colors[level] || 'default';
  };

  const getTimelineChartOption = () => {
    if (logs.length === 0) return {};

    const hourBuckets: Record<string, Record<string, number>> = {};
    const levelOrder = ['debug', 'info', 'warning', 'error', 'critical'];

    logs.forEach(log => {
      const hour = dayjs(log.timestamp).format('YYYY-MM-DD HH:00');
      if (!hourBuckets[hour]) {
        hourBuckets[hour] = { debug: 0, info: 0, warning: 0, error: 0, critical: 0 };
      }
      if (hourBuckets[hour].hasOwnProperty(log.level)) {
        hourBuckets[hour][log.level]++;
      }
    });

    const sortedHours = Object.keys(hourBuckets).sort();

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: levelOrder.map(l => l.toUpperCase()) },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: sortedHours.map(h => h.slice(5)),
      },
      yAxis: { type: 'value' },
      series: levelOrder.map(level => ({
        name: level.toUpperCase(),
        type: 'bar',
        stack: 'total',
        data: sortedHours.map(h => hourBuckets[h][level] || 0),
        itemStyle: {
          color: level === 'critical' ? '#cf1322' :
                 level === 'error' ? '#ff4d4f' :
                 level === 'warning' ? '#faad14' :
                 level === 'info' ? '#1890ff' : '#d9d9d9',
        },
      })),
      markLine: playing && playIndex < logs.length ? {
        data: [{
          xAxis: dayjs(logs[playIndex]?.timestamp).format('YYYY-MM-DD HH:00').slice(5),
          label: { formatter: '回放位置' },
          lineStyle: { color: '#ff4d4f', width: 2 },
        }],
      } : undefined,
    };
  };

  const currentLog = logs[playIndex];
  const visibleLogs = logs.slice(Math.max(0, playIndex - 20), playIndex + 1);

  const levelCounts = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <Card title={
        <span><HistoryOutlined style={{ marginRight: 8 }} />历史日志回溯</span>
      }>
        <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Select
              placeholder="选择终端(可选)"
              allowClear
              showSearch
              style={{ width: '100%' }}
              value={selectedTerminal}
              onChange={setSelectedTerminal}
              optionFilterProp="children"
            >
              {terminals.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name || t.id}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={10}>
            <DatePicker.RangePicker
              showTime
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              placeholder={['开始时间', '结束时间']}
            />
          </Col>
          <Col span={4}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
              查询
            </Button>
          </Col>
          <Col span={4}>
            <Space>
              <span>速度:</span>
              <Select value={playSpeed} onChange={setPlaySpeed} style={{ width: 80 }}>
                <Select.Option value={0.5}>0.5x</Select.Option>
                <Select.Option value={1}>1x</Select.Option>
                <Select.Option value={2}>2x</Select.Option>
                <Select.Option value={5}>5x</Select.Option>
                <Select.Option value={10}>10x</Select.Option>
              </Select>
            </Space>
          </Col>
        </Row>
      </Card>

      {logs.length > 0 && (
        <>
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="总日志" value={logs.length} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="CRITICAL" value={levelCounts.critical || 0} valueStyle={{ color: '#cf1322' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="ERROR" value={levelCounts.error || 0} valueStyle={{ color: '#ff4d4f' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="WARNING" value={levelCounts.warning || 0} valueStyle={{ color: '#faad14' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="INFO" value={levelCounts.info || 0} valueStyle={{ color: '#1890ff' }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" className="stat-card">
                <Statistic title="DEBUG" value={levelCounts.debug || 0} />
              </Card>
            </Col>
          </Row>

          <Card title="时间分布" style={{ marginTop: 16 }}>
            <ReactECharts option={getTimelineChartOption()} style={{ height: 250 }} />
          </Card>

          <Card title="回放控制" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Slider
                min={0}
                max={logs.length - 1}
                value={playIndex}
                onChange={setPlayIndex}
                tooltip={{
                  formatter: (value) => {
                    const log = logs[value || 0];
                    return log ? dayjs(log.timestamp).format('YYYY-MM-DD HH:mm:ss') : '';
                  },
                }}
              />
            </div>
            <Space size="large" style={{ justifyContent: 'center', display: 'flex' }}>
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={playing ? handlePause : handlePlay}
              />
              <Button
                shape="circle"
                size="large"
                icon={<StepForwardOutlined />}
                onClick={handleStep}
              />
              <span style={{ color: '#8c8c8c' }}>
                {playIndex + 1} / {logs.length}
              </span>
            </Space>
          </Card>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={16}>
              <Card title="日志流" size="small"
                extra={currentLog && (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {dayjs(currentLog.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
                  </span>
                )}
              >
                <div style={{ maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
                  {visibleLogs.map((log, i) => (
                    <div
                      key={playIndex - 20 + i}
                      style={{
                        padding: '4px 8px',
                        background: i === visibleLogs.length - 1 ? '#fff7e6' : 'transparent',
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <Tag color={getLevelColor(log.level)} style={{ minWidth: 60, textAlign: 'center' }}>
                        {log.level.toUpperCase()}
                      </Tag>
                      <span style={{ color: '#8c8c8c', marginRight: 8 }}>
                        {dayjs(log.timestamp).format('HH:mm:ss.SSS')}
                      </span>
                      <span style={{ color: '#1890ff', marginRight: 8 }}>[{log.module}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card title="当前日志详情" size="small">
                {currentLog ? (
                  <div>
                    <p><strong>时间:</strong> {dayjs(currentLog.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}</p>
                    <p><strong>终端:</strong> {currentLog.terminal_name || currentLog.terminal_id}</p>
                    <p><strong>级别:</strong> <Tag color={getLevelColor(currentLog.level)}>{currentLog.level.toUpperCase()}</Tag></p>
                    <p><strong>模块:</strong> {currentLog.module}</p>
                    <p><strong>消息:</strong></p>
                    <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                      {currentLog.message}
                    </pre>
                    {currentLog.metadata && (
                      <>
                        <p><strong>元数据:</strong></p>
                        <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(currentLog.metadata, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                ) : (
                  <Empty description="选择日志条目查看详情" />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {!loading && logs.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <Empty description="选择时间范围和终端，点击查询开始回溯历史日志" />
        </Card>
      )}
    </div>
  );
};

export default TimelinePage;