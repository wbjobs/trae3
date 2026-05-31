import React, { useEffect, useState } from 'react'
import { Form, Input, Button, Select, DatePicker, message, Card, Row, Col, Space, InputNumber } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, ImageUploader } from '@/components'
import { specimenApi } from '@/api'
import { SpecimenCreateParams, SpecimenUpdateParams, FileUploadResult, SPECIMEN_TYPE_OPTIONS } from '@/types'
import dayjs from 'dayjs'

const SpecimenEdit: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<FileUploadResult[]>([])

  const isEdit = !!id

  useEffect(() => {
    if (isEdit) {
      fetchDetail()
    }
  }, [id])

  const fetchDetail = async () => {
    try {
      const res = await specimenApi.getById(Number(id))
      const data = res.data
      form.setFieldsValue({
        specimenNo: data.specimenNo,
        name: data.name,
        type: data.type,
        classification: data.classification,
        description: data.description,
        location: data.location,
        longitude: data.longitude,
        latitude: data.latitude,
        collector: data.collector,
        collectTime: data.collectTime ? dayjs(data.collectTime) : null,
        storageMethod: data.storageMethod,
        status: data.status,
        tags: data.tags
      })
    } catch (error) {
      message.error('获取详情失败')
    }
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      const params: any = {
        specimenNo: values.specimenNo,
        name: values.name,
        type: values.type,
        classification: values.classification,
        description: values.description,
        location: values.location,
        longitude: values.longitude,
        latitude: values.latitude,
        collector: values.collector,
        collectTime: values.collectTime?.toISOString(),
        storageMethod: values.storageMethod,
        status: values.status || 1,
        tags: values.tags,
        imageFileIds: images.map(img => img.fileId)
      }

      if (isEdit) {
        await specimenApi.update({ id: Number(id), ...params } as SpecimenUpdateParams)
        message.success('更新成功')
      } else {
        await specimenApi.create(params as SpecimenCreateParams)
        message.success('创建成功')
      }
      navigate('/specimen/list')
    } catch (error: any) {
      message.error(error.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? '编辑标本' : '新增标本'}
        showBack
        extra={
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              onClick={() => form.submit()}
            >
              保存
            </Button>
          </Space>
        }
      />
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ status: 1 }}
      >
        <Card title="基本信息" style={{ marginBottom: 24 }}>
          <Row gutter={24}>
            <Col span={8}>
              <Form.Item
                name="specimenNo"
                label="标本编号"
                rules={[{ required: true, message: '请输入标本编号' }]}
              >
                <Input placeholder="请输入标本编号" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="name"
                label="标本名称"
                rules={[{ required: true, message: '请输入标本名称' }]}
              >
                <Input placeholder="请输入标本名称" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="type"
                label="标本类型"
                rules={[{ required: true, message: '请选择标本类型' }]}
              >
                <Select placeholder="请选择类型" options={SPECIMEN_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="classification" label="分类学名">
                <Input placeholder="请输入分类学名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="collector"
                label="采集人"
                rules={[{ required: true, message: '请输入采集人' }]}
              >
                <Input placeholder="请输入采集人" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="collectTime"
                label="采集时间"
                rules={[{ required: true, message: '请选择采集时间' }]}
              >
                <DatePicker style={{ width: '100%' }} showTime />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="location" label="采集地点">
                <Input placeholder="请输入采集地点" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="longitude" label="经度">
                <InputNumber style={{ width: '100%' }} placeholder="经度" min={-180} max={180} step={0.000001} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="latitude" label="纬度">
                <InputNumber style={{ width: '100%' }} placeholder="纬度" min={-90} max={90} step={0.000001} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="storageMethod" label="保存方式">
                <Input placeholder="请输入保存方式" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select placeholder="请选择状态">
                  <Select.Option value={1}>正常</Select.Option>
                  <Select.Option value={0}>停用</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tags" label="标签">
                <Select mode="tags" placeholder="输入标签后回车" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={4} placeholder="请输入标本描述" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
        <Card title="标本图片">
          <Form.Item name="images">
            <ImageUploader
              value={images}
              onChange={setImages}
              maxCount={20}
            />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}

export default SpecimenEdit
