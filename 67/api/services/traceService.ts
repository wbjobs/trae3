import { store } from '../db/store.js'
import type { TraceNode, TraceEdge, RootCauseCandidate, TraceResult, Severity, NodeStatus, AnomalyRecord } from '../../shared/types.js'

interface GraphNode {
  id: string
  type: 'service' | 'node' | 'metric'
  name: string
  serviceName: string
  nodeId?: string
}

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 }

const DEPENDENCY_EDGES: [string, string][] = [
  ['api-gateway', 'user-service'],
  ['api-gateway', 'order-service'],
  ['order-service', 'payment-service'],
]

class TraceService {
  private dependencyGraph: { nodes: GraphNode[]; edges: TraceEdge[] } | null = null

  constructor() {
    this.buildDependencyGraph()
  }

  buildDependencyGraph(): { nodes: GraphNode[]; edges: TraceEdge[] } {
    const services = store.getServices()
    const nodes: GraphNode[] = []
    const edges: TraceEdge[] = []

    for (const svc of services) {
      nodes.push({ id: `service:${svc.name}`, type: 'service', name: svc.name, serviceName: svc.name })
      for (const node of svc.nodes) {
        nodes.push({ id: `node:${node.id}`, type: 'node', name: node.id, serviceName: svc.name, nodeId: node.id })
        edges.push({ from: `service:${svc.name}`, to: `node:${node.id}`, type: 'dependency', weight: 1.0 })
      }
    }

    for (const [from, to] of DEPENDENCY_EDGES) {
      edges.push({ from: `service:${from}`, to: `service:${to}`, type: 'dependency', weight: 0.8 })
    }

    this.dependencyGraph = { nodes, edges }
    return this.dependencyGraph
  }

  getPropagationPath(rootNodeId: string, targetNodeId: string): string[] {
    if (!this.dependencyGraph) return []
    const adjacency = new Map<string, string[]>()
    for (const edge of this.dependencyGraph.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
      adjacency.get(edge.from)!.push(edge.to)
    }

    const visited = new Set<string>()
    const queue: [string, string[]][] = [[rootNodeId, [rootNodeId]]]
    while (queue.length > 0) {
      const [current, path] = queue.shift()!
      if (current === targetNodeId) return path
      if (visited.has(current)) continue
      visited.add(current)
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) queue.push([next, [...path, next]])
      }
    }
    return []
  }

  private getDownstream(nodeId: string): { count: number; services: string[] } {
    if (!this.dependencyGraph) return { count: 0, services: [] }
    const adjacency = new Map<string, string[]>()
    for (const edge of this.dependencyGraph.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
      adjacency.get(edge.from)!.push(edge.to)
    }

    const visited = new Set<string>()
    const stack = [nodeId]
    const services: string[] = []
    let count = 0

    while (stack.length > 0) {
      const current = stack.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      if (current !== nodeId) {
        count++
        const node = this.dependencyGraph.nodes.find(n => n.id === current)
        if (node) services.push(node.name)
      }
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) stack.push(next)
      }
    }
    return { count, services }
  }

  private calculateCorrelation(a1: AnomalyRecord, a2: AnomalyRecord): number {
    const diff = Math.abs(new Date(a1.detectedAt).getTime() - new Date(a2.detectedAt).getTime())
    if (diff < 60000) return 0.9
    if (diff < 300000) return 0.7
    if (diff < 3600000) return 0.5
    return 0.2
  }

  private getNodeStatus(anomalies: AnomalyRecord[]): NodeStatus {
    if (anomalies.length === 0) return 'healthy'
    const max = Math.max(...anomalies.map(a => SEVERITY_WEIGHT[a.severity]))
    if (max >= 4) return 'critical'
    if (max >= 2) return 'warning'
    return 'healthy'
  }

  private getRecommendedAction(severity: Severity): string {
    switch (severity) {
      case 'critical': return 'Immediate action required: Investigate and mitigate immediately'
      case 'high': return 'Urgent action: Investigate and mitigate within 1 hour'
      case 'medium': return 'Schedule investigation: Review and plan mitigation within 24h'
      case 'low': return 'Monitor: Continue monitoring and investigate if persists'
      default: return 'Investigate and monitor the situation'
    }
  }

  traceAnomaly(anomalyId: string): TraceResult | null {
    const startTime = Date.now()
    const target = store.getAnomalyById(anomalyId)
    if (!target) return null

    const targetTime = new Date(target.detectedAt).getTime()
    const windowStart = new Date(targetTime - 3600000).toISOString()
    const windowEnd = new Date(targetTime + 3600000).toISOString()

    const related = store.queryAnomalies({ startTime: windowStart, endTime: windowEnd }).anomalies
    const all = [target, ...related.filter(a => a.id !== anomalyId)]

    if (!this.dependencyGraph) this.buildDependencyGraph()
    const graph = this.dependencyGraph!

    const traceNodes: Map<string, TraceNode> = new Map()
    const traceEdges: TraceEdge[] = []

    for (const node of graph.nodes) {
      const nodeAnomalies = all.filter(a => {
        if (node.type === 'service') return a.serviceName === node.serviceName
        if (node.type === 'node') return a.nodeId === node.nodeId
        return false
      })

      const latestValue = node.nodeId ? store.getLatestMetric(
        target.metricType, node.serviceName, node.nodeId
      )?.value : undefined

      traceNodes.set(node.id, {
        id: node.id,
        type: node.type,
        name: node.name,
        status: this.getNodeStatus(nodeAnomalies),
        metricType: target.metricType,
        value: latestValue,
        anomalies: nodeAnomalies.map(a => a.id),
      })
    }

    for (const edge of graph.edges) {
      if (traceNodes.has(edge.from) && traceNodes.has(edge.to)) traceEdges.push(edge)
    }

    const targetNodeId = `service:${target.serviceName}`
    const rootCandidates: RootCauseCandidate[] = []

    for (const anomaly of all) {
      const nodeId = `service:${anomaly.serviceName}`
      const { count: downstreamCount, services } = this.getDownstream(nodeId)
      const correlation = this.calculateCorrelation(anomaly, target)
      const score = SEVERITY_WEIGHT[anomaly.severity] * (1 + downstreamCount) * (1 + correlation)
      const confidence = Math.min(0.95, 0.5 + correlation * 0.45)

      rootCandidates.push({
        nodeId,
        nodeName: anomaly.serviceName,
        score: Math.round(score * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        evidence: [
          `Anomaly detected at ${anomaly.detectedAt} with severity ${anomaly.severity}`,
          `Correlation with target: ${Math.round(correlation * 100)}%`,
          `Downstream services affected: ${downstreamCount}`,
        ],
        impactScope: services,
        recommendedAction: this.getRecommendedAction(anomaly.severity),
      })
    }

    rootCandidates.sort((a, b) => b.score - a.score)
    const rootNodeId = rootCandidates.length > 0 ? rootCandidates[0].nodeId : targetNodeId
    const propagationPath = this.getPropagationPath(rootNodeId, targetNodeId)

    return {
      targetAnomalyId: anomalyId,
      nodes: Array.from(traceNodes.values()),
      edges: traceEdges,
      rootCauses: rootCandidates.slice(0, 5),
      propagationPath,
      analysisTimeMs: Date.now() - startTime,
    }
  }

  getGraph(): { nodes: TraceNode[]; edges: TraceEdge[] } {
    if (!this.dependencyGraph) this.buildDependencyGraph()
    const graph = this.dependencyGraph!
    const nodes: TraceNode[] = graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      name: n.name,
      status: 'healthy' as NodeStatus,
      anomalies: [],
    }))
    return { nodes, edges: graph.edges }
  }
}

export const traceService = new TraceService()
