// 基础类型定义
export type Vec2 = { x: number; y: number }

// 游戏实体类型
export type Shape = 'circle' | 'triangle' | 'square' | 'star' | 'heart'

export interface Station {
  id: number
  pos: Vec2
  shape: Shape
  size: 'small' | 'medium' | 'large'
  capacity: number
  queueBy: Record<Shape, number>
  queueTo: Record<number, Record<Shape, number>>
}

export interface Line {
  id: number
  name: string
  color: string
  stations: number[]
}

export interface Train {
  id: number
  lineId: number
  atIndex: number
  t: number
  dir: 1 | -1
  capacity: number
  passengersBy: Record<Shape, number>
  passengersTo: Record<number, Record<Shape, number>>
  dwell: number
}

// 智能吸附系统类型
export interface LineSegment {
  lineId: number
  segmentIndex: number
  startStationId: number
  endStationId: number
  startPos: Vec2
  endPos: Vec2
}

export interface AttachmentCandidate {
  station: Station
  line: Line
  insertIndex: number
  distance: number
  attachmentType: 'endpoint' | 'middle'
  projectionPoint: Vec2
  connectionType?: 'start' | 'end' | 'middle' // 新增：明确的连接类型
}

// 动画系统类型
export interface Animation {
  id: number
  type: 'attachment' | 'highlight'
  startTime: number
  duration: number
  from: Vec2
  to: Vec2
  progress: number
  completed: boolean
}

// 交互状态类型
export interface InteractionState {
  drawingFrom: Station | null
  previewTo: Vec2 | null
  selectedLine: Line | null
}

export interface SmartAttachmentState {
  isDraggingLine: boolean
  draggedSegment: LineSegment | null
  dragStartPos: Vec2 | null
  currentDragPos: Vec2 | null
  attachmentCandidates: AttachmentCandidate[]
  activeCandidate: AttachmentCandidate | null
  snapThreshold: number
  minSnapThreshold: number
  animations: Animation[]
  highlightIntensity: number
  highlightDirection: number
}

// 游戏状态类型
export interface GameState {
  time: number
  stations: Station[]
  lines: Line[]
  trains: Train[]
  autoSpawnEnabled: boolean
  spawnOnConnect: boolean
  gameOver: boolean
  currentLineId: number | null
  nextLineNum: number
  showLinkChooser: boolean
  linkChooserFrom: Station | null
  linkChooserTo: Station | null
  passengerSpawnBaseRate: number
  infiniteMode: boolean
}

// 相机类型
export interface CameraState {
  pos: Vec2
  scale: number
}

// 经济系统类型
export interface EconomyState {
  balance: number           // 当前余额
  totalIncome: number      // 总收入
  totalExpense: number     // 总支出
  incomeHistory: number[]  // 收入历史（用于统计）
  expenseHistory: number[] // 支出历史（用于统计）
}

export interface PriceConfig {
  // 收入相关
  baseTicketPrice: number           // 基础票价
  distanceMultiplier: number        // 距离倍数
  transferBonus: number             // 换乘站奖励
  shapeMultipliers: Record<Shape, number> // 不同形状乘客的票价倍数

  // 支出相关 - 基础成本
  newLineBaseCost: number           // 新建线路基础费用
  lineExtensionCost: number         // 线路延长费用（每站点）
  newTrainCost: number              // 新列车费用
  trainCapacityUpgradeCost: number  // 列车容量升级费用（每单位容量）
  trainMaintenanceCost: number      // 列车维护费用（每列车每分钟，可选）

  // 成本倍数配置
  newLineCostMultiplier: number     // 新建线路成本倍数（1.0倍）
  extensionCostMultiplier: number   // 延长线路成本倍数（0.5倍）
  modificationCostMultiplier: number // 修改现有连接成本倍数（1.0倍）
}

export interface Transaction {
  id: number
  type: 'income' | 'expense'
  amount: number
  description: string
  timestamp: number
}

export interface MoneyChangeEffect {
  id: number
  amount: number
  pos: Vec2
  startTime: number
  duration: number
  type: 'income' | 'expense'
}
