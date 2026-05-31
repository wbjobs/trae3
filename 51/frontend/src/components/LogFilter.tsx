import React, { useEffect, useState, useCallback } from 'react';
import {
  Form, Select, Input, DatePicker, Button, Row, Col, Space,
  Tag, Collapse, Switch, InputNumber,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { logApi, terminalApi } from '../services/api';

const FIXED_LEVELS = ['debug', 'info', 'warning', 'error', 'critical'];

interface LogFilterProps {
  onFilter: (values: Record<string, string>) => void;
  showTerminalFilter?: boolean;
}

const LogFilter: React.FC<LogFilterProps> = ({ onFilter, showTerminalFilter = true }) => {
  const [form] = Form.useForm();
  const [modules, setModules] = useState<string[]>([]);
  const [terminals, setTerminals] = useState<Array<{ id: string; name?: string }>>([]);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      const [modulesRes, terminalsRes] = await Promise.all([
        logApi.getModules(),
        terminalApi.getTerminals({ pageSize: 1000 }),
      ]);
      setModules(modulesRes.data);
      setTerminals(terminalsRes.data.data);
    } catch (error) {
      console.error('加载筛选选项失败:', error);
    }
  };

  const cleanFilterValues = (values: Record<string, any>): Record<string, string> => {
    const cleaned: Record<string, string> = {};
    if (values.terminalId) cleaned.terminalId = values.terminalId;
    if (values.level) cleaned.level = values.level;
    if (values.module) cleaned.module = values.module;
    if (values.keyword && typeof values.keyword === 'string' && values.keyword.trim()) {
      cleaned.keyword = values.keyword.trim();
    }
    if (values.timeRange && Array.isArray(values.timeRange) && values.timeRange[0] && values.timeRange[1]) {
      cleaned.startTime = values.timeRange[0].toISOString();
      cleaned.endTime = values.timeRange[1].toISOString();
    }
    if (advanced && values.keywords && Array.isArray(values.keywords) && values.keywords.length > 0) {
      cleaned.keyword = values.keywords.join('|');
    }
    return cleaned;
  };

  const handleSearch = useCallback((values: any) => {
    const cleaned = cleanFilterValues(values);
    onFilter(cleaned);
  }, [onFilter, advanced]);

  const handleReset = useCallback(() => {
    form.resetFields();
    onFilter({});
  }, [form, onFilter]);

  return (
    <div className="filter-panel">
      <Form form={form} layout="horizontal" onFinish={handleSearch}>
        <Row gutter={[16, 16]}>
          {showTerminalFilter && (
            <Col span={6}>
              <Form.Item name="terminalId" label="终端" style={{ marginBottom: 0 }}>
                <Select placeholder="选择终端" allowClear showSearch optionFilterProp="children">
                  {terminals.map(t => (
                    <Select.Option key={t.id} value={t.id}>
                      {t.name || t.id}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          )}
          <Col span={showTerminalFilter ? 4 : 6}>
            <Form.Item name="level" label="级别" style={{ marginBottom: 0 }}>
              <Select placeholder="选择级别" allowClear>
                {FIXED_LEVELS.map(level => (
                  <Select.Option key={level} value={level}>
                    <span className={`log-level-${level}`}>{level.toUpperCase()}</span>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={showTerminalFilter ? 4 : 6}>
            <Form.Item name="module" label="模块" style={{ marginBottom: 0 }}>
              <Select placeholder="选择模块" allowClear showSearch>
                {modules.map(m => (
                  <Select.Option key={m} value={m}>{m}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="keyword" label="关键词" style={{ marginBottom: 0 }}>
              <Input placeholder="搜索关键词" allowClear />
            </Form.Item>
          </Col>
          <Col span={showTerminalFilter ? 4 : 6}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>

        <Row style={{ marginTop: 8 }}>
          <Col span={24}>
            <Button
              type="link"
              size="small"
              onClick={() => setAdvanced(!advanced)}
              icon={advanced ? <UpOutlined /> : <DownOutlined />}
            >
              {advanced ? '收起高级搜索' : '展开高级搜索'}
            </Button>
          </Col>
        </Row>

        {advanced && (
          <Row gutter={[16, 16]} style={{ marginTop: 8, paddingTop: 12, borderTop: '1px dashed #e8e8e8' }}>
            <Col span={8}>
              <Form.Item name="timeRange" label="时间范围" style={{ marginBottom: 0 }}>
                <DatePicker.RangePicker
                  showTime
                  style={{ width: '100%' }}
                  placeholder={['开始时间', '结束时间']}
                  defaultRanges={{
                    '最近1小时': [dayjs().subtract(1, 'hour'), dayjs()],
                    '最近24小时': [dayjs().subtract(24, 'hour'), dayjs()],
                    '最近7天': [dayjs().subtract(7, 'day'), dayjs()],
                    '最近30天': [dayjs().subtract(30, 'day'), dayjs()],
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="keywords" label="多关键词" style={{ marginBottom: 0 }}
                extra="匹配任一关键词">
                <Select
                  mode="tags"
                  placeholder="输入关键词后回车"
                  tokenSeparators={[',', '|']}
                  open={false}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="快捷筛选" style={{ marginBottom: 0 }}>
                <Space wrap>
                  <Tag color="red" style={{ cursor: 'pointer' }}
                    onClick={() => {
                      form.setFieldsValue({ level: 'error' });
                      form.submit();
                    }}>仅错误</Tag>
                  <Tag color="orange" style={{ cursor: 'pointer' }}
                    onClick={() => {
                      form.setFieldsValue({ level: 'warning' });
                      form.submit();
                    }}>仅警告</Tag>
                  <Tag color="volcano" style={{ cursor: 'pointer' }}
                    onClick={() => {
                      form.setFieldsValue({ level: undefined });
                      form.setFieldsValue({
                        timeRange: [dayjs().subtract(1, 'hour'), dayjs()],
                      });
                      form.submit();
                    }}>最近1小时</Tag>
                  <Tag color="blue" style={{ cursor: 'pointer' }}
                    onClick={() => {
                      form.setFieldsValue({
                        timeRange: [dayjs().subtract(24, 'hour'), dayjs()],
                      });
                      form.submit();
                    }}>最近24小时</Tag>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        )}
      </Form>
    </div>
  );
};

export default LogFilter;