import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Statistic,
  Row,
  Col,
  message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import LogFilter from '../components/LogFilter';
import LogTable from '../components/LogTable';
import { terminalApi, Terminal, Log } from '../services/api';

const TerminalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const loadingRef = useRef(false);

  const loadTerminal = useCallback(async () => {
    if (!id) return;
    try {
      const response = await terminalApi.getTerminal(id);
      setTerminal(response.data);
    } catch (error) {
      message.error('加载终端信息失败');
    }
  }, [id]);

  const loadLogs = useCallback(async (currentFilters: Record<string, string>, page: number, pageSize: number) => {
    if (!id || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await terminalApi.getTerminalLogs(id, {
        ...currentFilters,
        page,
        pageSize,
      });
      setLogs(response.data.data);
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      message.error('加载日志失败');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadTerminal();
      loadLogs(filters, pagination.current, pagination.pageSize);
    }
  }, [id, filters, pagination.current, pagination.pageSize, loadTerminal, loadLogs]);

  const handleFilter = useCallback((values: Record<string, string>) => {
    const { terminalId, ...rest } = values;
    setFilters(rest);
    setPagination(prev => ({ ...prev, current: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize }));
  }, []);

  if (!terminal) {
    return null;
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/terminals')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card title="终端详情" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={16}>
            <Descriptions column={2}>
              <Descriptions.Item label="终端ID">
                <code>{terminal.id}</code>
              </Descriptions.Item>
              <Descriptions.Item label="终端名称">
                {terminal.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="车牌号">
                {terminal.vehicle_number || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={terminal.status === 'online' ? 'green' : 'red'}>
                  {terminal.status === 'online' ? '在线' : '离线'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="IP地址">
                {terminal.ip_address || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最后在线">
                {terminal.last_online
                  ? dayjs(terminal.last_online).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(terminal.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={8}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="日志总数"
                  value={terminal.stats?.total_logs || 0}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="错误日志"
                  value={terminal.stats?.error_count || 0}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Statistic
                  title="警告日志"
                  value={terminal.stats?.warning_count || 0}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="最后日志"
                  value={
                    terminal.stats?.last_log_time
                      ? dayjs(terminal.stats.last_log_time).format('MM-DD HH:mm')
                      : '-'
                  }
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card title="终端日志">
        <LogFilter onFilter={handleFilter} showTerminalFilter={false} />
        <LogTable
          data={logs}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: handlePageChange,
          }}
        />
      </Card>
    </div>
  );
};

export default TerminalDetail;