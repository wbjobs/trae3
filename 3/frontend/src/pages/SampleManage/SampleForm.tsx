import React, { useEffect } from 'react'
import { Modal, Form, Input, Select, DatePicker, InputNumber, message } from 'antd'
import { createSample, updateSample } from '../../api/sample'
import { SampleMetadata } from '../../types'
import dayjs from 'dayjs'
import { useValidation } from '../../hooks/useValidation'

interface SampleFormProps {
  visible: boolean
  sample: SampleMetadata | null
  onCancel: () => void
  onSuccess: () => void
}

const SampleForm: React.FC<SampleFormProps> = ({ visible, sample, onCancel, onSuccess }) => {
  const [form] = Form.useForm()
  const { validateField } = useValidation()

  useEffect(() => {
    if (visible) {
      if (sample) {
        form.setFieldsValue({
          ...sample,
          collectionDate: sample.collectionDate ? dayjs(sample.collectionDate) : null,
        })
      } else {
        form.resetFields()
      }
    }
  }, [visible, sample, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const sampleData = {
        ...(sample?.id ? { id: sample.id } : {}),
        sampleCode: values.sampleCode,
        sampleName: values.sampleName,
        sampleType: values.sampleType,
        department: values.department,
        description: values.description,
        source: values.source,
        storageLocation: values.storageLocation,
        volume: values.volume,
        unit: values.unit,
        collectionDate: values.collectionDate ? values.collectionDate.format('YYYY-MM-DD') : null,
      }

      if (sample?.id) {
        const response: ApiResponse<SampleMetadata> = await updateSample(sampleData)
        if (response.code === 200) {
          message.success('样本更新成功')
          onSuccess()
        } else {
          message.error(response.message || '样本更新失败')
        }
      } else {
        const response: ApiResponse<SampleMetadata> = await createSample(sampleData)
        if (response.code === 200) {
          message.success('样本创建成功')
          onSuccess()
        } else {
          message.error(response.message || '样本创建失败')
        }
      }
    } catch (error: any) {
      console.error('Submit error:', error)
      message.error(error?.message || '操作失败')
    }
  }

  const validateSampleCode = async (_: any, value: string) => {
    if (!value) {
      return Promise.reject('请输入样本编号')
    }
    const error = await validateField('sampleCode', value)
    if (error) {
      return Promise.reject(error)
    }
    return Promise.resolve()
  }

  return (
    <Modal
      title={sample ? '编辑样本' : '新增样本'}
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="sampleCode"
          label="样本编号"
          rules={[{ required: true, validator: validateSampleCode }]}
        >
          <Input placeholder="请输入样本编号" />
        </Form.Item>
        <Form.Item
          name="sampleName"
          label="样本名称"
          rules={[{ required: true, message: '请输入样本名称' }]}
        >
          <Input placeholder="请输入样本名称" />
        </Form.Item>
        <Form.Item name="sampleType" label="样本类型">
          <Select placeholder="请选择样本类型">
            <Select.Option value="BLOOD">血液</Select.Option>
            <Select.Option value="TISSUE">组织</Select.Option>
            <Select.Option value="FLUID">体液</Select.Option>
            <Select.Option value="OTHER">其他</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="source" label="样本来源">
          <Input placeholder="请输入样本来源" />
        </Form.Item>
        <Form.Item name="collectionDate" label="采集日期">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="storageLocation" label="存储位置">
          <Input placeholder="请输入存储位置" />
        </Form.Item>
        <Form.Item name="volume" label="样本容量">
          <InputNumber style={{ width: '100%' }} min={0} placeholder="请输入样本容量" />
        </Form.Item>
        <Form.Item name="unit" label="单位">
          <Select placeholder="请选择单位">
            <Select.Option value="ml">ml</Select.Option>
            <Select.Option value="ul">ul</Select.Option>
            <Select.Option value="g">g</Select.Option>
            <Select.Option value="mg">mg</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="department" label="所属部门">
          <Input placeholder="请输入所属部门" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="请输入描述" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default SampleForm
