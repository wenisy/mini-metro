import type { PassengerRoute, RouteStep } from './types.js'
import { state } from './game-state.js'

// 路径规划配置
export const PATH_PLANNING_CONFIG = {
  transferCost: 2,        // 换乘成本（等价于2个站点的距离）
  transferTime: 1.5,      // 换乘时间倍数
  maxTransfers: 3,        // 最大换乘次数
  cacheSize: 1000,        // 路径缓存大小
  cacheTimeout: 30000     // 缓存超时时间（毫秒）
}

// 路径缓存
interface CachedRoute {
  route: PassengerRoute
  timestamp: number
}

const routeCache = new Map<string, CachedRoute>()

// 生成缓存键
function getCacheKey(fromId: number, toId: number): string {
  return `${fromId}-${toId}`
}

// 清理过期缓存
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, cached] of routeCache.entries()) {
    if (now - cached.timestamp > PATH_PLANNING_CONFIG.cacheTimeout) {
      routeCache.delete(key)
    }
  }
}

// 获取站点的所有连接线路
function getStationLines(stationId: number): number[] {
  return state.lines
    .filter(line => line.stations.includes(stationId))
    .map(line => line.id)
}

// 获取线路上两个站点之间的距离
function getDistanceOnLine(lineId: number, fromStationId: number, toStationId: number): number {
  const line = state.lines.find(l => l.id === lineId)
  if (!line) return Infinity

  const fromIndex = line.stations.indexOf(fromStationId)
  const toIndex = line.stations.indexOf(toStationId)

  if (fromIndex === -1 || toIndex === -1) return Infinity

  return Math.abs(toIndex - fromIndex)
}

// 检查两个站点是否在同一线路上
function areStationsOnSameLine(stationId1: number, stationId2: number): number | null {
  for (const line of state.lines) {
    if (line.stations.includes(stationId1) && line.stations.includes(stationId2)) {
      return line.id
    }
  }
  return null
}

// 获取两个线路的换乘站点（暂未使用，保留供将来扩展）
// function getTransferStations(lineId1: number, lineId2: number): number[] {
//   const line1 = state.lines.find(l => l.id === lineId1)
//   const line2 = state.lines.find(l => l.id === lineId2)
//
//   if (!line1 || !line2) return []
//
//   return line1.stations.filter(stationId => line2.stations.includes(stationId))
// }

// 使用BFS算法计算最短路径
export function findShortestPath(fromStationId: number, toStationId: number): PassengerRoute | null {
  // 检查缓存
  const cacheKey = getCacheKey(fromStationId, toStationId)
  const cached = routeCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < PATH_PLANNING_CONFIG.cacheTimeout) {
    return cached.route
  }

  // 清理过期缓存
  if (routeCache.size > PATH_PLANNING_CONFIG.cacheSize) {
    cleanExpiredCache()
  }

  // 如果起点和终点相同
  if (fromStationId === toStationId) {
    return null
  }

  // 检查是否在同一线路上（直达）
  const directLineId = areStationsOnSameLine(fromStationId, toStationId)
  if (directLineId !== null) {
    const distance = getDistanceOnLine(directLineId, fromStationId, toStationId)
    const route: PassengerRoute = {
      from: fromStationId,
      to: toStationId,
      steps: [
        { stationId: fromStationId, lineId: directLineId, isTransfer: false },
        { stationId: toStationId, lineId: directLineId, isTransfer: false }
      ],
      totalDistance: distance,
      transferCount: 0,
      estimatedTime: distance * 1.0 // 基础时间倍数
    }

    // 缓存结果
    routeCache.set(cacheKey, { route, timestamp: Date.now() })
    return route
  }

  // BFS搜索最短换乘路径
  interface SearchNode {
    stationId: number
    lineId: number
    distance: number
    transfers: number
    path: RouteStep[]
  }

  const queue: SearchNode[] = []
  const visited = new Set<string>()

  // 初始化：从起始站点的所有线路开始
  const startLines = getStationLines(fromStationId)
  for (const lineId of startLines) {
    const nodeKey = `${fromStationId}-${lineId}`
    if (!visited.has(nodeKey)) {
      visited.add(nodeKey)
      queue.push({
        stationId: fromStationId,
        lineId: lineId,
        distance: 0,
        transfers: 0,
        path: [{ stationId: fromStationId, lineId: lineId, isTransfer: false }]
      })
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!

    // 如果超过最大换乘次数，跳过
    if (current.transfers > PATH_PLANNING_CONFIG.maxTransfers) {
      continue
    }

    const currentLine = state.lines.find(l => l.id === current.lineId)
    if (!currentLine) continue

    // 遍历当前线路上的所有站点
    for (const nextStationId of currentLine.stations) {
      if (nextStationId === current.stationId) continue

      const distance = getDistanceOnLine(current.lineId, current.stationId, nextStationId)
      const newDistance = current.distance + distance

      // 如果到达目标站点
      if (nextStationId === toStationId) {
        const route: PassengerRoute = {
          from: fromStationId,
          to: toStationId,
          steps: [
            ...current.path,
            { stationId: toStationId, lineId: current.lineId, isTransfer: false }
          ],
          totalDistance: newDistance,
          transferCount: current.transfers,
          estimatedTime: newDistance + current.transfers * PATH_PLANNING_CONFIG.transferTime
        }

        // 缓存结果
        routeCache.set(cacheKey, { route, timestamp: Date.now() })
        return route
      }

      // 继续在当前线路上搜索
      const nodeKey = `${nextStationId}-${current.lineId}`
      if (!visited.has(nodeKey)) {
        visited.add(nodeKey)
        queue.push({
          stationId: nextStationId,
          lineId: current.lineId,
          distance: newDistance,
          transfers: current.transfers,
          path: [
            ...current.path,
            { stationId: nextStationId, lineId: current.lineId, isTransfer: false }
          ]
        })
      }

      // 在换乘站点尝试换乘到其他线路
      const nextStationLines = getStationLines(nextStationId)
      for (const nextLineId of nextStationLines) {
        if (nextLineId === current.lineId) continue // 跳过当前线路

        const transferNodeKey = `${nextStationId}-${nextLineId}`
        if (!visited.has(transferNodeKey)) {
          visited.add(transferNodeKey)
          queue.push({
            stationId: nextStationId,
            lineId: nextLineId,
            distance: newDistance + PATH_PLANNING_CONFIG.transferCost,
            transfers: current.transfers + 1,
            path: [
              ...current.path,
              { stationId: nextStationId, lineId: current.lineId, isTransfer: false },
              { stationId: nextStationId, lineId: nextLineId, isTransfer: true }
            ]
          })
        }
      }
    }
  }

  // 没有找到路径
  return null
}

// 获取路径的下一个目标站点
export function getNextTargetStation(route: PassengerRoute, currentStep: number): number | null {
  if (currentStep >= route.steps.length - 1) {
    return null
  }
  return route.steps[currentStep + 1].stationId
}

// 检查乘客是否需要在当前站点换乘
export function shouldTransferAtStation(route: PassengerRoute, currentStep: number, currentStationId: number): boolean {
  if (currentStep >= route.steps.length - 1) {
    return false
  }

  const currentRouteStep = route.steps[currentStep]
  const nextRouteStep = route.steps[currentStep + 1]

  return currentRouteStep.stationId === currentStationId && 
         nextRouteStep.isTransfer && 
         nextRouteStep.stationId === currentStationId
}

// 获取换乘后的目标线路
export function getTransferLineId(route: PassengerRoute, currentStep: number): number | null {
  if (currentStep >= route.steps.length - 1) {
    return null
  }

  const nextStep = route.steps[currentStep + 1]
  return nextStep.isTransfer ? nextStep.lineId : null
}

// 清空路径缓存（当网络结构改变时调用）
export function clearRouteCache(): void {
  routeCache.clear()
  console.log('🗑️ 路径缓存已清空')
}

// 获取缓存统计信息
export function getCacheStats(): { size: number, hitRate: number } {
  return {
    size: routeCache.size,
    hitRate: 0 // TODO: 实现命中率统计
  }
}
