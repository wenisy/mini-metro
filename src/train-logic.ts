import type { Shape } from './types.js'
import { state, zeroByShape, total, clamp, calculateDwellTime } from './game-state.js'

// 列车运行逻辑
export function updateTrains(dt: number): void {
  for (const t of state.trains) {
    const line = state.lines.find(l => l.id === t.lineId)!
    
    // 处理在站停留
    if (t.dwell > 0) {
      t.dwell = Math.max(0, t.dwell - dt)
      continue
    }

    t.t += dt * 0.25
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

      // 服务站点：卸载/装载
      const sid = line.stations[t.atIndex]
      const s = state.stations.find(st => st.id === sid)!
      
      // 卸载匹配的乘客
      t.passengersBy[s.shape] = 0
      
      // 开始停车 - 使用动态停车时间（换乘站停留更久）
      const dwellTime = calculateDwellTime(sid)
      t.dwell = Math.max(t.dwell, dwellTime)
      
      // 根据剩余容量装载乘客
      let capacityLeft = t.capacity - total(t.passengersBy)
      const order: Shape[] = ['circle', 'triangle', 'square', 'star', 'heart']
      
      for (const sh of order) {
        if (capacityLeft <= 0) break
        
        // 如果有按目的地分类的乘客，从任何目的地桶中取出该形状的乘客
        let remain = capacityLeft
        for (const destIdStr of Object.keys(s.queueTo)) {
          if (remain <= 0) break
          const destId = Number(destIdStr)
          const perDest = s.queueTo[destId]
          const have = perDest?.[sh] || 0
          if (have > 0) {
            const take = Math.min(have, remain)
            perDest[sh] -= take
            s.queueBy[sh] -= take
            
            // 添加到列车的按目的地分类的乘客中
            t.passengersTo[destId] = t.passengersTo[destId] || zeroByShape()
            t.passengersTo[destId][sh] = (t.passengersTo[destId][sh] || 0) + take
            t.passengersBy[sh] += take
            remain -= take
          }
        }
        capacityLeft = remain
      }
    }
  }
}

// 站点生成逻辑
let spawnTimer = 0

export function maybeSpawnStations(dt: number): void {
  if (!state.autoSpawnEnabled) return
  
  spawnTimer += dt
  const interval = clamp(3 - state.time * 0.02, 1, 3) // 随时间加快
  
  if (spawnTimer >= interval) {
    spawnTimer = 0

    for (let tries = 0; tries < 20; tries++) {
      const pos = { x: 80 + Math.random() * 440, y: 80 + Math.random() * 640 }
      const shapes: Shape[] = ['circle', 'triangle', 'square', 'star', 'heart']
      const shape = shapes[Math.floor(Math.random() * shapes.length)]
      const minR = 40
      
      // 检查与现有站点的最小距离
      const tooClose = state.stations.some(s => {
        const dx = s.pos.x - pos.x
        const dy = s.pos.y - pos.y
        return dx * dx + dy * dy < minR * minR
      })
      
      if (!tooClose) {
        // 动态导入addStation以避免循环依赖
        import('./game-state.js').then(({ addStation }) => {
          addStation(pos, shape)
        })
        break
      }
    }
  }
}

// 乘客生成逻辑
export function spawnPassengers(dt: number): void {
  if (state.stations.length && Math.random() < dt * (state.passengerSpawnBaseRate + state.time * 0.005)) {
    const from = state.stations[Math.floor(Math.random() * state.stations.length)]
    
    // 选择不同形状的目标站点
    const candidates = state.stations.filter(st => st.id !== from.id && st.shape !== from.shape)
    if (candidates.length) {
      const to = candidates[Math.floor(Math.random() * candidates.length)]
      const targetShape: Shape = to.shape
      
      from.queueBy[targetShape] = Math.min(99, from.queueBy[targetShape] + 1)
      from.queueTo[to.id] = from.queueTo[to.id] || zeroByShape()
      from.queueTo[to.id][targetShape] = Math.min(99, (from.queueTo[to.id][targetShape] || 0) + 1)
      
      // 检查游戏结束条件
      if (total(from.queueBy) >= 12) { // QUEUE_FAIL
        state.gameOver = true
      }
    }
  }
}
