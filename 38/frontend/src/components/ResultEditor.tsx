import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  Input,
  Modal,
  Form,
  message,
  Popconfirm,
  Tabs,
  Row,
  Col,
  Statistic,
  Checkbox,
  Drawer,
  List,
  Avatar,
  Badge,
  Progress,
  Tooltip,
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  FilterOutlined,
  CheckOutlined,
  BulbOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  api,
  Entity,
  Relation,
  ExtractionResult,
  AssociationSuggestion,
} from '../services/api'

const { Option } = Select
const { TextArea } = Input
const { TabPane } = Tabs

const ResultEditor: React.FC<{
  refreshKey?: number
}> = ({ refreshKey }) => {
  const [loading, setLoading] = useState(false)
  const [entities, setEntities] = useState<Entity[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [extractions, setExtractions] = useState<ExtractionResult[]>([])
  const [entityModalOpen, setEntityModalOpen] = useState(false)
  const [relationModalOpen, setRelationModalOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [editingRelation, setEditingRelation] = useState<Relation | null>(null)
  const [entityForm] = Form.useForm()
  const [relationForm] = Form.useForm()
  const [entitySearch, setEntitySearch] = useState('')
  const [relationSearch, setRelationSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedEntityRows, setSelectedEntityRows] = useState<Entity[]>([])
  const [selectedRelationRows, setSelectedRelationRows] = useState<Relation[]>([])
  const [batchEditEntityModalOpen, setBatchEditEntityModalOpen] = useState(false)
  const [batchEditRelationModalOpen, setBatchEditRelationModalOpen] = useState(false)
  const [batchEntityForm] = Form.useForm()
  const [batchRelationForm] = Form.useForm()
  const [suggestionsDrawerOpen, setSuggestionsDrawerOpen] = useState(false)
  const [selectedEntityForSuggestions, setSelectedEntityForSuggestions] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AssociationSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [extractionResponse, graphResponse] = await Promise.all([
        api.listExtractions(),
        api.getFullGraph(),
      ])
      setExtractions(extractionResponse.data.extractions || [])
      setEntities(graphResponse.data.nodes || [])
      setRelations(graphResponse.data.edges || [])
    } catch (e: any) {
      message.error('加载数据失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const handleEditEntity = (entity: Entity) => {
    setEditingEntity(entity)
    entityForm.setFieldsValue(entity)
    setEntityModalOpen(true)
  }

  const handleSaveEntity = async () => {
    try {
      const values = await entityForm.validateFields()
      if (editingEntity) {
        await api.updateEntity(editingEntity.id, values)
        message.success('实体更新成功')
      }
      setEntityModalOpen(false)
      loadData()
    } catch (e: any) {
      message.error('保存失败: ' + e.message)
    }
  }

  const handleDeleteEntity = async (entityId: string) => {
    try {
      await api.deleteEntity(entityId)
      message.success('实体删除成功')
      loadData()
    } catch (e: any) {
      message.error('删除失败: ' + e.message)
    }
  }

  const handleEditRelation = (relation: Relation) => {
    setEditingRelation(relation)
    relationForm.setFieldsValue({
      ...relation,
      source: relation.source,
      target: relation.target,
    })
    setRelationModalOpen(true)
  }

  const handleSaveRelation = async () => {
    try {
      const values = await relationForm.validateFields()
      if (editingRelation) {
        await api.updateRelation(editingRelation.id, values)
        message.success('关系更新成功')
      }
      setRelationModalOpen(false)
      loadData()
    } catch (e: any) {
      message.error('保存失败: ' + e.message)
    }
  }

  const handleDeleteRelation = async (relationId: string) => {
    try {
      await api.deleteRelation(relationId)
      message.success('关系删除成功')
      loadData()
    } catch (e: any) {
      message.error('删除失败: ' + e.message)
    }
  }

  const getEntityName = (id: string) => {
    const entity = entities.find((e) => e.id === id)
    return entity ? entity.name : id
  }

  const entityTypes = [...new Set(entities.map((e) => e.type))]

  const filteredEntities = entities.filter(
    (e) =>
      (entitySearch === '' || e.name.toLowerCase().includes(entitySearch.toLowerCase())) &&
      (typeFilter === 'all' || e.type === typeFilter)
  )

  const filteredRelations = relations.filter(
    (r) =>
      relationSearch === '' ||
      r.relation_type.toLowerCase().includes(relationSearch.toLowerCase()) ||
      getEntityName(r.source).toLowerCase().includes(relationSearch.toLowerCase()) ||
      getEntityName(r.target).toLowerCase().includes(relationSearch.toLowerCase())
  )

  const handleBatchEntityEdit = () => {
    if (selectedEntityRows.length === 0) {
      message.warning('请先选择要批量编辑的实体')
      return
    }
    batchEntityForm.resetFields()
    setBatchEditEntityModalOpen(true)
  }

  const handleSaveBatchEntity = async () => {
    try {
      const values = await batchEntityForm.validateFields()
      const updates = selectedEntityRows.map((entity) => ({
        id: entity.id, ...values }))
      const result = await api.batchUpdateEntities(updates)
      message.success(`批量更新完成: ${result.data.success_count}成功, ${result.data.fail_count}失败`)
      setBatchEditEntityModalOpen(false)
      setSelectedEntityRows([])
      loadData()
    } catch (e: any) {
      message.error('批量更新失败: ' + e.message)
    }
  }

  const handleBatchRelationEdit = () => {
    if (selectedRelationRows.length === 0) {
      message.warning('请先选择要批量编辑的关系')
      return
    }
    batchRelationForm.resetFields()
    setBatchEditRelationModalOpen(true)
  }

  const handleSaveBatchRelation = async () => {
    try {
      const values = await batchRelationForm.validateFields()
      const updates = selectedRelationRows.map((relation) => ({
        id: relation.id, ...values }))
      const result = await api.batchUpdateRelations(updates)
      message.success(`批量更新完成: ${result.data.success_count}成功, ${result.data.fail_count}失败`)
      setBatchEditRelationModalOpen(false)
      setSelectedRelationRows([])
      loadData()
    } catch (e: any) {
      message.error('批量更新失败: ' + e.message)
    }
  }

  const handleShowSuggestions = async (entity: Entity) => {
    setSelectedEntityForSuggestions(entity.id)
    setSuggestionsDrawerOpen(true)
    setSuggestionsLoading(true)
    try {
      const result = await api.getEntitySuggestions(entity.id, 15)
      setSuggestions(result.data.suggestions || [])
    } catch (e: any) {
      message.error('加载推荐失败: ' + e.message)
    } finally {
      setSuggestionsLoading(false)
    }
  }

  const handleAddSuggestedRelation = async (suggestion: AssociationSuggestion) => {
    if (!selectedEntityForSuggestions) return
    const relationType = suggestion.suggested_relation || '相关'
    api.addRelation(
      selectedEntityForSuggestions, suggestion.entity_id, relationType, `基于实体关联推荐创建的关系`, 0.7)
      .then(() => {
        message.success('关系添加成功')
        loadData()
      })
      .catch((e) => message.error('添加关系失败: ' + e.message))
  }

  const handleAISuggestions = async () => {
    if (!selectedEntityForSuggestions) return
    setSuggestionsLoading(true)
    try {
      const result = await api.suggestAIRelations(selectedEntityForSuggestions)
      const aiSuggestions = result.data.suggestions || []
      const formatted = aiSuggestions.map((s: any) => ({
        entity_id: s.target_id || s.entity_id,
        entity_name: s.target_name || s.entity_name,
        entity_type: s.target_type || s.entity_type,
        score: s.confidence || 0.8,
        reason: s.reason || 'AI推荐',
        suggested_relation: s.relation_type || s.suggested_relation,
      }))
      setSuggestions(formatted)
    } catch (e: any) {
      message.error('AI推荐失败: ' + e.message)
    } finally {
      setSuggestionsLoading(false)
    }
  }

  const entityColumns: ColumnsType<Entity> = [
    {
      title: '实体名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '实体类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (val) => <Tag color={val >= 0.8 ? 'green' : val >= 0.5 ? 'orange' : 'red'}>
        {(val || 0).toFixed(2)}
      </Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditEntity(record)}
          >
            编辑
          </Button>
          <Tooltip title="关联推荐">
            <Button
              type="link"
              size="small"
              icon={<BulbOutlined />}
              onClick={() => handleShowSuggestions(record)}
            >
              推荐
            </Button>
          </Tooltip>
          <Popconfirm title="确定删除该实体？" onConfirm={() => handleDeleteEntity(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const relationColumns: ColumnsType<Relation> = [
    {
      title: '源实体',
      key: 'source',
      width: 160,
      render: (_, record) => (
        <Tag color="cyan">{getEntityName(record.source)}</Tag>
      ),
    },
    {
      title: '关系类型',
      dataIndex: 'relation_type',
      key: 'relation_type',
      width: 140,
      render: (type) => <Tag color="purple">{type}</Tag>,
    },
    {
      title: '目标实体',
      key: 'target',
      width: 160,
      render: (_, record) => (
        <Tag color="cyan">{getEntityName(record.target)}</Tag>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '置信度',
      key: 'confidence',
      width: 100,
      render: (val) => <Tag color={val >= 0.8 ? 'green' : val >= 0.5 ? 'orange' : 'red'}>
        {(val || 0).toFixed(2)}
      </Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditRelation(record)}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除该关系？" onConfirm={() => handleDeleteRelation(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const stats = {
    totalDocs: extractions.length,
    totalEntities: entities.length,
    totalRelations: relations.length,
    totalTypes: entityTypes.length,
  }

  const onEntitySelectChange = (selectedRowKeys: React.Key[], selectedRows: Entity[]) => {
    setSelectedEntityRows(selectedRows)
  }

  const onRelationSelectChange = (selectedRowKeys: React.Key[], selectedRows: Relation[]) => {
    setSelectedRelationRows(selectedRows)
  }

  return (
    <div>
      <Card
        title="知识编辑"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="文档数" value={stats.totalDocs} prefix={<TeamOutlined />} />
          </Col>
          <Col span={6}>
            <Statistic
              title="实体数" value={stats.totalEntities} prefix={<CheckOutlined />} />
          </Col>
          <Col span={6}>
            <Statistic
              title="关系数" value={stats.totalRelations} prefix={<SwapOutlined />} />
          </Col>
          <Col span={6}>
            <Statistic
              title="实体类型" value={stats.totalTypes} prefix={<FilterOutlined />} />
          </Col>
        </Row>

        <Tabs defaultActiveKey="entities">
          <TabPane tab={`实体管理 (${filteredEntities.length})`} key="entities">
            <Space style={{ marginBottom: 16, width: '100%' }}>
              <Input
                placeholder="搜索实体"
                prefix={<SearchOutlined />}
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                style={{ width: 200 }}
                allowClear
              />
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ width: 140 }}
                placeholder="类型筛选"
                prefix={<FilterOutlined />}
              >
                <Option value="all">全部类型</Option>
                {entityTypes.map((t) => (
                  <Option key={t} value={t}>{t}</Option>
                ))}
              </Select>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleBatchEntityEdit}
                disabled={selectedEntityRows.length === 0}
              >
                批量编辑 ({selectedEntityRows.length})
              </Button>
              {selectedEntityRows.length > 0 && (
                <Tag color="blue">已选择 {selectedEntityRows.length} 项</Tag>
              )}
            </Space>
            <Table
              columns={entityColumns}
              dataSource={filteredEntities}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
              rowSelection={{
                type: 'checkbox',
                onChange: onEntitySelectChange,
                selectedRowKeys: selectedEntityRows.map((e) => e.id),
              }}
            />
          </TabPane>

          <TabPane tab={`关系管理 (${filteredRelations.length})`} key="relations">
            <Space style={{ marginBottom: 16, width: '100%' }}>
              <Input
                placeholder="搜索关系"
                prefix={<SearchOutlined />}
                value={relationSearch}
                onChange={(e) => setRelationSearch(e.target.value)}
                style={{ width: 200 }}
                allowClear
              />
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleBatchRelationEdit}
                disabled={selectedRelationRows.length === 0}
              >
                批量编辑 ({selectedRelationRows.length})
              </Button>
              {selectedRelationRows.length > 0 && (
                <Tag color="blue">已选择 {selectedRelationRows.length} 项</Tag>
              )}
            </Space>
            <Table
              columns={relationColumns}
              dataSource={filteredRelations}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1100 }}
              rowSelection={{
                type: 'checkbox',
                onChange: onRelationSelectChange,
                selectedRowKeys: selectedRelationRows.map((r) => r.id),
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title={editingEntity ? '编辑实体' : '新增实体'}
        open={entityModalOpen}
        onOk={handleSaveEntity}
        onCancel={() => setEntityModalOpen(false)}
        destroyOnClose
      >
        <Form form={entityForm} layout="vertical">
          <Form.Item name="name" label="实体名称" rules={[{ required: true }]}>
            <Input placeholder="请输入实体名称" />
          </Form.Item>
          <Form.Item name="type" label="实体类型" rules={[{ required: true }]}>
            <Select placeholder="请选择或输入类型">
              {entityTypes.map((t) => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingRelation ? '编辑关系' : '新增关系'}
        open={relationModalOpen}
        onOk={handleSaveRelation}
        onCancel={() => setRelationModalOpen(false)}
        destroyOnClose
      >
        <Form form={relationForm} layout="vertical">
          <Form.Item name="source" label="源实体" rules={[{ required: true }]}>
            <Select placeholder="请选择源实体" showSearch optionFilterProp="children">
              {entities.map((e) => (
                <Option key={e.id} value={e.id}>{e.name} ({e.type})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="relation_type" label="关系类型" rules={[{ required: true }]}>
            <Input placeholder="请输入关系类型，如：属于、包含、依赖" />
          </Form.Item>
          <Form.Item name="target" label="目标实体" rules={[{ required: true }]}>
            <Select placeholder="请选择目标实体" showSearch optionFilterProp="children">
              {entities.map((e) => (
                <Option key={e.id} value={e.id}>{e.name} ({e.type})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批量编辑实体 (${selectedEntityRows.length} 项)`}
        open={batchEditEntityModalOpen}
        onOk={handleSaveBatchEntity}
        onCancel={() => setBatchEditEntityModalOpen(false)}
        destroyOnClose
        width={500}
      >
        <p style={{ marginBottom: 16 }}>
          以下字段将批量应用到所有选中的实体，留空表示不修改。
        </p>
        <Form form={batchEntityForm} layout="vertical">
          <Form.Item name="type" label="实体类型">
            <Select placeholder="请选择或输入类型" allowClear>
              {entityTypes.map((t) => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="confidence" label="置信度">
            <Input type="number" min={0} max={1} step={0.1} placeholder="0.0 - 1.0" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批量编辑关系 (${selectedRelationRows.length} 项)`}
        open={batchEditRelationModalOpen}
        onOk={handleSaveBatchRelation}
        onCancel={() => setBatchEditRelationModalOpen(false)}
        destroyOnClose
        width={500}
      >
        <p style={{ marginBottom: 16 }}>
          以下字段将批量应用到所有选中的关系，留空表示不修改。
        </p>
        <Form form={batchRelationForm} layout="vertical">
          <Form.Item name="relation_type" label="关系类型">
            <Input placeholder="请输入关系类型，如：属于、包含、依赖" />
          </Form.Item>
          <Form.Item name="confidence" label="置信度">
            <Input type="number" min={0} max={1} step={0.1} placeholder="0.0 - 1.0" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="实体关联推荐"
        placement="right"
        width={400}
        onClose={() => setSuggestionsDrawerOpen(false)}
        open={suggestionsDrawerOpen}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={handleAISuggestions}>
              AI 智能推荐
            </Button>
          </Space>
        }
      >
        <p style={{ color: '#666' }}>
          基于图谱分析，为您推荐与当前实体可能存在关联的其他实体：
        </p>
        <List
          loading={suggestionsLoading}
          dataSource={suggestions}
          locale={{ emptyText: '暂无推荐' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleAddSuggestedRelation(item)}
                >
                  添加关系
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Badge
                    count={`${Math.round(item.score * 100)}%`}
                    style={{ backgroundColor: item.score >= 0.7 ? '#52c41a' : '#faad14' }}
                  />
                }
                title={
                  <Space>
                    <strong>{item.entity_name}</strong>
                    <Tag color="blue">{item.entity_type}</Tag>
                  </Space>
                }
                description={
                  <div>
                    <div>推荐关系：{item.suggested_relation || '相关'}</div>
                    <div style={{ color: '#999', fontSize: 12 }}>{item.reason}</div>
                    <Progress
                      percent={Math.round(item.score * 100)}
                      size="small"
                      style={{ marginTop: 4 }}
                    />
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  )
}

export default ResultEditor
