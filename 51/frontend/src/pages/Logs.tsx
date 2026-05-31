import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Button, Space, Modal, message } from 'antd';
import { ClearOutlined, ExportOutlined } from '@ant-design/icons';
import LogFilter from '../components/LogFilter';
import LogTable from '../components/LogTable';
import { logApi, Log } from '../services/api';

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const filtersRef = useRef<Record<string, string>>({});
  const loadingRef = useRef(false);

  const loadLogs = useCallback(async (currentFilters: Record<string, string>, page: number, pageSize: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await logApi.getLogs({
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
  }, []);

  useEffect(() => {
    loadLogs(filters, pagination.current, pagination.pageSize);
  }, [filters, pagination.current, pagination.pageSize, loadLogs]);

  const handleFilter = useCallback((values: Record<string, string>) => {
    filtersRef.current = values;
    setFilters(values);
    setPagination(prev => ({ ...prev, current: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize }));
  }, []);

  const handleClearLogs = () => {
    Modal.confirm({
      title: '确认清理日志',
      content: '确定要清理30天前的日志吗？此操作不可恢复。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await logApi.clearLogs(30);
          message.success('日志清理成功');
          loadLogs(filtersRef.current, 1, pagination.pageSize);
        } catch (error) {
          message.error('日志清理失败');
        }
      },
    });
  };

  const handleExport = () => {
    message.info('导出功能开发中...');
  };

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ClearOutlined />} onClick={handleClearLogs} danger>
            清理旧日志
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出日志
          </Button>
        </Space>

        <LogFilter onFilter={handleFilter} />

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

export default Logs;