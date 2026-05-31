import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, DatePicker, Button, Table, message, Card, Space, Tag } from 'antd';
import { SearchOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { archiveAPI, fileAPI } from '../services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

const categories = [
  '文书档案', '科技档案', '会计档案', '人事档案', '声像档案', '电子档案'
];

function ArchiveSearch() {
  const [form] = Form.useForm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const navigate = useNavigate();

  const columns = [
    {
      title: '档案编号',
      dataIndex: 'archiveNumber',
      key: 'archiveNumber',
      width: 150
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '保管期限',
      dataIndex: 'retentionPeriod',
      key: 'retentionPeriod',
      width: 100,
      render: (text) => {
        const color = text === '永久' ? 'red' : text === '30年' ? 'orange' : 'green';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      width: 100
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120
    },
    {
      title: '创建日期',
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      render: (keywords) => (
        <>
          {keywords?.slice(0, 3).map((kw, idx) => (
            <Tag key={idx}>{kw}</Tag>
          ))}
        </>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/preview/${record.id}`)}
          >
            预览
          </Button>
          {record.filePath && (
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={() => fileAPI.download(record.id)}
            >
              下载
            </Button>
          )}
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const response = await archiveAPI.list(params);
      if (response.data.success) {
        setData(response.data.data.list);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total,
          current: params.page || prev.current
        }));
      }
    } catch (error) {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ page: 1, pageSize: pagination.pageSize });
  }, []);

  const handleSearch = (values) => {
    const params = {
      page: 1,
      pageSize: pagination.pageSize,
      keyword: values.keyword,
      category: values.category
    };
    if (values.dateRange) {
      params.startDate = values.dateRange[0]?.format('YYYY-MM-DD');
      params.endDate = values.dateRange[1]?.format('YYYY-MM-DD');
    }
    fetchData(params);
  };

  const handleDelete = async (id) => {
    try {
      const response = await archiveAPI.delete(id);
      if (response.data.success) {
        message.success('删除成功');
        fetchData();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleTableChange = (newPagination) => {
    fetchData({ page: newPagination.current, pageSize: newPagination.pageSize });
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>编目检索</h2>
      
      <Card style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
        >
          <Form.Item name="keyword" label="关键词">
            <Input placeholder="标题/编号/描述" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="category" label="类别">
            <Select placeholder="全部类别" style={{ width: 150 }} allowClear>
              {categories.map(cat => (
                <Option key={cat} value={cat}>{cat}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="dateRange" label="日期范围">
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              检索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button onClick={() => form.resetFields()}>
              重置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
}

export default ArchiveSearch;
