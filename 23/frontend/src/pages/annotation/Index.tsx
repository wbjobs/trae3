import React, { useEffect, useState } from 'react'
import { Select, Card, Space, message, Spin } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, CanvasAnnotator } from '@/components'
import { annotationApi, specimenApi } from '@/api'
import { SpecimenImage } from '@/types'
import { useAppDispatch, useAppSelector } from '@/store'
import { setCurrentImage, setAnnotations } from '@/store/specimen'

const AnnotationPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const specimenIdParam = searchParams.get('specimenId')
  const imageIdParam = searchParams.get('imageId')

  const dispatch = useAppDispatch()
  const { currentImage } = useAppSelector((state) => state.specimen)

  const [specimenImages, setSpecimenImages] = useState<SpecimenImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [specimenId, setSpecimenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (specimenIdParam) {
      const sid = Number(specimenIdParam)
      setSpecimenId(sid)
      fetchImages(sid)
    }
    if (imageIdParam) {
      setSelectedImageId(Number(imageIdParam))
      fetchAnnotations(Number(imageIdParam))
    }
  }, [specimenIdParam, imageIdParam])

  const fetchImages = async (sid: number) => {
    setLoading(true)
    try {
      const res = await specimenApi.getById(sid)
      if (res.data?.images) {
        setSpecimenImages(res.data.images)
        if (!imageIdParam && res.data.images.length > 0) {
          const firstImage = res.data.images[0]
          setSelectedImageId(firstImage.id)
          dispatch(setCurrentImage(firstImage))
          fetchAnnotations(firstImage.id)
        } else if (imageIdParam) {
          const img = res.data.images.find((i: SpecimenImage) => i.id === Number(imageIdParam))
          if (img) {
            dispatch(setCurrentImage(img))
          }
        }
      }
    } catch (error) {
      message.error('获取图片列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchAnnotations = async (imgId: number) => {
    try {
      const res = await annotationApi.listByImageId(imgId)
      dispatch(setAnnotations(res.data || []))
    } catch (error) {
      message.error('获取标注数据失败')
    }
  }

  const handleImageChange = (value: number) => {
    setSelectedImageId(value)
    const image = specimenImages.find((img) => img.id === value)
    if (image) {
      dispatch(setCurrentImage(image))
      fetchAnnotations(value)
    }
  }

  if (!specimenId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#999' }}>
        请从标本详情页进入标注页面
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="影像标注"
        subtitle="对标本图片进行标注"
        extra={
          <Space>
            <Select
              style={{ width: 250 }}
              placeholder="选择图片"
              value={selectedImageId}
              onChange={handleImageChange}
              options={specimenImages.map((img) => ({
                label: img.description || `图片 ${img.sort || img.id}`,
                value: img.id
              }))}
            />
          </Space>
        }
      />
      <Card
        styles={{ body: { padding: 0, height: 'calc(100vh - 280px)' } }}
        bordered={false}
      >
        <Spin spinning={loading}>
          {selectedImageId && currentImage && specimenId ? (
            <CanvasAnnotator
              imageUrl={currentImage.previewUrl || currentImage.imageUrl}
              specimenId={specimenId}
              imageId={selectedImageId}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
              请选择要标注的图片
            </div>
          )}
        </Spin>
      </Card>
    </div>
  )
}

export default AnnotationPage
