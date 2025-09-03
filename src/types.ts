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
}

// 相机类型
export interface CameraState {
  pos: Vec2
  scale: number
}
