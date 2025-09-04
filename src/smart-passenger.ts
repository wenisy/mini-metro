import type { Train, Station, PassengerInfo } from './types.js'
import { state, zeroByShape } from './game-state.js'
import { shouldTransferAtStation, getTransferLineId } from './path-planning.js'

// 智能乘客上车逻辑
export function smartPassengerBoarding(train: Train, station: Station): void {
  let capacityLeft = train.capacity - train.passengers.length
  
  if (capacityLeft <= 0) return

  // 优先级1: 装载能直接到达目的地的乘客
  const directPassengers = station.waitingPassengers.filter(p => 
    p.route && canReachDestination(train, p)
  )

  // 优先级2: 装载需要换乘但当前线路是最优路径的乘客
  const transferPassengers = station.waitingPassengers.filter(p => 
    p.route && !canReachDestination(train, p) && isOnOptimalPath(train, p, station.id)
  )

  // 优先级3: 装载换乘乘客（已经在换乘站等待的乘客）
  const waitingTransferPassengers = station.transferPassengers.filter(p =>
    p.route && isCorrectTransferLine(train, p, station.id)
  )

  // 按优先级装载乘客
  const allCandidates = [
    ...waitingTransferPassengers,  // 最高优先级：换乘乘客
    ...directPassengers,           // 中等优先级：直达乘客
    ...transferPassengers          // 最低优先级：需要换乘的乘客
  ]

  for (const passenger of allCandidates) {
    if (capacityLeft <= 0) break

    // 从站点移除乘客
    removePassengerFromStation(passenger, station)
    
    // 添加到列车
    train.passengers.push(passenger)
    
    // 更新传统计数器
    train.passengersBy[passenger.shape]++
    train.passengersTo[passenger.toStationId] = train.passengersTo[passenger.toStationId] || zeroByShape()
    train.passengersTo[passenger.toStationId][passenger.shape]++

    capacityLeft--

    console.log(`🚂 乘客 ${passenger.id} 上车，列车 ${train.id}，目标: ${passenger.toStationId}`)
  }
}

// 智能乘客下车逻辑
export function smartPassengerAlighting(train: Train, station: Station): number {
  let alightedCount = 0
  const passengersToRemove: PassengerInfo[] = []

  for (const passenger of train.passengers) {
    let shouldAlight = false
    let isTransfer = false

    // 检查是否到达最终目的地
    if (passenger.toStationId === station.id) {
      shouldAlight = true
      console.log(`🎯 乘客 ${passenger.id} 到达目的地 ${station.id}`)
    }
    // 检查是否需要在此站换乘
    else if (passenger.route && shouldTransferAtStation(passenger.route, passenger.currentStep, station.id)) {
      shouldAlight = true
      isTransfer = true
      console.log(`🔄 乘客 ${passenger.id} 在站点 ${station.id} 换乘`)
    }

    if (shouldAlight) {
      passengersToRemove.push(passenger)
      
      // 更新传统计数器
      train.passengersBy[passenger.shape]--
      if (train.passengersTo[passenger.toStationId]) {
        train.passengersTo[passenger.toStationId][passenger.shape]--
      }

      if (isTransfer) {
        // 换乘：添加到换乘等待队列
        passenger.currentStep++
        passenger.isWaitingForTransfer = true
        station.transferPassengers.push(passenger)
        
        // 更新站点计数器（换乘乘客仍在等待）
        station.queueBy[passenger.shape]++
      } else {
        // 到达目的地：乘客离开系统
        alightedCount++
      }
    }
  }

  // 从列车移除下车的乘客
  train.passengers = train.passengers.filter(p => !passengersToRemove.includes(p))

  return alightedCount
}

// 检查列车是否能直接到达乘客的目的地
function canReachDestination(train: Train, passenger: PassengerInfo): boolean {
  const line = state.lines.find(l => l.id === train.lineId)
  if (!line) return false

  return line.stations.includes(passenger.toStationId)
}

// 检查当前线路是否在乘客的最优路径上
function isOnOptimalPath(train: Train, passenger: PassengerInfo, currentStationId: number): boolean {
  if (!passenger.route) return false

  const line = state.lines.find(l => l.id === train.lineId)
  if (!line) return false

  // 检查路径中是否包含当前线路
  for (const step of passenger.route.steps) {
    if (step.lineId === train.lineId && step.stationId === currentStationId) {
      return true
    }
  }

  return false
}

// 检查是否是正确的换乘线路
function isCorrectTransferLine(train: Train, passenger: PassengerInfo, _currentStationId: number): boolean {
  if (!passenger.route || !passenger.isWaitingForTransfer) return false

  const targetLineId = getTransferLineId(passenger.route, passenger.currentStep - 1)
  return targetLineId === train.lineId
}

// 从站点移除乘客
function removePassengerFromStation(passenger: PassengerInfo, station: Station): void {
  // 从等待队列移除
  const waitingIndex = station.waitingPassengers.indexOf(passenger)
  if (waitingIndex !== -1) {
    station.waitingPassengers.splice(waitingIndex, 1)
  }

  // 从换乘队列移除
  const transferIndex = station.transferPassengers.indexOf(passenger)
  if (transferIndex !== -1) {
    station.transferPassengers.splice(transferIndex, 1)
  }

  // 更新传统计数器
  station.queueBy[passenger.shape] = Math.max(0, station.queueBy[passenger.shape] - 1)
  if (station.queueTo[passenger.toStationId]) {
    station.queueTo[passenger.toStationId][passenger.shape] = Math.max(0, 
      station.queueTo[passenger.toStationId][passenger.shape] - 1)
  }
}

// 获取站点的总等待乘客数
export function getTotalWaitingPassengers(station: Station): number {
  return station.waitingPassengers.length + station.transferPassengers.length
}

// 获取列车的乘客负载信息
export function getTrainLoadInfo(train: Train): { 
  total: number, 
  capacity: number, 
  loadFactor: number,
  destinationBreakdown: Record<number, number>
} {
  const destinationBreakdown: Record<number, number> = {}
  
  for (const passenger of train.passengers) {
    destinationBreakdown[passenger.toStationId] = (destinationBreakdown[passenger.toStationId] || 0) + 1
  }

  return {
    total: train.passengers.length,
    capacity: train.capacity,
    loadFactor: train.passengers.length / train.capacity,
    destinationBreakdown
  }
}

// 清理过期的换乘乘客（防止乘客永远等待）
export function cleanupStrandedPassengers(): void {
  const currentTime = state.time
  const maxWaitTime = 60 // 最大等待时间（秒）

  for (const station of state.stations) {
    // 清理等待时间过长的换乘乘客
    station.transferPassengers = station.transferPassengers.filter(passenger => {
      const waitTime = currentTime - passenger.boardTime
      if (waitTime > maxWaitTime) {
        console.log(`⚠️ 清理滞留乘客: ${passenger.id} 在站点 ${station.id} 等待时间过长`)
        // 更新计数器
        station.queueBy[passenger.shape] = Math.max(0, station.queueBy[passenger.shape] - 1)
        return false
      }
      return true
    })

    // 清理等待时间过长的普通乘客
    station.waitingPassengers = station.waitingPassengers.filter(passenger => {
      const waitTime = currentTime - passenger.boardTime
      if (waitTime > maxWaitTime * 2) { // 普通乘客等待时间更长
        console.log(`⚠️ 清理滞留乘客: ${passenger.id} 在站点 ${station.id} 等待时间过长`)
        // 更新计数器
        station.queueBy[passenger.shape] = Math.max(0, station.queueBy[passenger.shape] - 1)
        if (station.queueTo[passenger.toStationId]) {
          station.queueTo[passenger.toStationId][passenger.shape] = Math.max(0,
            station.queueTo[passenger.toStationId][passenger.shape] - 1)
        }
        return false
      }
      return true
    })
  }
}

// 获取站点的拥堵程度
export function getStationCongestionLevel(station: Station): 'low' | 'medium' | 'high' | 'critical' {
  const totalWaiting = getTotalWaitingPassengers(station)
  const capacity = station.capacity

  const congestionRatio = totalWaiting / capacity

  if (congestionRatio < 0.3) return 'low'
  if (congestionRatio < 0.6) return 'medium'
  if (congestionRatio < 0.9) return 'high'
  return 'critical'
}

// 获取线路的整体效率统计
export function getLineEfficiencyStats(lineId: number): {
  totalPassengers: number,
  averageLoadFactor: number,
  congestionPoints: number[],
  transferStations: number[]
} {
  const line = state.lines.find(l => l.id === lineId)
  if (!line) {
    return { totalPassengers: 0, averageLoadFactor: 0, congestionPoints: [], transferStations: [] }
  }

  const trains = state.trains.filter(t => t.lineId === lineId)
  let totalPassengers = 0
  let totalLoadFactor = 0

  for (const train of trains) {
    totalPassengers += train.passengers.length
    totalLoadFactor += train.passengers.length / train.capacity
  }

  const averageLoadFactor = trains.length > 0 ? totalLoadFactor / trains.length : 0

  // 找出拥堵站点
  const congestionPoints: number[] = []
  const transferStations: number[] = []

  for (const stationId of line.stations) {
    const station = state.stations.find(s => s.id === stationId)
    if (station) {
      const congestion = getStationCongestionLevel(station)
      if (congestion === 'high' || congestion === 'critical') {
        congestionPoints.push(stationId)
      }

      // 检查是否是换乘站
      const lineCount = state.lines.filter(l => l.stations.includes(stationId)).length
      if (lineCount > 1) {
        transferStations.push(stationId)
      }
    }
  }

  return {
    totalPassengers,
    averageLoadFactor,
    congestionPoints,
    transferStations
  }
}
