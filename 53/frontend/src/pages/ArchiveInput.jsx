import { useState } from 'react';
import { Form, Input, Select, DatePicker, Button, message, Card, Space, Tag } from 'antd';
import { archiveAPI, fileAPI } from '../services/api';

const { TextArea } = Input;
const { Option } = Select;

const categories = [
  '文书档案', '科技档案', '会计档案', '人事档案', '声像档案', '电子档案'
];

const retentionPeriods = ['永久', '30年', '10年', '5年'];

function ArchiveInput() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [archiveId, setArchiveId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleCategoryChange = async (value) => {
    try {
      const response = await archiveAPI.generateNumber(value);
      if (response.data.success) {
        form.setFieldsValue({
          archiveNumber: response.data.data.archiveNumber
        });
      }
    } catch (error) {
      console.error('生成编号失败:', error);
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const formattedValues = {
        ...values,
        creationDate: values.creationDate.format('YYYY-MM-DD'),
        keywords: values.keywords ? values.keywords.split(/[,，、]/).map(k => k.trim()).filter(Boolean) : []
      };

      const response = await archiveAPI.create(formattedValues);
      if (response.data.success) {
        message.success('档案录入成功！');
        setArchiveId(response.data.data.id);
      } else {
        message.error(response.data.errors?.join('\n') || '录入失败');
      }
    } catch (error) {
      message.error(error.response?.data?.errors?.join('\n') || '录入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!archiveId) {
      message.error('请先保存档案信息');
      return;
    }

    setUploading(true);
    try {
      const response = await fileAPI.upload(archiveId, file);
      if (response.data.success) {
        message.success('文件上传成功！');
      } else {
        message.error(response.data.error || '上传失败');
      }
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>档案录入</h2>
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            retentionPeriod: '30年',
            creationDate: null
          }}
        >
          <Form.Item
            name="title"
            label="档案标题"
            rules={[{ required: true, message: '请输入档案标题' }]}
          >
            <Input placeholder="请输入档案标题" />
          </Form.Item>

          <Space style={{ width: '100%', display: 'flex' }}>
            <Form.Item
              name="category"
              label="档案类别"
              rules={[{ required: true, message: '请选择档案类别' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="请选择档案类别" onChange={handleCategoryChange}>
                {categories.map(cat => (
                  <Option key={cat} value={cat}>{cat}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="archiveNumber"
              label="档案编号"
              rules={[{ required: true, message: '请输入档案编号' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="选择类别后自动生成" />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%', display: 'flex' }}>
            <Form.Item
              name="retentionPeriod"
              label="保管期限"
              rules={[{ required: true, message: '请选择保管期限' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="请选择保管期限">
                {retentionPeriods.map(period => (
                  <Option key={period} value={period}>{period}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="creationDate"
              label="创建日期"
              rules={[{ required: true, message: '请选择创建日期' }]}
              style={{ flex: 1 }}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%', display: 'flex' }}>
            <Form.Item
              name="creator"
              label="创建人"
              rules={[{ required: true, message: '请输入创建人' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="请输入创建人" />
            </Form.Item>

            <Form.Item
              name="department"
              label="所属部门"
              rules={[{ required: true, message: '请输入所属部门' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="请输入所属部门" />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="档案描述">
            <TextArea rows={4} placeholder="请输入档案描述" />
          </Form.Item>

          <Form.Item name="keywords" label="关键词（用逗号分隔）">
            <Input placeholder="例如：报告,总结,计划" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                保存档案信息
              </Button>
              <Button onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {archiveId && (
          <Card size="small" title="附件上传" style={{ marginTop: 16 }}>
            <input
              type="file"
              onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
              disabled={uploading}
            />
            {uploading && <div style={{ marginTop: 8 }}>上传中...</div>}
          </Card>
        )}
      </Card>
    </div>
  );
}

export default ArchiveInput;
