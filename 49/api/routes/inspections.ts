import { Router, type Request, type Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../database.js'
import type { InspectionPath, InspectionWaypoint } from '../../shared/types.js'

const router = Router()

function buildPath(row: Record<string, unknown>, waypoints: InspectionWaypoint[]): InspectionPath {
  return {
    id: row.id as string,
    name: row.name as string,
    waypoints,
    createdBy: row.created_by as string,
  }
}

function rowToWaypoint(row: Record<string, unknown>): InspectionWaypoint {
  return {
    id: row.id as string,
    pipeId: row.pipe_id as string,
    position: {
      x: row.pos_x as number,
      y: row.pos_y as number,
      z: row.pos_z as number,
    },
    stayDuration: row.stay_duration as number,
  }
}

router.get('/', (_req: Request, res: Response): void => {
  const db = getDb()
  const paths = db.prepare('SELECT * FROM inspection_path').all() as Record<string, unknown>[]

  const result: InspectionPath[] = paths.map((p) => {
    const wps = db.prepare('SELECT * FROM inspection_waypoint WHERE path_id = ? ORDER BY sort_order').all(p.id) as Record<string, unknown>[]
    return buildPath(p, wps.map(rowToWaypoint))
  })

  res.json({ success: true, data: result })
})

router.post('/', (req: Request, res: Response): void => {
  const db = getDb()
  const body = req.body as Omit<InspectionPath, 'id'>
  const pathId = uuid()

  const insertPath = db.prepare('INSERT INTO inspection_path (id, name, created_by) VALUES (?, ?, ?)')
  const insertWaypoint = db.prepare(
    'INSERT INTO inspection_waypoint (id, path_id, pipe_id, pos_x, pos_y, pos_z, stay_duration, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    insertPath.run(pathId, body.name, body.createdBy)
    for (let i = 0; i < body.waypoints.length; i++) {
      const wp = body.waypoints[i]
      insertWaypoint.run(uuid(), pathId, wp.pipeId, wp.position.x, wp.position.y, wp.position.z, wp.stayDuration, i)
    }
  })

  transaction()

  const newPath = db.prepare('SELECT * FROM inspection_path WHERE id = ?').get(pathId) as Record<string, unknown>
  const wps = db.prepare('SELECT * FROM inspection_waypoint WHERE path_id = ? ORDER BY sort_order').all(pathId) as Record<string, unknown>[]
  res.status(201).json({ success: true, data: buildPath(newPath, wps.map(rowToWaypoint)) })
})

interface NodePosition {
  id: string
  x: number
  y: number
  z: number
}

interface GraphEdge {
  from: string
  to: string
  distance: number
  pipeId: string
}

router.post('/plan', (req: Request, res: Response): void => {
  const db = getDb()
  const body = req.body as { startNodeId: string; waypoints: string[]; endNodeId?: string }

  if (!body.startNodeId || !body.waypoints || body.waypoints.length === 0) {
    res.status(400).json({ success: false, error: 'startNodeId and non-empty waypoints are required' })
    return
  }

  const allNodeIds = [body.startNodeId, ...body.waypoints]
  if (body.endNodeId) {
    allNodeIds.push(body.endNodeId)
  }

  const placeholders = allNodeIds.map(() => '?').join(',')
  const nodes = db.prepare(
    `SELECT id, pos_x as x, pos_y as y, pos_z as z FROM pipe_node WHERE id IN (${placeholders})`
  ).all(...allNodeIds) as NodePosition[]

  if (nodes.length !== allNodeIds.length) {
    const foundIds = new Set(nodes.map(n => n.id))
    const missing = allNodeIds.filter(id => !foundIds.has(id))
    res.status(404).json({ success: false, error: `Nodes not found: ${missing.join(', ')}` })
    return
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const allPipes = db.prepare(
    `SELECT id, endpoint_a_id, endpoint_b_id, length FROM pipe_segment`
  ).all() as { id: string; endpoint_a_id: string; endpoint_b_id: string; length: number }[]

  const adjacencyMap = new Map<string, { to: string; distance: number; pipeId: string }[]>()
  for (const pipe of allPipes) {
    if (!adjacencyMap.has(pipe.endpoint_a_id)) {
      adjacencyMap.set(pipe.endpoint_a_id, [])
    }
    if (!adjacencyMap.has(pipe.endpoint_b_id)) {
      adjacencyMap.set(pipe.endpoint_b_id, [])
    }
    adjacencyMap.get(pipe.endpoint_a_id)!.push({
      to: pipe.endpoint_b_id,
      distance: pipe.length,
      pipeId: pipe.id,
    })
    adjacencyMap.get(pipe.endpoint_b_id)!.push({
      to: pipe.endpoint_a_id,
      distance: pipe.length,
      pipeId: pipe.id,
    })
  }

  function dijkstra(start: string, end: string): { distance: number; path: string[]; pipeIds: string[] } | null {
    const distances = new Map<string, number>()
    const previous = new Map<string, { node: string; pipeId: string }>()
    const visited = new Set<string>()

    for (const node of allPipes) {
      distances.set(node.endpoint_a_id, Infinity)
      distances.set(node.endpoint_b_id, Infinity)
    }
    distances.set(start, 0)

    while (true) {
      let minDist = Infinity
      let minNode: string | null = null
      for (const [node, dist] of distances) {
        if (!visited.has(node) && dist < minDist) {
          minDist = dist
          minNode = node
        }
      }

      if (minNode === null || minNode === end) break
      visited.add(minNode)

      const neighbors = adjacencyMap.get(minNode) || []
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.to)) continue
        const newDist = minDist + neighbor.distance
        if (newDist < (distances.get(neighbor.to) || Infinity)) {
          distances.set(neighbor.to, newDist)
          previous.set(neighbor.to, { node: minNode, pipeId: neighbor.pipeId })
        }
      }
    }

    if ((distances.get(end) || Infinity) === Infinity) return null

    const path: string[] = []
    const pipeIds: string[] = []
    let current: string | null = end
    while (current !== null && current !== start) {
      path.unshift(current)
      const prev = previous.get(current)
      if (prev) {
        pipeIds.unshift(prev.pipeId)
        current = prev.node
      } else {
        break
      }
    }
    path.unshift(start)

    return {
      distance: distances.get(end) || 0,
      path,
      pipeIds,
    }
  }

  const waypointSet = new Set(body.waypoints)
  const unvisited = new Set(body.waypoints)
  const orderedWaypoints: string[] = []
  let currentNode = body.startNodeId
  let totalDistance = 0
  const pathSegments: { from: string; to: string; distance: number; pipeIds: string[] }[] = []

  while (unvisited.size > 0) {
    let nearest: string | null = null
    let nearestDist = Infinity
    let nearestPath: { distance: number; path: string[]; pipeIds: string[] } | null = null

    for (const wp of unvisited) {
      const result = dijkstra(currentNode, wp)
      if (result && result.distance < nearestDist) {
        nearestDist = result.distance
        nearest = wp
        nearestPath = result
      }
    }

    if (nearest === null || nearestPath === null) {
      res.status(400).json({ success: false, error: `Cannot find path from ${currentNode} to any remaining waypoint` })
      return
    }

    orderedWaypoints.push(nearest)
    totalDistance += nearestDist
    pathSegments.push({
      from: currentNode,
      to: nearest,
      distance: nearestDist,
      pipeIds: nearestPath.pipeIds,
    })
    unvisited.delete(nearest)
    currentNode = nearest
  }

  if (body.endNodeId && body.endNodeId !== currentNode) {
    const finalPath = dijkstra(currentNode, body.endNodeId)
    if (!finalPath) {
      res.status(400).json({ success: false, error: `Cannot find path from ${currentNode} to end node ${body.endNodeId}` })
      return
    }
    totalDistance += finalPath.distance
    pathSegments.push({
      from: currentNode,
      to: body.endNodeId,
      distance: finalPath.distance,
      pipeIds: finalPath.pipeIds,
    })
  }

  const walkingSpeed = 1.5
  const stayDurationPerWaypoint = 3
  const estimatedDuration = totalDistance / walkingSpeed + orderedWaypoints.length * stayDurationPerWaypoint

  res.json({
    success: true,
    data: {
      startNodeId: body.startNodeId,
      endNodeId: body.endNodeId || orderedWaypoints[orderedWaypoints.length - 1],
      orderedWaypoints,
      totalDistance: Math.round(totalDistance),
      estimatedDuration: Math.round(estimatedDuration * 60),
      pathSegments,
    },
  })
})

export default router
