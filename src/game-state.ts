import type { GameState, Station, Line, Train, Shape, Vec2 } from './types.js'

// 游戏常量
export const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22']
export const DWELL_TIME = 0.8
export const QUEUE_FAIL = 12
export const TRANSFER_STATION_EXTRA_DWELL = 0.4

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

export function addLine(color: string, a: Station, b: Station, name?: string): Line {
  const lineName = name ?? `${getNextAvailableLineNumber()}号线`
  const l: Line = { id: nextId++, name: lineName, color, stations: [a.id, b.id] }
  state.lines.push(l)
  
  // 默认添加一辆列车
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

// 初始化世界
export function spawnInitialWorld(): void {
  const s1 = addStation({ x: 120, y: 120 }, 'circle', 'medium')
  const s2 = addStation({ x: 320, y: 140 }, 'triangle', 'medium')
  addStation({ x: 220, y: 280 }, 'square', 'medium')
  addStation({ x: 180, y: 200 }, 'star', 'small')
  addStation({ x: 400, y: 200 }, 'heart', 'small')
  
  const firstLine = addLine(COLORS[0], s1, s2, '1号线')
  state.currentLineId = firstLine.id
}
