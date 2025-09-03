import type { GameState, Station, Line, Shape, Vec2, EconomyState, PriceConfig, Transaction, MoneyChangeEffect } from './types.js'

// 游戏常量
export const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22']
export const DWELL_TIME = 0.8
export const QUEUE_FAIL = 12
export const TRANSFER_STATION_EXTRA_DWELL = 0.4

// 经济系统配置
export const priceConfig: PriceConfig = {
  // 收入相关
  baseTicketPrice: 10,
  distanceMultiplier: 5,
  transferBonus: 3,
  shapeMultipliers: {
    circle: 1.0,
    triangle: 1.2,
    square: 1.1,
    star: 1.5,
    heart: 1.3
  },

  // 支出相关
  newLineBaseCost: 200,
  lineExtensionCost: 50,
  newTrainCost: 100,
  trainCapacityUpgradeCost: 20,
  trainMaintenanceCost: 1 // 每分钟每列车
}

// 游戏状态
export const state: GameState = {
  time: 0,
  stations: [],
  lines: [],
  trains: [],
  autoSpawnEnabled: false,
  spawnOnConnect: false,
  gameOver: false,
  currentLineId: null,
  nextLineNum: 1,
  showLinkChooser: false,
  linkChooserFrom: null,
  linkChooserTo: null,
  passengerSpawnBaseRate: 0.05,
}

// 经济系统状态
export const economy: EconomyState = {
  balance: 500, // 初始资金
  totalIncome: 0,
  totalExpense: 0,
  incomeHistory: [],
  expenseHistory: []
}

// 交易历史和视觉效果
export const transactions: Transaction[] = []
export const moneyEffects: MoneyChangeEffect[] = []

let nextTransactionId = 1
let nextEffectId = 1

let nextId = 1

// 工具函数
export function zeroByShape(): Record<Shape, number> {
  return { circle: 0, triangle: 0, square: 0, star: 0, heart: 0 }
}

export function total(rec: Record<Shape, number>): number {
  return rec.circle + rec.triangle + rec.square + rec.star + rec.heart
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return dx * dx + dy * dy
}

// 站点管理
export function addStation(pos: Vec2, shape?: Station['shape'], size?: Station['size']): Station {
  const stationShape = shape || (() => {
    const shapes: Station['shape'][] = ['circle', 'triangle', 'square', 'star', 'heart']
    return shapes[Math.floor(Math.random() * shapes.length)]
  })()

  const stationSize = size || (() => {
    const weights = [0.5, 0.3, 0.2]
    const rand = Math.random()
    if (rand < weights[0]) return 'small'
    if (rand < weights[0] + weights[1]) return 'medium'
    return 'large'
  })()

  const capacity = stationSize === 'small' ? 30 : stationSize === 'medium' ? 60 : 100

  const s: Station = {
    id: nextId++,
    pos,
    shape: stationShape,
    size: stationSize,
    capacity,
    queueBy: zeroByShape(),
    queueTo: {}
  }
  state.stations.push(s)
  return s
}

export function hitTestStation(p: Vec2): Station | null {
  let best: Station | null = null
  let bestD = Infinity
  for (const s of state.stations) {
    const r = s.size === 'small' ? 12 : s.size === 'medium' ? 16 : 20
    const d = dist2(s.pos, p)
    if (d < r * r && d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export function nearestStationWithin(p: Vec2, radius: number): Station | null {
  let best: Station | null = null
  let bestD = radius * radius
  for (const s of state.stations) {
    const d = dist2(s.pos, p)
    if (d <= bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

// 线路管理
export function getNextAvailableLineNumber(): number {
  const existingNumbers = state.lines
    .map(l => l.name.match(/(\d+)号线/))
    .filter(match => match)
    .map(match => parseInt(match![1]))
    .sort((a, b) => a - b)

  for (let i = 1; i <= existingNumbers.length + 1; i++) {
    if (!existingNumbers.includes(i)) {
      return i
    }
  }
  return 1
}

export function addLine(color: string, a: Station, b: Station, name?: string, skipPayment: boolean = false): Line | null {
  const cost = priceConfig.newLineBaseCost

  // 检查是否需要付费且余额是否足够
  if (!skipPayment && !canAfford(cost)) {
    console.log(`❌ 无法建设新线路: 需要 $${cost}, 当前余额 $${economy.balance}`)
    return null
  }

  // 扣除费用
  if (!skipPayment) {
    const midPoint = {
      x: (a.pos.x + b.pos.x) / 2,
      y: (a.pos.y + b.pos.y) / 2
    }
    spendMoney(cost, `建设新线路`, midPoint)
  }

  const lineName = name ?? `${getNextAvailableLineNumber()}号线`
  const l: Line = { id: nextId++, name: lineName, color, stations: [a.id, b.id] }
  state.lines.push(l)

  // 默认添加一辆列车（免费，包含在线路建设费用中）
  state.trains.push({
    id: nextId++,
    lineId: l.id,
    atIndex: 0,
    t: 0,
    dir: 1,
    capacity: 6,
    passengersBy: zeroByShape(),
    passengersTo: {},
    dwell: 0
  })

  return l
}

export function findLineBetween(aId: number, bId: number): Line | null {
  for (const l of state.lines) {
    if (l.stations.length === 2) {
      const [x, y] = l.stations
      if ((x === aId && y === bId) || (x === bId && y === aId)) return l
    }
  }
  return null
}

export function removeLine(lineId: number): void {
  const idx = state.lines.findIndex(l => l.id === lineId)
  if (idx >= 0) state.lines.splice(idx, 1)
  
  // 移除该线路上的列车
  state.trains = state.trains.filter(t => t.lineId !== lineId)

  if (state.lines.length === 0) {
    state.nextLineNum = 1
  }
}

// 换乘站检测和停车时间计算
export function getStationLineCount(stationId: number): number {
  let lineCount = 0
  for (const line of state.lines) {
    if (line.stations.includes(stationId)) {
      lineCount++
    }
  }
  return lineCount
}

export function calculateDwellTime(stationId: number): number {
  const lineCount = getStationLineCount(stationId)
  if (lineCount <= 1) {
    return DWELL_TIME
  } else {
    return DWELL_TIME + TRANSFER_STATION_EXTRA_DWELL * (lineCount - 1)
  }
}

export function isTransferStation(stationId: number): boolean {
  return getStationLineCount(stationId) > 1
}

// 线路扩展逻辑
export function canExtendLine(line: Line, from: Station, to: Station): boolean {
  const fromOnLine = line.stations.includes(from.id)
  const toOnLine = line.stations.includes(to.id)

  if (fromOnLine && toOnLine) return false
  if (!fromOnLine && !toOnLine) return false

  if (fromOnLine) {
    const fromIndex = line.stations.indexOf(from.id)
    return fromIndex === 0 || fromIndex === line.stations.length - 1
  } else {
    const toIndex = line.stations.indexOf(to.id)
    return toIndex === 0 || toIndex === line.stations.length - 1
  }
}

export function getExtendableLines(from: Station, to: Station): Line[] {
  return state.lines.filter(line => canExtendLine(line, from, to))
}

// 线路延长费用检查
export function extendLine(line: Line, newStationId: number, pos?: Vec2): boolean {
  const cost = priceConfig.lineExtensionCost

  if (!canAfford(cost)) {
    console.log(`❌ 无法延长线路: 需要 $${cost}, 当前余额 $${economy.balance}`)
    return false
  }

  // 扣除费用
  if (pos) {
    spendMoney(cost, `延长${line.name}`, pos)
  } else {
    spendMoney(cost, `延长${line.name}`)
  }

  return true
}

// 添加新列车
export function addTrain(lineId: number, pos?: Vec2): boolean {
  const cost = priceConfig.newTrainCost

  if (!canAfford(cost)) {
    console.log(`❌ 无法购买列车: 需要 $${cost}, 当前余额 $${economy.balance}`)
    return false
  }

  // 扣除费用
  spendMoney(cost, `购买新列车`, pos)

  // 添加列车
  state.trains.push({
    id: nextId++,
    lineId: lineId,
    atIndex: 0,
    t: 0,
    dir: 1,
    capacity: 6,
    passengersBy: zeroByShape(),
    passengersTo: {},
    dwell: 0
  })

  return true
}

// 升级列车容量
export function upgradeTrainCapacity(lineId: number, pos?: Vec2): boolean {
  const trainsOnLine = state.trains.filter(t => t.lineId === lineId)
  if (trainsOnLine.length === 0) return false

  const cost = priceConfig.trainCapacityUpgradeCost * trainsOnLine.length

  if (!canAfford(cost)) {
    console.log(`❌ 无法升级容量: 需要 $${cost}, 当前余额 $${economy.balance}`)
    return false
  }

  // 扣除费用
  spendMoney(cost, `升级列车容量`, pos)

  // 升级所有该线路的列车
  trainsOnLine.forEach(train => {
    train.capacity += 1
  })

  return true
}

// 经济系统函数
export function addMoney(amount: number, description: string, pos?: Vec2): void {
  economy.balance += amount
  economy.totalIncome += amount

  // 记录交易
  const transaction: Transaction = {
    id: nextTransactionId++,
    type: 'income',
    amount,
    description,
    timestamp: Date.now()
  }
  transactions.push(transaction)

  // 添加视觉效果
  if (pos) {
    const effect: MoneyChangeEffect = {
      id: nextEffectId++,
      amount,
      pos: { ...pos },
      startTime: performance.now(),
      duration: 2000,
      type: 'income'
    }
    moneyEffects.push(effect)
  }

  console.log(`💰 收入: +$${amount} (${description}) 余额: $${economy.balance}`)
}

export function spendMoney(amount: number, description: string, pos?: Vec2): boolean {
  if (economy.balance < amount) {
    console.log(`❌ 余额不足: 需要 $${amount}, 当前 $${economy.balance}`)
    return false
  }

  economy.balance -= amount
  economy.totalExpense += amount

  // 记录交易
  const transaction: Transaction = {
    id: nextTransactionId++,
    type: 'expense',
    amount,
    description,
    timestamp: Date.now()
  }
  transactions.push(transaction)

  // 添加视觉效果
  if (pos) {
    const effect: MoneyChangeEffect = {
      id: nextEffectId++,
      amount: -amount,
      pos: { ...pos },
      startTime: performance.now(),
      duration: 2000,
      type: 'expense'
    }
    moneyEffects.push(effect)
  }

  console.log(`💸 支出: -$${amount} (${description}) 余额: $${economy.balance}`)
  return true
}

export function canAfford(amount: number): boolean {
  return economy.balance >= amount
}

export function calculateTicketPrice(fromStationId: number, toStationId: number, passengerShape: Shape): number {
  // 计算距离（简化：通过线路查找最短路径的站点数）
  const distance = calculateDistance(fromStationId, toStationId)
  if (distance === 0) return 0

  // 基础价格 = 基础票价 + 距离 × 距离倍数
  let price = priceConfig.baseTicketPrice + (distance - 1) * priceConfig.distanceMultiplier

  // 应用形状倍数
  price *= priceConfig.shapeMultipliers[passengerShape]

  // 检查是否经过换乘站
  if (hasTransferStation(fromStationId, toStationId)) {
    price += priceConfig.transferBonus
  }

  return Math.round(price)
}

function calculateDistance(fromStationId: number, toStationId: number): number {
  // 简化实现：查找包含两个站点的线路，计算站点间距离
  for (const line of state.lines) {
    const fromIndex = line.stations.indexOf(fromStationId)
    const toIndex = line.stations.indexOf(toStationId)

    if (fromIndex !== -1 && toIndex !== -1) {
      return Math.abs(toIndex - fromIndex) + 1
    }
  }

  // 如果不在同一线路上，返回默认距离
  return 2
}

function hasTransferStation(fromStationId: number, toStationId: number): boolean {
  // 简化实现：检查路径上是否有换乘站
  for (const line of state.lines) {
    const fromIndex = line.stations.indexOf(fromStationId)
    const toIndex = line.stations.indexOf(toStationId)

    if (fromIndex !== -1 && toIndex !== -1) {
      const start = Math.min(fromIndex, toIndex)
      const end = Math.max(fromIndex, toIndex)

      for (let i = start; i <= end; i++) {
        if (isTransferStation(line.stations[i])) {
          return true
        }
      }
    }
  }
  return false
}

// 初始化世界
export function spawnInitialWorld(): void {
  const s1 = addStation({ x: 120, y: 120 }, 'circle', 'medium')
  const s2 = addStation({ x: 320, y: 140 }, 'triangle', 'medium')
  addStation({ x: 220, y: 280 }, 'square', 'medium')
  addStation({ x: 180, y: 200 }, 'star', 'small')
  addStation({ x: 400, y: 200 }, 'heart', 'small')

  // 第一条线路免费
  const firstLine = addLine(COLORS[0], s1, s2, '1号线', true)
  if (firstLine) {
    state.currentLineId = firstLine.id
  }
}
