import React, { useState } from 'react'
import { Card, Descriptions, Tag, Table, Button, Modal, Form, Input, message } from 'antd'
import {
  EditOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import type { RecognitionResponse, ExtractedInfo, OCRLine } from '../types'
import { FieldLabels } from '../types'
import { recordsApi, ocrApi } from '../services/api'

interface ResultDisplayProps {
  result: RecognitionResponse | null
  imageUrl: string
  onUpdate?: () => void
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ result, imageUrl, onUpdate }) => {
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ExtractedInfo | null>(null)
  const [form] = Form.useForm()

  if (!result) return null

  const { ocr_result, extracted_info, record_id } = result

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success'
    if (confidence >= 0.7) return 'warning'
    return 'error'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    if (confidence >= 0.7) return <WarningOutlined style={{ color: '#faad14' }} />
    return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
  }

  const ocrColumns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1
    },
    {
      title: '识别文本',
      dataIndex: 'text',
      key: 'text'
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 120,
      render: (confidence: number) => (
        <span>
          {getConfidenceIcon(confidence)}
          <Tag color={getConfidenceColor(confidence)} style={{ marginLeft: 8 }}>
            {(confidence * 100).toFixed(1)}%
          </Tag>
        </span>
      )
    }
  ]

  const handleEdit = () => {
    setEditingRecord(extracted_info)
    form.setFieldsValue(extracted_info)
    setEditModalVisible(true)
  }

  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields()
      await recordsApi.update(record_id, values)
      message.success('更新成功')
      setEditModalVisible(false)
      if (onUpdate) onUpdate()
    } catch (error) {
      message.error('更新失败')
    }
  }

  const handleReRecognize = async () => {
    try {
      const response = await ocrApi.reRecognize(record_id)
      message.success('重新识别成功')
      if (onUpdate) onUpdate()
    } catch (error: any) {
      message.error(error.response?.data?.detail || '重新识别失败')
    }
  }

  const extractedItems = Object.entries(FieldLabels).map(([key, label]) => ({
    key,
    label,
    children: extracted_info[key as keyof ExtractedInfo] || '未识别',
    span: 1
  }))

  return (
    <div>
      <Card
        title="识别结果"
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ReloadOutlined />} onClick={handleReRecognize}>
              重新识别
            </Button>
            <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
              编辑信息
            </Button>
          </div>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <h4 style={{ marginBottom: 12 }}>原始图片</h4>
            <img src={imageUrl} alt="原始图片" className="image-preview" />
          </div>
          <div style={{ flex: 2, minWidth: 400 }}>
            <Descriptions
              title="提取信息"
              bordered
              column={1}
              size="small"
              items={extractedItems}
            />
            <div style={{ marginTop: 16 }}>
              <Tag color="blue">
                平均置信度: {(ocr_result.average_confidence * 100).toFixed(1)}%
              </Tag>
              <Tag color="green">记录ID: {record_id}</Tag>
            </div>
          </div>
        </div>
      </Card>

      <Card title="OCR识别详情" size="small">
        <Table
          dataSource={ocr_result.lines as (OCRLine & { key?: string })[]}
          columns={ocrColumns}
          rowKey={(_, index) => String(index)}
          pagination={false}
          size="small"
          scroll={{ y: 300 }}
        />
      </Card>

      <Modal
        title="编辑铭牌信息"
        open={editModalVisible}
        onOk={handleEditSubmit}
        onCancel={() => setEditModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          {Object.entries(FieldLabels).map(([key, label]) => (
            <Form.Item key={key} name={key} label={label}>
              <Input placeholder={`请输入${label}`} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  )
}

export default ResultDisplay
