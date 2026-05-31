import React, { useEffect, useState } from 'react'
import { Descriptions, Card, Image, Tag, Button, Space, Tabs, Empty } from 'antd'
import { EditOutlined, ArrowLeftOutlined, PictureOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Timeline } from '@/components'
import { specimenApi, traceabilityApi, storageApi } from '@/api'
import { Specimen, TraceabilityRecord, SPECIMEN_TYPE_MAP } from '@/types'
import { formatDate } from '@/utils'

const SpecimenDetail: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [specimen, setSpecimen] = useState<Specimen | null>(null)
  const [traceRecords, setTraceRecords] = useState<TraceabilityRecord[]>([])
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})

  useEffect(() => {
    if (id) {
      fetchDetail()
      fetchTraceability()
    }
  }, [id])

  const fetchDetail = async () => {
    try {
      const res = await specimenApi.getById(Number(id))
      const specimenData = res.data
      setSpecimen(specimenData)

      if (specimenData.images && specimenData.images.length > 0) {
        const urlMap: Record<number, string> = {}
        for (const img of specimenData.images) {
          try {
            const previewRes = await storageApi.preview(img.objectName || img.fileUrl || '')
            urlMap[img.id] = previewRes.data
          } catch {
            urlMap[img.id] = img.fileUrl || img.imageUrl || ''
          }
        }
        setImageUrls(urlMap)
      }
    } catch (error) {
      console.error('Failed to fetch specimen detail:', error)
    }
  }

  const fetchTraceability = async () => {
    try {
      const res = await traceabilityApi.getRecords({
        pageNum: 1,
        pageSize: 50,
        specimenId: Number(id)
      })
      setTraceRecords(res.data.list || res.data.records || [])
    } catch (error) {
      console.error('Failed to fetch traceability:', error)
    }
  }

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <Card title="基本信息">
          <Descriptions column={2} bordered>
            <Descriptions.Item label="标本名称">{specimen?.name}</Descriptions.Item>
            <Descriptions.Item label="标本编号">{specimen?.specimenNo}</Descriptions.Item>
            <Descriptions.Item label="标本类型">
              <Tag color="blue">{SPECIMEN_TYPE_MAP[specimen?.type || 0] || '未知'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={specimen?.status === 1 ? 'green' : 'orange'}>
                {specimen?.status === 1 ? '正常' : '停用'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="采集人">{specimen?.collector}</Descriptions.Item>
            <Descriptions.Item label="采集时间">
              {specimen?.collectTime ? formatDate(specimen.collectTime) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="采集地点">{specimen?.location || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {specimen?.createTime ? formatDate(specimen.createTime) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {specimen?.description || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )
    },
    {
      key: 'images',
      label: '标本图片',
      children: (
        <Card title="标本图片">
          {specimen?.images && specimen.images.length > 0 ? (
            <Image.PreviewGroup>
              <Space wrap size={16}>
                {specimen.images.map((img) => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <Image
                      width={200}
                      height={150}
                      src={imageUrls[img.id] || img.fileUrl || img.imageUrl}
                      style={{ objectFit: 'cover', borderRadius: 8 }}
                    />
                    <Button
                      type="primary"
                      size="small"
                      icon={<PictureOutlined />}
                      style={{ position: 'absolute', bottom: 8, right: 8 }}
                      onClick={() => navigate(`/annotation?specimenId=${specimen?.id}&imageId=${img.id}`)}
                    >
                      标注
                    </Button>
                  </div>
                ))}
              </Space>
            </Image.PreviewGroup>
          ) : (
            <Empty description="暂无图片" />
          )}
        </Card>
      )
    },
    {
      key: 'tags',
      label: '标签',
      children: (
        <Card title="标本标签">
          <Space wrap size={[8, 8]}>
            {specimen?.tags?.map((tag, index) => (
              <Tag key={index} color="blue" style={{ padding: '4px 12px', fontSize: 14 }}>
                {tag}
              </Tag>
            ))}
            {(!specimen?.tags || specimen.tags.length === 0) && <span>暂无标签</span>}
          </Space>
        </Card>
      )
    },
    {
      key: 'traceability',
      label: '溯源信息',
      children: (
        <Card title="溯源记录">
          <Timeline records={traceRecords} />
        </Card>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="标本详情"
        showBack
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
              返回
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/specimen/edit/${id}`)}
            >
              编辑
            </Button>
          </Space>
        }
      />
      <Tabs items={tabItems} />
    </div>
  )
}

export default SpecimenDetail
