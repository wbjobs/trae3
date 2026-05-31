import { Router, type Request, type Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../database.js'
import type { PlannedPath, PlannedWaypoint, PathPlanningParams } from '../../shared/types.js'

const router = Router()

interface NodeRow {
  id: string
  name: string
  area_id: string
  pos_x: number
  pos_y: number
  pos_z: number
}

interface PipeRow {
  id: string
  endpoint_a_id: string
  endpoint_b_id: string
  length: number
  area_id: string
}

function buildAdjacency(pipes: PipeRow[]): Map<string, { to: string; pipeId: string; distance: number }[]> {
  const adj = new Map<string, { to: string; pipeId: string; distance: number }[]>()
  for (const pipe of pipes) {
    if (!adj.has(pipe.endpoint_a_id)) adj.set(pipe.endpoint_a_id, [])
    if (!adj.has(pipe.endpoint_b_id)) adj.set(pipe.endpoint_b_id, [])
    adj.get(pipe.endpoint_a_id)!.push({ to: pipe.endpoint_b_id, pipeId: pipe.id, distance: pipe.length })
    adj.get(pipe.endpoint_b_id)!.push({ to: pipe.endpoint_a_id, pipeId: pipe.id, distance: pipe.length })
  }
  return adj
}

function bfsShortestPath(
  adj: Map<string, { to: string; pipeId: string; distance: number }[]>,
  start: string,
  end: string
): { path: string[]; distance: number } | null {
  const visited = new Set<string>()
  const queue: { node: string; path: string[]; distance: number }[] = [{ node: start, path: [start], distance: 0 }]
  visited.add(start)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.node === end) {
      return { path: current.path, distance: current.distance }
    }
    const neighbors = adj.get(current.node) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        visited.add(neighbor.to)
        queue.push({
          node: neighbor.to,
          path: [...current.path, neighbor.to],
          distance: current.distance + neighbor.distance,
        })
      }
    }
  }
  return null
}

router.post('/plan', (req: Request, res: Response): void => {
  const db = getDb()
  const params = req.body as PathPlanningParams

  const allNodes = db.prepare('SELECT id, name, area_id, pos_x, pos_y, pos_z FROM pipe_node').all() as NodeRow[]
  const allPipes = db.prepare('SELECT id, endpoint_a_id, endpoint_b_id, length, area_id FROM pipe_segment').all() as PipeRow[]
  const nodeMap = new Map(allNodes.map(n => [n.id, n]))
  const adj = buildAdjacency(allPipes)

  let waypointNodeIds: string[] = []
  let totalDistance = 0

  if (params.areaId) {
    const areaNodes = allNodes.filter(n => n.area_id === params.areaId)
    if (areaNodes.length === 0) {
      res.status(404).json({ success: false, error: '该区域未找到节点' })
      return
    }
    waypointNodeIds = areaNodes.map(n => n.id)
    for (let i = 0; i < waypointNodeIds.length - 1; i++) {
      const result = bfsShortestPath(adj, waypointNodeIds[i], waypointNodeIds[i + 1])
      if (result) {
        totalDistance += result.distance
        const intermediate = result.path.slice(1, -1)
        waypointNodeIds.splice(i + 1, 0, ...intermediate)
      }
    }
    const areaPipeCount = allPipes.filter(p => p.area_id === params.areaId).length
    totalDistance = Math.max(totalDistance, areaPipeCount * 50)
  } else if (params.startNodeId && params.endNodeId) {
    const result = bfsShortestPath(adj, params.startNodeId, params.endNodeId)
    if (!result) {
      res.status(400).json({ success: false, error: '无法找到两个节点之间的路径' })
      return
    }
    waypointNodeIds = result.path
    totalDistance = result.distance
  } else if (params.nodeIds && params.nodeIds.length > 0) {
    waypointNodeIds = [...params.nodeIds]
    for (let i = 0; i < waypointNodeIds.length - 1; i++) {
      const result = bfsShortestPath(adj, waypointNodeIds[i], waypointNodeIds[i + 1])
      if (result) {
        totalDistance += result.distance
        const intermediate = result.path.slice(1, -1)
        waypointNodeIds.splice(i + 1, 0, ...intermediate)
      } else {
        const a = nodeMap.get(waypointNodeIds[i])
        const b = nodeMap.get(waypointNodeIds[i + 1])
        if (a && b) {
          totalDistance += Math.sqrt(
            Math.pow(b.pos_x - a.pos_x, 2) +
            Math.pow(b.pos_y - a.pos_y, 2) +
            Math.pow(b.pos_z - a.pos_z, 2)
          )
        }
      }
    }
  } else {
    res.status(400).json({ success: false, error: '请提供 nodeIds、areaId 或 startNodeId+endNodeId' })
    return
  }

  const waypoints: PlannedWaypoint[] = waypointNodeIds.map((nodeId, index) => {
    const node = nodeMap.get(nodeId)
    return {
      id: uuid(),
      nodeId,
      position: node
        ? { x: node.pos_x, y: node.pos_y, z: node.pos_z }
        : { x: 0, y: 0, z: 0 },
      order: index,
      stayDuration: 30,
    }
  })

  const stayTime = waypoints.length * 30
  const estimatedDuration = Math.round(totalDistance / 1.5 + stayTime)

  const pipeCount = new Set(
    allPipes.filter(p =>
      waypointNodeIds.includes(p.endpoint_a_id) && waypointNodeIds.includes(p.endpoint_b_id)
    ).map(p => p.id)
  ).size

  const path: PlannedPath = {
    id: uuid(),
    name: '',
    waypoints,
    totalDistance: Math.round(totalDistance),
    estimatedDuration,
    pipeCount,
    createdAt: Date.now(),
  }

  res.json({ success: true, data: path })
})

export default router
