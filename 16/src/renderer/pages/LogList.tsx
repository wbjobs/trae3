import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Select,
  DatePicker,
  Modal,
  message,
  Popconfirm,
  Descriptions,
  Empty,
  Tooltip,
  Progress
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  ClearOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  BugOutlined,
  FileTextOutlined,
  BarChartOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../services/apiClient';
import { LogEntry, LogLevel } from '@shared/types';
import { LogLevel as LogLevelEnum } from '@shared/types';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

const levelMap: Record<LogLevel, { color: string; text: string; icon: React.ReactNode }> = {
  [LogLevelEnum.INFO]: { color: 'blue', text: '信息', icon: <InfoCircleOutlined /> },
  [LogLevelEnum.WARN]: { color: 'orange', text: '警告', icon: <WarningOutlined /> },
  [LogLevelEnum.ERROR]: { color: 'red', text: '错误', icon: <CloseCircleOutlined /> },
  [LogLevelEnum.DEBUG]: { color: 'purple', text: '调试', icon: <BugOutlined /> }
};

const LogList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [levelFilter, setLevelFilter] = useState<LogLevel | undefined>();
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0
  });
  const [chartData, setChartData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        pageSize
      };
      if (levelFilter) params.level = levelFilter;
      if (moduleFilter) params.module = moduleFilter;
      if (actionFilter) params.action = actionFilter;
      if (keyword) params.keyword = keyword;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startTime = dateRange[0].toISOString();
        params.endTime = dateRange[1].toISOString();
      }

      const result = await apiService.getLogs(params);
      if (result.success && result.data) {
        setLogs(result.data.items);
        setTotal(result.data.total);
      }
    } catch (error) {
      message.error('加载日志列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, levelFilter, moduleFilter, actionFilter, keyword, dateRange]);

  const loadStats = useCallback(async () => {
    try {
      const result = await apiService.getLogStats(7);
      if (result.success && result.data) {
        setStats({
          total: result.data.total,
          info: result.data.byLevel[LogLevelEnum.INFO] || 0,
          warn: result.data.byLevel[LogLevelEnum.WARN] || 0,
          error: result.data.byLevel[LogLevelEnum.ERROR] || 0,
          debug: result.data.byLevel[LogLevelEnum.DEBUG] || 0
        });
        
        setChartData([
          { name: '信息', value: result.data.byLevel[LogLevelEnum.INFO] || 0, color: '#1890ff' },
          { name: '警告', value: result.data.byLevel[LogLevelEnum.WARN] || 0, color: '#faad14' },
          { name: '错误', value: result.data.byLevel[LogLevelEnum.ERROR] || 0, color: '#ff4d4f' },
          { name: '调试', value: result.data.byLevel[LogLevelEnum.DEBUG] || 0, color: '#722ed1' }
        ]);

        setDailyData(result.data.daily);
        setModules(Object.keys(result.data.byModule));
      }
    } catch (error) {
      console.error('加载统计数据失败', error);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [loadLogs, loadStats]);

  const handleSearch = () => {
    setPage(1);
    loadLogs();
  };

  const handleReset = () => {
    setLevelFilter(undefined);
    setModuleFilter(undefined);
    setActionFilter(undefined);
    setKeyword('');
    setDateRange(null);
    setPage(1);
    setTimeout(() => loadLogs(), 0);
  };

  const handleCleanLogs = async (days: number) => {
    try {
      const result = await apiService.cleanLogs(days);
      if (result.success) {
        message.success(`已清理 ${result.data?.deletedCount || 0} 条日志`);
        loadLogs();
        loadStats();
      } else {
        message.error(result.error || '清理日志失败');
      }
    } catch (error) {
      message.error('清理日志失败');
    }
  };

  const handleClearAll = async () => {
    try {
      const result = await apiService.clearAllLogs();
      if (result.success) {
        message.success(`已清空 ${result.data?.deletedCount || 0} 条日志`);
        loadLogs();
        loadStats();
      } else {
        message.error(result.error || '清空日志失败');
      }
    } catch (error) {
      message.error('清空日志失败');
    }
  };

  const showDetail = (log: LogEntry) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
  };

  const columns: ColumnsType<LogEntry> = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: LogLevel) => {
        const config = levelMap[level];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      }
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      render: (text: string) => (
        <Tag color="default">{text}</Tag>
      )
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 120
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: Date) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="查看详情">
          <Button
            type="link"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => showDetail(record)}
          />
        </Tooltip>
      )
    }
  ];

  const chartColors = ['#1890ff', '#faad14', '#ff4d4f', '#722ed1'];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="日志总数"
              value={stats.total}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="信息"
              value={stats.info}
              valueStyle={{ color: '#1890ff' }}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="警告"
              value={stats.warn}
              valueStyle={{ color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="错误"
              value={stats.error}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="调试"
              value={stats.debug}
              valueStyle={{ color: '#722ed1' }}
              prefix={<BugOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="模块数"
              value={modules.length}
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="日志级别分布" size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {chartData.map((item, index) => (
                <div key={item.name} style={{ flex: 1, minWidth: 100 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: item.color }}>{item.name}</span>
                    <span>{item.value}</span>
                  </div>
                  <Progress
                    percent={stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0}
                    showInfo={false}
                    strokeColor={item.color}
                    size="small"
                  />
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="近7日日志趋势" size="small">
            <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {dailyData.map((item, index) => {
                const maxCount = Math.max(...dailyData.map(d => d.count), 1);
                const height = maxCount > 0 ? (item.count / maxCount) * 60 + 20 : 20;
                return (
                  <div key={item.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div
                      style={{
                        height,
                        background: '#1890ff',
                        borderRadius: 4,
                        margin: '0 auto',
                        width: '70%',
                        minWidth: 4,
                        opacity: 0.8
                      }}
                      title={`${item.date}: ${item.count}`}
                    />
                    <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                      {item.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title="操作日志"
        extra={
          <Space>
            <Popconfirm
              title="确定清理7天前的日志？"
              onConfirm={() => handleCleanLogs(7)}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<ClearOutlined />}>清理7天前</Button>
            </Popconfirm>
            <Popconfirm
              title="确定清理30天前的日志？"
              onConfirm={() => handleCleanLogs(30)}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<ClearOutlined />}>清理30天前</Button>
            </Popconfirm>
            <Popconfirm
              title="确定清空所有日志？此操作不可恢复！"
              onConfirm={handleClearAll}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>清空日志</Button>
            </Popconfirm>
            <Button icon={<ReloadOutlined />} onClick={loadLogs}>刷新</Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="日志级别"
            style={{ width: 120 }}
            allowClear
            value={levelFilter}
            onChange={setLevelFilter}
          >
            <Option value={LogLevelEnum.INFO}>信息</Option>
            <Option value={LogLevelEnum.WARN}>警告</Option>
            <Option value={LogLevelEnum.ERROR}>错误</Option>
            <Option value={LogLevelEnum.DEBUG}>调试</Option>
          </Select>
          <Select
            placeholder="模块"
            style={{ width: 150 }}
            allowClear
            showSearch
            value={moduleFilter}
            onChange={setModuleFilter}
          >
            {modules.map(m => (
              <Option key={m} value={m}>{m}</Option>
            ))}
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
          />
          <Search
            placeholder="搜索关键词"
            style={{ width: 200 }}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
          />
          <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            }
          }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: <Empty description="暂无日志" />
          }}
        />
      </Card>

      <Modal
        title="日志详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>关闭</Button>
        ]}
        width={700}
      >
        {selectedLog && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="日志级别">
              <Tag
                color={levelMap[selectedLog.level].color}
                icon={levelMap[selectedLog.level].icon}
              >
                {levelMap[selectedLog.level].text}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="模块">{selectedLog.module}</Descriptions.Item>
            <Descriptions.Item label="操作">{selectedLog.action}</Descriptions.Item>
            <Descriptions.Item label="消息">{selectedLog.message}</Descriptions.Item>
            <Descriptions.Item label="时间">
              {new Date(selectedLog.createdAt).toLocaleString('zh-CN')}
            </Descriptions.Item>
            {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
              <Descriptions.Item label="详细信息">
                <pre style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  margin: 0,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 12
                }}>
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default LogList;
