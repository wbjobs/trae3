import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Card, Select, Spin, Empty, Tag, Row, Col, Statistic, Space } from 'antd'
import * as d3 from 'd3'
import { api, GraphData, Entity, Relation } from '../services/api'

const { Option } = Select

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string
  name: string
  type: string
  description?: string
  confidence?: number
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  id: string
  source: string | NodeDatum
  target: string | NodeDatum
  relation_type: string
  description?: string
  confidence?: number
}

const TYPE_COLORS: Record<string, string> = {
  组织: '#1677ff',
  人物: '#52c41a',
  技术: '#faad14',
  产品: '#722ed1',
  概念: '#eb2f96',
  地点: '#13c2c2',
  事件: '#f5222d',
  机构: '#2f54eb',
  项目: '#a0d911',
  政策: '#fa8c16',
  疾病: '#ff4d4f',
  药物: '#73d13d',
  企业: '#4096ff',
  金融: '#13c2c2',
  法律: '#722ed1',
  默认: '#8c8c8c',
}

const GraphPreview: React.FC<{
  docId?: string
  refreshKey?: number
}> = ({ docId, refreshKey }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [loading, setLoading] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<Entity | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    if (!containerRef.current) return
    const updateSize = () => {
      const rect = containerRef.current!.getBoundingClientRect()
      setDimensions({ width: rect.width, height: Math.max(rect.height, 500) })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const loadGraph = useCallback(async () => {
    setLoading(true)
    try {
      const response = docId ? await api.getDocGraph(docId) : await api.getFullGraph()
      setGraphData(response.data)
    } catch (e: any) {
      console.error('Failed to load graph:', e)
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    loadGraph()
  }, [loadGraph, refreshKey])

  useEffect(() => {
    if (!graphData || !svgRef.current || graphData.nodes.length === 0) return

    const { width, height } = dimensions
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#999')

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', (event) => {
      g.attr('transform', event.transform)
    })
    svg.call(zoom)

    let nodes: NodeDatum[] = graphData.nodes.map((n) => ({ ...n }))
    let links: LinkDatum[] = graphData.edges.map((r) => ({
      ...r,
      source: r.source,
      target: r.target,
    }))

    if (filterType !== 'all') {
      const filteredNodeIds = new Set(nodes.filter((n) => n.type === filterType).map((n) => n.id))
      nodes = nodes.filter((n) => n.type === filterType)
      links = links.filter(
        (l) =>
          filteredNodeIds.has(typeof l.source === 'string' ? l.source : l.source.id) &&
          filteredNodeIds.has(typeof l.target === 'string' ? l.target : l.target.id)
      )
    }

    const simulation = d3
      .forceSimulation<NodeDatum>(nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))

    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#aaa')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)')

    const linkLabel = g
      .append('g')
      .selectAll('text')
      .data(links)
      .enter()
      .append('text')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text((d) => d.relation_type)

    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, NodeDatum>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )
      .on('click', (event, d) => {
        setSelectedNode(d as unknown as Entity)
      })

    node
      .append('circle')
      .attr('r', 22)
      .attr('fill', (d) => TYPE_COLORS[d.type] || TYPE_COLORS.默认)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))')

    node
      .append('text')
      .attr('font-size', '11px')
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('pointer-events', 'none')
      .text((d) => (d.name.length > 6 ? d.name.slice(0, 6) + '...' : d.name))

    node
      .append('title')
      .text((d) => `${d.name}\n类型: ${d.type}\n${d.description || ''}`)

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as NodeDatum).x!)
        .attr('y1', (d) => (d.source as NodeDatum).y!)
        .attr('x2', (d) => (d.target as NodeDatum).x!)
        .attr('y2', (d) => (d.target as NodeDatum).y!)

      linkLabel
        .attr('x', (d) => ((d.source as NodeDatum).x! + (d.target as NodeDatum).x!) / 2)
        .attr('y', (d) => ((d.source as NodeDatum).y! + (d.target as NodeDatum).y!) / 2 - 5)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })
  }, [graphData, dimensions, filterType])

  const entityTypes = graphData
    ? [...new Set(graphData.nodes.map((n) => n.type))]
    : []

  const stats = {
    nodes: graphData?.nodes.length || 0,
    edges: graphData?.edges.length || 0,
    types: entityTypes.length,
  }

  return (
    <Card
      title={
        <Space>
          <span>图谱预览</span>
          {entityTypes.length > 0 && (
            <Select
              value={filterType}
              onChange={setFilterType}
              style={{ width: 140 }}
              size="small"
            >
              <Option value="all">全部类型</Option>
              {entityTypes.map((t) => (
                <Option key={t} value={t}>
                  {t}
                </Option>
              ))}
            </Select>
          )}
        </Space>
      }
      size="small"
      style={{ height: '100%' }}
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Statistic title="实体数" value={stats.nodes} />
        </Col>
        <Col span={8}>
          <Statistic title="关系数" value={stats.edges} />
        </Col>
        <Col span={8}>
          <Statistic title="实体类型" value={stats.types} />
        </Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : !graphData || graphData.nodes.length === 0 ? (
        <Empty description="暂无图谱数据，请先上传文档并抽取知识" />
      ) : (
        <>
          <div ref={containerRef} style={{ width: '100%', minHeight: 500 }}>
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)', borderRadius: 8 }}
            />
          </div>

          {selectedNode && (
            <Card
              size="small"
              title={
                <Space>
                  <Tag color={TYPE_COLORS[selectedNode.type] || TYPE_COLORS.默认}>
                    {selectedNode.type}
                  </Tag>
                  <span>{selectedNode.name}</span>
                </Space>
              }
              style={{ marginTop: 16 }}
              extra={<a onClick={() => setSelectedNode(null)}>关闭</a>}
            >
              <p><strong>ID:</strong> {selectedNode.id}</p>
              <p><strong>置信度:</strong> {(selectedNode.confidence || 0).toFixed(2)}</p>
              <p><strong>描述:</strong> {selectedNode.description || '无'}</p>
            </Card>
          )}

          <div style={{ marginTop: 16 }}>
            <Space wrap>
              {entityTypes.map((t) => (
                <Tag key={t} color={TYPE_COLORS[t] || TYPE_COLORS.默认}>
                  {t}
                </Tag>
              ))}
            </Space>
          </div>
        </>
      )}
    </Card>
  )
}

export default GraphPreview
