import type { Shape, PassengerInfo } from './types.js'
import { state, zeroByShape, total, clamp, calculateDwellTime, addMoney, updateLineStats, generatePassengerId } from './game-state.js'
import { updateTrainVisualState } from './train-visual.js'
import { findShortestPath } from './path-planning.js'
import { smartPassengerBoarding, smartPassengerAlighting, cleanupStrandedPassengers } from './smart-passenger.js'

// 获取游戏速度倍数
function getGameSpeed(): number {
  return state.gameSpeed || 1
}

// 清理计时器
let cleanupTimer = 0

// 列车运行逻辑
export function updateTrains(dt: number): void {
  // 定期清理滞留乘客
  cleanupTimer += dt * getGameSpeed()
  if (cleanupTimer >= 10) { // 每10秒清理一次
    cleanupStrandedPassengers()
    cleanupTimer = 0
  }

  for (const t of state.trains) {
    const line = state.lines.find(l => l.id === t.lineId)!

    // 更新列车视觉状态
    updateTrainVisualState(t, dt)

    // 处理在站停留
    if (t.dwell > 0) {
      t.dwell = Math.max(0, t.dwell - dt * getGameSpeed())
      continue
    }

    t.t += dt * 0.25 * getGameSpeed()
    if (t.t >= 1) {
      t.t = 0
      // 沿线路前进并在端点掉头
      const last = line.stations.length - 1

      // 检查是否需要在端点掉头
      if (t.dir > 0 && t.atIndex >= last) {
        t.dir = -1
        // 不移动索引，只是掉头
      } else if (t.dir < 0 && t.atIndex <= 0) {
        t.dir = 1
        // 不移动索引，只是掉头
      } else {
        // 向当前方向移动到下一站
        t.atIndex = clamp(t.atIndex + (t.dir > 0 ? 1 : -1), 0, last)
      }

      // 服务站点：智能乘客上下车
      const sid = line.stations[t.atIndex]
      const s = state.stations.find(st => st.id === sid)!

      // 智能乘客下车逻辑
      const alightedPassengers = smartPassengerAlighting(t, s)

      // 计算收入（基于实际下车的乘客）
      let totalIncome = 0
      if (alightedPassengers > 0) {
        // 使用平均票价计算收入（根据新的票价系统调整）
        const averageTicketPrice = 2.5
        totalIncome = alightedPassengers * averageTicketPrice

        addMoney(totalIncome, `运输${alightedPassengers}名乘客到达目的地`, s.pos)
        updateLineStats(t.lineId, alightedPassengers, totalIncome)
      }

      // 开始停车 - 使用动态停车时间（换乘站停留更久）
      const dwellTime = calculateDwellTime(sid)
      t.dwell = Math.max(t.dwell, dwellTime)

      // 智能乘客上车逻辑
      smartPassengerBoarding(t, s)
    }
  }
}

// 站点生成逻辑
let spawnTimer = 0

export function maybeSpawnStations(dt: number): void {
  if (!state.autoSpawnEnabled) return

  spawnTimer += dt * getGameSpeed()
  const interval = clamp(3 - state.time * 0.02, 1, 3) // 随时间加快

  if (spawnTimer >= interval) {
    spawnTimer = 0

    // 使用改进的站点生成函数
    const shapes: Shape[] = ['circle', 'triangle', 'square', 'star', 'heart']
    const shape = shapes[Math.floor(Math.random() * shapes.length)]

    // 动态导入addStationSafely以避免循环依赖
    Promise.all([
      import('./game-state.js'),
      import('./rendering.js')
    ]).then(([{ addStationSafely }, { globalCamera }]) => {
      const newStation = addStationSafely(undefined, shape, undefined, globalCamera)
      if (newStation) {
        console.log(`✅ 自动生成新站点: ${newStation.shape} (ID: ${newStation.id}) 位置: (${Math.round(newStation.pos.x)}, ${Math.round(newStation.pos.y)})`)
      } else {
        console.log(`⚠️ 无法生成新站点，可能空间不足`)
      }
    })
  }
}

// 智能乘客生成逻辑
export function spawnPassengers(dt: number): void {
  if (state.stations.length && Math.random() < dt * getGameSpeed() * (state.passengerSpawnBaseRate + state.time * 0.005)) {
    const from = state.stations[Math.floor(Math.random() * state.stations.length)]

    // 选择不同形状的目标站点
    const candidates = state.stations.filter(st => st.id !== from.id && st.shape !== from.shape)
    if (candidates.length) {
      const to = candidates[Math.floor(Math.random() * candidates.length)]
      const targetShape: Shape = to.shape

      // 计算路径
      const route = findShortestPath(from.id, to.id)

      // 创建乘客信息
      const passenger: PassengerInfo = {
        id: generatePassengerId(),
        shape: targetShape,
        fromStationId: from.id,
        toStationId: to.id,
        route: route,
        currentStep: 0,
        isWaitingForTransfer: false,
        boardTime: state.time
      }

      // 添加到站点的等待队列
      from.waitingPassengers.push(passenger)

      // 更新传统的计数器（保持兼容性）
      from.queueBy[targetShape] = Math.min(99, from.queueBy[targetShape] + 1)
      from.queueTo[to.id] = from.queueTo[to.id] || zeroByShape()
      from.queueTo[to.id][targetShape] = Math.min(99, (from.queueTo[to.id][targetShape] || 0) + 1)

      console.log(`🚶 新乘客生成: ${passenger.id} 从 ${from.id} 到 ${to.id}, 路径: ${route ? `${route.steps.length}步, ${route.transferCount}次换乘` : '无路径'}`)

      // 检查游戏结束条件
      if (total(from.queueBy) >= 12) { // QUEUE_FAIL
        state.gameOver = true
      }
    }
  }
}
