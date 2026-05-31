import React, { useState } from 'react'
import { Card, Select, Space, Button, message, Input, QRCode, Empty } from 'antd'
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import { PageHeader, Timeline } from '@/components'
import { traceabilityApi } from '@/api'
import { TraceabilityChain, QrCode } from '@/types'

const TraceabilityChainPage: React.FC = () => {
  const [specimenId, setSpecimenId] = useState<number | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [chainData, setChainData] = useState<TraceabilityChain | null>(null)
  const [qrCode, setQrCode] = useState<QrCode | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchChain = async (id: number) => {
    setLoading(true)
    try {
      const res = await traceabilityApi.getChain(id)
      setChainData(res.data)
      fetchQrCode(id)
    } catch (error) {
      message.error('获取溯源链失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchQrCode = async (id: number) => {
    try {
      const res = await traceabilityApi.getQrCodeBySpecimenId(id)
      setQrCode(res.data)
    } catch (error) {
      console.error('Failed to fetch QR code:', error)
    }
  }

  const handleSearch = () => {
    if (searchKeyword) {
    }
  }

  const handleGenerateQrCode = async () => {
    if (!specimenId) return
    try {
      const res = await traceabilityApi.generateQrCode(specimenId)
      setQrCode(res.data)
      message.success('二维码生成成功')
    } catch (error) {
      message.error('二维码生成失败')
    }
  }

  const handleDownloadQrCode = () => {
    if (qrCode?.qrCodeUrl) {
      const link = document.createElement('a')
      link.href = qrCode.qrCodeUrl
      link.download = `qrcode-${specimenId}.png`
      link.click()
    }
  }

  return (
    <div>
      <PageHeader
        title="溯源链"
        subtitle="查看标本完整溯源信息"
        extra={
          <Space>
            <Select
              style={{ width: 250 }}
              placeholder="选择标本"
              value={specimenId}
              onChange={(value) => {
                setSpecimenId(value)
                fetchChain(value)
              }}
              showSearch
              optionFilterProp="children"
            />
            <Input.Search
              placeholder="搜索标本"
              style={{ width: 250 }}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
            />
          </Space>
        }
      />
      {chainData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
          <Card
            title={`${chainData.specimenName} - 溯源链`}
            loading={loading}
          >
            <Timeline records={chainData.records || []} />
          </Card>
          <Card title="溯源二维码" extra={
            <Space>
              <Button size="small" onClick={handleGenerateQrCode}>
                重新生成
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleDownloadQrCode}
                disabled={!qrCode}
              >
                下载
              </Button>
            </Space>
          }>
            {qrCode ? (
              <div style={{ textAlign: 'center' }}>
                <QRCode
                  value={qrCode.qrCodeData || qrCode.qrCodeContent || window.location.href}
                  size={240}
                  style={{ marginBottom: 16 }}
                />
                <p style={{ color: '#666', margin: 0 }}>扫描二维码查看溯源信息</p>
              </div>
            ) : (
              <Empty description="暂无二维码" />
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <Empty description="请选择标本查看溯源链" />
        </Card>
      )}
    </div>
  )
}

export default TraceabilityChainPage
