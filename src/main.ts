import './style.css'

// Basic game bootstrap: DPR-aware canvas, fixed timestep loop, pointer input stub

type Vec2 = { x: number; y: number }

function setupCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  function resize() {
    const { clientWidth, clientHeight } = canvas
    canvas.width = Math.floor(clientWidth * dpr)
    canvas.height = Math.floor(clientHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  return { ctx, dpr }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
function dist2(a: Vec2, b: Vec2) { const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy }

class Camera {
  pos: Vec2 = { x: 0, y: 0 }
  scale = 1
  toScreen(p: Vec2): Vec2 { return { x: (p.x - this.pos.x) * this.scale, y: (p.y - this.pos.y) * this.scale } }
  toWorld(p: Vec2): Vec2 { return { x: p.x / this.scale + this.pos.x, y: p.y / this.scale + this.pos.y } }
}

function pointerPos(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): Vec2 {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// Game state stubs
type Shape = 'circle'|'triangle'|'square'|'star'|'heart'
function zeroByShape(): Record<Shape, number> { return { circle: 0, triangle: 0, square: 0, star: 0, heart: 0 } }
interface Station { id: number; pos: Vec2; shape: Shape; size: 'small'|'medium'|'large'; capacity: number; queueBy: Record<Shape, number>; queueTo: Record<number, Record<Shape, number>> }
interface Line { id: number; name: string; color: string; stations: number[] }
interface Train { id: number; lineId: number; atIndex: number; t: number; dir: 1|-1; capacity: number; passengersBy: Record<Shape, number>; passengersTo: Record<number, Record<Shape, number>>; dwell: number }

const state = {
  time: 0,
  stations: [] as Station[],
  lines: [] as Line[],
  trains: [] as Train[],
  autoSpawnEnabled: false,
  spawnOnConnect: false,
  gameOver: false,
  currentLineId: null as number | null,
  nextLineNum: 1,
  showLinkChooser: false,
  linkChooserFrom: null as Station | null,
  linkChooserTo: null as Station | null,
  passengerSpawnBaseRate: 0.05, // 可调整的乘客生成基础概率 (每秒乘客数 * 0.1)
}

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22']



const DWELL_TIME = 0.8
const QUEUE_FAIL = 12
function total(rec: Record<Shape, number>) { return rec.circle + rec.triangle + rec.square + rec.star + rec.heart }

// interaction state for line drawing
const interaction = {
  drawingFrom: null as Station | null,
  previewTo: null as Vec2 | null,
  selectedLine: null as Line | null,
}

// Smart attachment system types and state
interface LineSegment {
  lineId: number
  segmentIndex: number  // 线段索引（0表示第一段）
  startStationId: number
  endStationId: number
  startPos: Vec2
  endPos: Vec2
}

interface AttachmentCandidate {
  station: Station
  line: Line
  insertIndex: number  // 插入位置索引
  distance: number
  attachmentType: 'endpoint' | 'middle'
  projectionPoint: Vec2  // 在线段上的投影点
}

// Animation system
interface Animation {
  id: number
  type: 'attachment' | 'highlight'
  startTime: number
  duration: number
  from: Vec2
  to: Vec2
  progress: number
  completed: boolean
}

// Smart attachment state
const smartAttachment = {
  isDraggingLine: false,
  draggedSegment: null as LineSegment | null,
  dragStartPos: null as Vec2 | null,
  currentDragPos: null as Vec2 | null,
  attachmentCandidates: [] as AttachmentCandidate[],
  activeCandidate: null as AttachmentCandidate | null,
  snapThreshold: 75, // 吸附距离阈值（像素）
  minSnapThreshold: 50, // 最小吸附距离
  animations: [] as Animation[],
  highlightIntensity: 0, // 高亮强度 (0-1)
  highlightDirection: 1, // 高亮动画方向
}

let nextId = 1
function addStation(pos: Vec2, shape?: Station['shape'], size?: Station['size']): Station {
  // 如果没有指定shape，随机选择
  const stationShape = shape || (() => {
    const shapes: Station['shape'][] = ['circle','triangle','square','star','heart']
    return shapes[Math.floor(Math.random()*shapes.length)]
  })()

  // 如果没有指定size，随机选择
  const stationSize = size || (() => {
    const weights = [0.5, 0.3, 0.2] // small:50%, medium:30%, large:20%
    const rand = Math.random()
    if (rand < weights[0]) return 'small'
    if (rand < weights[0] + weights[1]) return 'medium'
    return 'large'
  })()

  // 根据大小设置容量
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
  state.stations.push(s); return s
}

function getNextAvailableLineNumber(): number {
  // Find the smallest available line number
  const existingNumbers = state.lines
    .map(l => l.name.match(/(\d+)号线/))
    .filter(match => match)
    .map(match => parseInt(match![1]))
    .sort((a, b) => a - b)

  // Find the first gap or return next number
  for (let i = 1; i <= existingNumbers.length + 1; i++) {
    if (!existingNumbers.includes(i)) {
      return i
    }
  }
  return 1 // fallback
}

function addLine(color: string, a: Station, b: Station, name?: string): Line {
  const lineName = name ?? `${getNextAvailableLineNumber()}号线`
  const l: Line = { id: nextId++, name: lineName, color, stations: [a.id, b.id] }
  state.lines.push(l)
  // add one train for line by default
  state.trains.push({ id: nextId++, lineId: l.id, atIndex: 0, t: 0, dir: 1, capacity: 6, passengersBy: zeroByShape(), passengersTo: {}, dwell: 0 })

  return l
}


function findLineBetween(aId: number, bId: number): Line | null {
  for (const l of state.lines) {
    if (l.stations.length === 2) {
      const [x,y] = l.stations
      if ((x===aId && y===bId) || (x===bId && y===aId)) return l
    }
  }
  return null
}

function removeLine(lineId: number) {
  const idx = state.lines.findIndex(l=>l.id===lineId)
  if (idx>=0) state.lines.splice(idx,1)
  // remove trains on that line
  state.trains = state.trains.filter(t=>t.lineId!==lineId)

  // If all lines are removed, reset line numbering
  if (state.lines.length === 0) {
    state.nextLineNum = 1
  }

  // Update UI immediately
  renderLinesPanel()
}

function maybeEnsureBaselineLine() {
  // No longer needed since we create initial line in spawnInitialWorld
}

function canExtendLine(line: Line, from: Station, to: Station): boolean {
  // Check if either 'from' or 'to' is at the end of the line
  // and the other station is not already on the line
  const fromOnLine = line.stations.includes(from.id)
  const toOnLine = line.stations.includes(to.id)

  // If both stations are already on the line, can't extend
  if (fromOnLine && toOnLine) return false

  // If neither station is on the line, can't extend
  if (!fromOnLine && !toOnLine) return false

  // Check if the station on the line is at an endpoint
  if (fromOnLine) {
    const fromIndex = line.stations.indexOf(from.id)
    return fromIndex === 0 || fromIndex === line.stations.length - 1
  } else {
    const toIndex = line.stations.indexOf(to.id)
    return toIndex === 0 || toIndex === line.stations.length - 1
  }
}

function getExtendableLines(from: Station, to: Station): Line[] {
  return state.lines.filter(line => canExtendLine(line, from, to))
}


function spawnInitialWorld() {
  // seed stations
  const s1 = addStation({ x: 120, y: 120 }, 'circle', 'medium')
  const s2 = addStation({ x: 320, y: 140 }, 'triangle', 'medium')
  const s3 = addStation({ x: 220, y: 280 }, 'square', 'medium')
  // 添加更多站点用于测试智能吸附
  addStation({ x: 180, y: 200 }, 'star', 'small')
  addStation({ x: 400, y: 200 }, 'heart', 'small')
  // create initial line (1号线)
  const firstLine = addLine(COLORS[0], s1, s2, '1号线')
  state.currentLineId = firstLine.id
}
function showLinkChooser(from: Station, to: Station) {
  state.showLinkChooser = true
  state.linkChooserFrom = from
  state.linkChooserTo = to

  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  const text = document.getElementById('link-chooser-text') as HTMLDivElement
  const buttons = document.getElementById('link-chooser-buttons') as HTMLDivElement

  if (!chooser || !text || !buttons) return

  const existing = findLineBetween(from.id, to.id)

  if (existing) {
    text.textContent = `${from.shape} ↔ ${to.shape} 已连接`
    buttons.innerHTML = `<button id="remove-line">删除连接</button>`
  } else {
    text.textContent = `连接 ${from.shape} → ${to.shape}`
    let html = ''

    // Check all extendable lines
    const extendableLines = getExtendableLines(from, to)
    if (extendableLines.length > 0) {
      extendableLines.forEach(line => {
        html += `<button class="extend-line" data-line-id="${line.id}">延长 ${line.name}</button>`
      })
    }

    html += `<button id="new-line">新建线路</button>`
    html += `<button id="cancel-action">取消</button>`
    buttons.innerHTML = html
  }

  chooser.style.display = 'block'

  // Add event listeners
  const removeBtn = document.getElementById('remove-line')
  const newBtn = document.getElementById('new-line')
  const cancelBtn = document.getElementById('cancel-action')
  const extendBtns = document.querySelectorAll('.extend-line')

  if (removeBtn) {
    removeBtn.onclick = () => {
      if (existing) removeLine(existing.id)
      hideLinkChooser()
    }
  }

  // Handle extend line buttons
  extendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lineId = Number((btn as HTMLButtonElement).dataset.lineId)
      const line = state.lines.find(l => l.id === lineId)
      if (line) {
        // Determine which station to add and where
        const fromOnLine = line.stations.includes(from.id)
        const toOnLine = line.stations.includes(to.id)

        if (fromOnLine && !toOnLine) {
          // Add 'to' station
          const fromIndex = line.stations.indexOf(from.id)
          if (fromIndex === 0) {
            line.stations.unshift(to.id)
          } else if (fromIndex === line.stations.length - 1) {
            line.stations.push(to.id)
          }
        } else if (toOnLine && !fromOnLine) {
          // Add 'from' station
          const toIndex = line.stations.indexOf(to.id)
          if (toIndex === 0) {
            line.stations.unshift(from.id)
          } else if (toIndex === line.stations.length - 1) {
            line.stations.push(from.id)
          }
        }
        state.currentLineId = lineId // Set as current line
        renderLinesPanel()
      }
      hideLinkChooser()
    })
  })

  if (newBtn) {
    newBtn.onclick = () => {
      const color = COLORS[(state.lines.length) % COLORS.length]
      const newLine = addLine(color, from, to)
      state.currentLineId = newLine.id
      renderLinesPanel()
      hideLinkChooser()
    }
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      hideLinkChooser()
    }
  }
}

function hideLinkChooser() {
  state.showLinkChooser = false
  state.linkChooserFrom = null
  state.linkChooserTo = null
  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  if (chooser) chooser.style.display = 'none'
}

// simple RNG station spawner with min distance avoidance
let spawnTimer = 0
function hitTestStation(p: Vec2): Station | null {
  let best: Station | null = null
  let bestD = Infinity
  for (const s of state.stations) {
    // 根据站点大小设置点击检测半径
    const r = s.size === 'small' ? 12 : s.size === 'medium' ? 16 : 20
    const d = dist2(s.pos, p)
    if (d < r*r && d < bestD) { bestD = d; best = s }
  }
  return best
}
function maybeSpawnStations(dt: number) {
  if (!state.autoSpawnEnabled) return
  spawnTimer += dt
  const interval = clamp(3 - state.time*0.02, 1, 3) // faster over time
  if (spawnTimer >= interval) {
    spawnTimer = 0

    for (let tries=0; tries<20; tries++) {
      const pos = { x: 80 + Math.random()*440, y: 80 + Math.random()*640 }
      const shapes: Station['shape'][] = ['circle','triangle','square','star','heart']
      const shape = shapes[Math.floor(Math.random()*shapes.length)]
      const minR = 40
      if (state.stations.every(s=> dist2(s.pos, pos) >= minR*minR)) {
        addStation(pos, shape)
        break
      }
    }
  }
}

function nearestStationWithin(p: Vec2, radius: number): Station | null {
  let best: Station | null = null
  let bestD = radius*radius
  for (const s of state.stations) {
    const d = dist2(s.pos, p)
    if (d <= bestD) { bestD = d; best = s }
  }
  return best
}

// Smart attachment utility functions
function pointToLineSegmentDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): { distance: number, projection: Vec2 } {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    // 线段退化为点
    const distance = Math.sqrt(dist2(point, lineStart))
    return { distance, projection: { ...lineStart } }
  }

  // 计算投影参数 t
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared))

  // 计算投影点
  const projection = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy
  }

  // 计算距离
  const distance = Math.sqrt(dist2(point, projection))

  return { distance, projection }
}

function getAllLineSegments(): LineSegment[] {
  const segments: LineSegment[] = []

  for (const line of state.lines) {
    if (line.stations.length < 2) continue

    for (let i = 0; i < line.stations.length - 1; i++) {
      const startStation = state.stations.find(s => s.id === line.stations[i])
      const endStation = state.stations.find(s => s.id === line.stations[i + 1])

      if (startStation && endStation) {
        segments.push({
          lineId: line.id,
          segmentIndex: i,
          startStationId: startStation.id,
          endStationId: endStation.id,
          startPos: startStation.pos,
          endPos: endStation.pos
        })
      }
    }
  }

  return segments
}

function findAttachmentCandidates(targetStation: Station): AttachmentCandidate[] {
  const candidates: AttachmentCandidate[] = []
  const segments = getAllLineSegments()

  for (const segment of segments) {
    // 跳过已经包含目标站点的线路
    const line = state.lines.find(l => l.id === segment.lineId)!
    if (line.stations.includes(targetStation.id)) continue

    const { distance, projection } = pointToLineSegmentDistance(
      targetStation.pos,
      segment.startPos,
      segment.endPos
    )

    if (distance >= smartAttachment.minSnapThreshold && distance <= smartAttachment.snapThreshold) {
      // 判断是端点吸附还是中间插入
      const distToStart = Math.sqrt(dist2(targetStation.pos, segment.startPos))
      const distToEnd = Math.sqrt(dist2(targetStation.pos, segment.endPos))
      const isNearEndpoint = distToStart <= smartAttachment.snapThreshold || distToEnd <= smartAttachment.snapThreshold

      candidates.push({
        station: targetStation,
        line,
        insertIndex: segment.segmentIndex + 1, // 插入到线段后面
        distance,
        attachmentType: isNearEndpoint ? 'endpoint' : 'middle',
        projectionPoint: projection
      })
    }
  }

  // 按距离排序，最近的优先
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates
}

function hitTestLineSegment(p: Vec2, threshold: number = 15): LineSegment | null {
  const segments = getAllLineSegments()
  let bestSegment: LineSegment | null = null
  let bestDistance = threshold

  for (const segment of segments) {
    const { distance } = pointToLineSegmentDistance(p, segment.startPos, segment.endPos)
    if (distance <= bestDistance) {
      bestDistance = distance
      bestSegment = segment
    }
  }

  if (bestSegment) {
    console.log('检测到线路拖拽，线路ID:', bestSegment.lineId, '距离:', bestDistance.toFixed(1))
  }

  return bestSegment
}

function updateAttachmentCandidates(dragPos: Vec2) {
  smartAttachment.attachmentCandidates = []
  smartAttachment.activeCandidate = null

  // 查找拖拽位置附近的所有站点
  for (const station of state.stations) {
    const distance = Math.sqrt(dist2(dragPos, station.pos))
    if (distance <= smartAttachment.snapThreshold) {
      const candidates = findAttachmentCandidates(station)
      smartAttachment.attachmentCandidates.push(...candidates)
    }
  }

  // 选择最佳候选
  if (smartAttachment.attachmentCandidates.length > 0) {
    smartAttachment.activeCandidate = smartAttachment.attachmentCandidates[0]
    console.log('找到吸附候选:', smartAttachment.activeCandidate.station.shape, '距离:', smartAttachment.activeCandidate.distance.toFixed(1))
  }
}

function startLineDrag(segment: LineSegment, startPos: Vec2) {
  smartAttachment.isDraggingLine = true
  smartAttachment.draggedSegment = segment
  smartAttachment.dragStartPos = startPos
  smartAttachment.currentDragPos = startPos
  smartAttachment.attachmentCandidates = []
  smartAttachment.activeCandidate = null
}

function updateLineDrag(currentPos: Vec2) {
  if (!smartAttachment.isDraggingLine) return

  smartAttachment.currentDragPos = currentPos
  updateAttachmentCandidates(currentPos)
}

function endLineDrag(): boolean {
  if (!smartAttachment.isDraggingLine) return false

  let attachmentMade = false

  if (smartAttachment.activeCandidate) {
    attachmentMade = performAttachment(smartAttachment.activeCandidate)
  }

  // 重置拖拽状态
  smartAttachment.isDraggingLine = false
  smartAttachment.draggedSegment = null
  smartAttachment.dragStartPos = null
  smartAttachment.currentDragPos = null
  smartAttachment.attachmentCandidates = []
  smartAttachment.activeCandidate = null

  return attachmentMade
}

function performAttachment(candidate: AttachmentCandidate): boolean {
  const line = candidate.line
  const station = candidate.station

  // 检查站点是否已经在线路上
  if (line.stations.includes(station.id)) {
    return false
  }

  // 检查是否会创建不合理的连接
  if (!isValidAttachment(candidate)) {
    return false
  }

  // 创建吸附动画
  if (smartAttachment.currentDragPos) {
    createAttachmentAnimation(smartAttachment.currentDragPos, station.pos)
  }

  // 执行吸附
  if (candidate.attachmentType === 'endpoint') {
    // 端点吸附：添加到线路末端
    const firstStation = state.stations.find(s => s.id === line.stations[0])!
    const lastStation = state.stations.find(s => s.id === line.stations[line.stations.length - 1])!

    const distToFirst = Math.sqrt(dist2(station.pos, firstStation.pos))
    const distToLast = Math.sqrt(dist2(station.pos, lastStation.pos))

    if (distToFirst < distToLast) {
      line.stations.unshift(station.id)
    } else {
      line.stations.push(station.id)
    }
  } else {
    // 中间插入：在指定位置插入站点
    line.stations.splice(candidate.insertIndex, 0, station.id)
  }

  // 更新UI
  renderLinesPanel()
  return true
}

function isValidAttachment(candidate: AttachmentCandidate): boolean {
  const line = candidate.line
  const station = candidate.station

  // 检查是否会创建过短的连接（避免重叠）
  const minDistance = 30

  if (candidate.attachmentType === 'endpoint') {
    const firstStation = state.stations.find(s => s.id === line.stations[0])!
    const lastStation = state.stations.find(s => s.id === line.stations[line.stations.length - 1])!

    const distToFirst = Math.sqrt(dist2(station.pos, firstStation.pos))
    const distToLast = Math.sqrt(dist2(station.pos, lastStation.pos))

    return distToFirst >= minDistance && distToLast >= minDistance
  } else {
    // 中间插入：检查与相邻站点的距离
    const insertIndex = candidate.insertIndex
    if (insertIndex > 0 && insertIndex < line.stations.length) {
      const prevStation = state.stations.find(s => s.id === line.stations[insertIndex - 1])!
      const nextStation = state.stations.find(s => s.id === line.stations[insertIndex])!

      const distToPrev = Math.sqrt(dist2(station.pos, prevStation.pos))
      const distToNext = Math.sqrt(dist2(station.pos, nextStation.pos))

      return distToPrev >= minDistance && distToNext >= minDistance
    }
  }

  return true
}

function checkLineIntersection(line1Start: Vec2, line1End: Vec2, line2Start: Vec2, line2End: Vec2): boolean {
  // 简单的线段相交检测
  const det = (line1End.x - line1Start.x) * (line2End.y - line2Start.y) - (line1End.y - line1Start.y) * (line2End.x - line2Start.x)
  if (Math.abs(det) < 1e-10) return false // 平行线

  const t = ((line2Start.x - line1Start.x) * (line2End.y - line2Start.y) - (line2Start.y - line1Start.y) * (line2End.x - line2Start.x)) / det
  const u = -((line1Start.x - line1Start.x) * (line1End.y - line1Start.y) - (line1Start.y - line1Start.y) * (line1End.x - line1Start.x)) / det

  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// Animation functions
function updateAnimations(dt: number) {
  const currentTime = performance.now()

  // 更新高亮动画
  if (smartAttachment.activeCandidate) {
    smartAttachment.highlightIntensity += smartAttachment.highlightDirection * dt * 3
    if (smartAttachment.highlightIntensity >= 1) {
      smartAttachment.highlightIntensity = 1
      smartAttachment.highlightDirection = -1
    } else if (smartAttachment.highlightIntensity <= 0.3) {
      smartAttachment.highlightIntensity = 0.3
      smartAttachment.highlightDirection = 1
    }
  } else {
    smartAttachment.highlightIntensity = 0
    smartAttachment.highlightDirection = 1
  }

  // 更新其他动画
  smartAttachment.animations = smartAttachment.animations.filter(anim => {
    anim.progress = Math.min(1, (currentTime - anim.startTime) / anim.duration)
    anim.completed = anim.progress >= 1
    return !anim.completed
  })
}

function createAttachmentAnimation(from: Vec2, to: Vec2) {
  const animation: Animation = {
    id: Date.now(),
    type: 'attachment',
    startTime: performance.now(),
    duration: 300, // 300ms
    from: { ...from },
    to: { ...to },
    progress: 0,
    completed: false
  }
  smartAttachment.animations.push(animation)
}



// Global function to render lines panel - can be called from anywhere
function renderLinesPanel() {
  console.log('renderLinesPanel 被调用，当前线路数量:', state.lines.length)
  const linesList = document.getElementById('lines-list') as HTMLDivElement
  if (!linesList) {
    console.log('linesList 元素未找到')
    return
  }

  const html = state.lines.map(l => {
    const trainCount = state.trains.filter(t => t.lineId === l.id).length
    const avgCapacity = trainCount > 0 ?
      Math.round(state.trains.filter(t => t.lineId === l.id).reduce((sum, t) => sum + t.capacity, 0) / trainCount) : 0
    const isSelected = state.currentLineId === l.id

    return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;padding:4px;background:${isSelected ? 'rgba(255,255,255,0.1)' : 'transparent'};border-radius:4px">
      <span style="display:inline-block;width:10px;height:10px;background:${l.color};border-radius:2px"></span>
      <button data-line="${l.id}" class="line-select" style="font-size:12px;flex:1;text-align:left">${l.name}</button>
      <small style="opacity:.7;font-size:10px">${trainCount}车 ${avgCapacity}座</small>
      <button data-line-delete="${l.id}" class="line-delete" style="font-size:12px;color:#ff6b6b;border:none;background:none;cursor:pointer;padding:2px 4px;border-radius:2px;" title="删除线路">×</button>
    </div>`
  }).join('')

  console.log('生成的HTML:', html)
  linesList.innerHTML = html
  linesList.querySelectorAll('button.line-select').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number((btn as HTMLButtonElement).dataset.line)
      state.currentLineId = id
      console.log('选中线路:', id)
      renderLinesPanel() // Re-render to show selection
    })
  })

  // Add delete button event listeners
  linesList.querySelectorAll('button.line-delete').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number((btn as HTMLButtonElement).dataset.lineDelete)
      if (confirm(`确定要删除 ${state.lines.find(l => l.id === id)?.name} 吗？`)) {
        removeLine(id)
      }
    })
  })
  console.log('renderLinesPanel 完成')
}

// function optimizeTrainPath(line: Line) {
//   // Find the two farthest stations for optimal train routing
//   const stations = line.stations.map(id => state.stations.find(s => s.id === id)!)
//   if (stations.length < 2) return
//
//   let maxDist = 0
//   let bestStart = 0
//   let bestEnd = 1
//
//   for (let i = 0; i < stations.length; i++) {
//     for (let j = i + 1; j < stations.length; j++) {
//       const dist = dist2(stations[i].pos, stations[j].pos)
//       if (dist > maxDist) {
//         maxDist = dist
//         bestStart = i
//         bestEnd = j
//       }
//     }
//   }
//
//   // Reorder stations to start from farthest pair
//   const reordered = [...line.stations]
//   const temp = reordered[0]
//   reordered[0] = reordered[bestStart]
//   reordered[bestStart] = temp
//
//   // Find optimal end position
//   const endIndex = reordered.indexOf(line.stations[bestEnd])
//   if (endIndex !== reordered.length - 1) {
//     const temp = reordered[reordered.length - 1]
//     reordered[reordered.length - 1] = reordered[endIndex]
//     reordered[endIndex] = temp
//   }
//
//   line.stations = reordered
//
//   // Update UI after path optimization
//   renderLinesPanel()
// }


function drawStation(ctx: CanvasRenderingContext2D, s: Station) {
  ctx.save()
  ctx.translate(s.pos.x, s.pos.y)

  // 根据站点大小设置基础尺寸
  const baseSize = s.size === 'small' ? 8 : s.size === 'medium' ? 12 : 16
  const capacityRadius = baseSize + 6

  ctx.lineWidth = 2
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#111'

  // 绘制站点图形
  switch (s.shape) {
    case 'circle':
      ctx.beginPath(); ctx.arc(0,0,baseSize,0,Math.PI*2); ctx.fill(); ctx.stroke(); break
    case 'triangle':
      const triangleSize = baseSize * 1.2
      ctx.beginPath(); ctx.moveTo(0,-triangleSize); ctx.lineTo(triangleSize,triangleSize*0.8); ctx.lineTo(-triangleSize,triangleSize*0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); break
    case 'square':
      ctx.beginPath(); ctx.rect(-baseSize,-baseSize,baseSize*2,baseSize*2); ctx.fill(); ctx.stroke(); break
    case 'star':
      drawStar(ctx, 0, 0, 5, baseSize*1.2, baseSize*0.6); ctx.fill(); ctx.stroke(); break
    case 'heart':
      drawHeart(ctx, 0, 0, baseSize); ctx.fill(); ctx.stroke(); break
  }

  // 绘制容量可视化圆圈
  const totalPassengers = total(s.queueBy)
  const fillRatio = Math.min(totalPassengers / s.capacity, 1)

  // 外圈（空心）
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, capacityRadius, 0, Math.PI * 2)
  ctx.stroke()

  // 内圈（实心，根据乘客数量）
  if (fillRatio > 0) {
    ctx.fillStyle = fillRatio > 0.8 ? '#ff6b6b' : fillRatio > 0.6 ? '#ffa726' : '#66bb6a'
    ctx.beginPath()
    ctx.arc(0, 0, capacityRadius, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * fillRatio)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fill()
  }

  // 显示容量数字
  ctx.fillStyle = '#fff'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(`${totalPassengers}/${s.capacity}`, 0, capacityRadius + 16)

  // Show passenger queue with destination breakdown
  if (totalPassengers > 0) {
    ctx.textAlign = 'left'
    let yOffset = -capacityRadius - 20
    const shapes: Shape[] = ['circle', 'triangle', 'square', 'star', 'heart']
    const shapeSymbols = { circle: '●', triangle: '▲', square: '■', star: '★', heart: '♥' }

    shapes.forEach(shape => {
      if (s.queueBy[shape] > 0) {
        ctx.fillStyle = shape === 'circle' ? '#4fc3f7' : shape === 'triangle' ? '#81c784' : shape === 'square' ? '#ffb74d' : shape === 'star' ? '#ffd54f' : '#f48fb1'
        ctx.fillText(`${shapeSymbols[shape]}${s.queueBy[shape]}`, capacityRadius + 8, yOffset)
        yOffset += 12
      }
    })
  }

  ctx.restore()
}

// 绘制五角星的辅助函数
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
  let rot = Math.PI / 2 * 3
  let x = cx
  let y = cy
  const step = Math.PI / spikes

  ctx.beginPath()
  ctx.moveTo(cx, cy - outerRadius)

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius
    y = cy + Math.sin(rot) * outerRadius
    ctx.lineTo(x, y)
    rot += step

    x = cx + Math.cos(rot) * innerRadius
    y = cy + Math.sin(rot) * innerRadius
    ctx.lineTo(x, y)
    rot += step
  }

  ctx.lineTo(cx, cy - outerRadius)
  ctx.closePath()
}

// 绘制心形的辅助函数
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath()
  const topCurveHeight = size * 0.3
  ctx.moveTo(cx, cy + topCurveHeight)

  // 左半边
  ctx.bezierCurveTo(
    cx - size, cy - topCurveHeight,
    cx - size, cy - size * 0.8,
    cx, cy - size * 0.8
  )

  // 右半边
  ctx.bezierCurveTo(
    cx + size, cy - size * 0.8,
    cx + size, cy - topCurveHeight,
    cx, cy + topCurveHeight
  )

  ctx.closePath()
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line) {
  const pts = line.stations.map(id => state.stations.find(s=>s.id===id)!.pos)
  ctx.save()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.strokeStyle = line.color; ctx.lineWidth = 6
  ctx.beginPath()
  pts.forEach((p,i)=> i? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y))
  ctx.stroke()
  ctx.restore()
}

function drawTrain(ctx: CanvasRenderingContext2D, t: Train) {
  const line = state.lines.find(l=>l.id===t.lineId)!;
  if (!line || line.stations.length < 2) return; // Safety check

  // Calculate next station index based on direction
  let nextIndex: number;
  if (t.dir > 0) {
    nextIndex = Math.min(t.atIndex + 1, line.stations.length - 1);
  } else {
    nextIndex = Math.max(t.atIndex - 1, 0);
  }

  const a = state.stations.find(s=>s.id===line.stations[t.atIndex])!.pos
  const b = state.stations.find(s=>s.id===line.stations[nextIndex])!.pos
  const x = a.x + (b.x-a.x)*t.t
  const y = a.y + (b.y-a.y)*t.t
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
  // show passengers in train as small bar
  const totalP = t.passengersBy.circle + t.passengersBy.triangle + t.passengersBy.square + t.passengersBy.star + t.passengersBy.heart
  if (totalP>0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x-6,y+7, Math.min(12, totalP*2), 2) }
  // dwell indicator
  if (t.dwell > 0) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x-6,y+10, 12*(t.dwell/0.8), 2) }
  ctx.restore();
}

function update(dt: number) {
  state.time += dt
  maybeSpawnStations(dt)
  maybeEnsureBaselineLine()

  // 更新智能吸附动画
  updateAnimations(dt)

  // spawn passenger with concrete destination (reduced spawn rate)
  if (state.stations.length && Math.random() < dt * (state.passengerSpawnBaseRate + state.time*0.005)) {
    const from = state.stations[Math.floor(Math.random()*state.stations.length)]
    // choose a target station with different shape; prefer connected/reachable later
    const candidates = state.stations.filter(st => st.id!==from.id && st.shape!==from.shape)
    if (candidates.length) {
      const to = candidates[Math.floor(Math.random()*candidates.length)]
      const targetShape: Shape = to.shape
      from.queueBy[targetShape] = Math.min(99, from.queueBy[targetShape] + 1)
      from.queueTo[to.id] = from.queueTo[to.id] || zeroByShape()
      from.queueTo[to.id][targetShape] = Math.min(99, (from.queueTo[to.id][targetShape]||0) + 1)
      if (total(from.queueBy) >= QUEUE_FAIL) state.gameOver = true
    }
  }
  // trains move and service
  for (const t of state.trains) {
    const line = state.lines.find(l=>l.id===t.lineId)!;
    // handle dwell at stops
    if (t.dwell > 0) { t.dwell = Math.max(0, t.dwell - dt); continue }

    t.t += dt * 0.25
    if (t.t >= 1) {
      t.t = 0
      // advance along line with direction; reverse at ends
      const last = line.stations.length - 1

      // Check if we need to reverse direction at the ends
      if (t.dir > 0 && t.atIndex >= last) {
        t.dir = -1
        // Don't move index, just reverse direction
      } else if (t.dir < 0 && t.atIndex <= 0) {
        t.dir = 1
        // Don't move index, just reverse direction
      } else {
        // Move to next station in current direction
        t.atIndex = clamp(t.atIndex + (t.dir > 0 ? 1 : -1), 0, last)
      }

      // service station: unload/load
      const sid = line.stations[t.atIndex]
      const s = state.stations.find(st=>st.id===sid)!;
      // unload matching
      t.passengersBy[s.shape] = 0
      // dwell start
      t.dwell = Math.max(t.dwell, DWELL_TIME)
      // load by capacity left — prefer passengers whose destination is along this line direction (future: real routing)
      let capacityLeft = t.capacity - (t.passengersBy.circle + t.passengersBy.triangle + t.passengersBy.square + t.passengersBy.star + t.passengersBy.heart)
      const order: Shape[] = ['circle','triangle','square','star','heart']
      for (const sh of order) {
        if (capacityLeft <= 0) break
        // if per-destination exists, drain from any destination bucket for this shape
        let remain = capacityLeft
        for (const destIdStr of Object.keys(s.queueTo)) {
          if (remain<=0) break
          const destId = Number(destIdStr)
          const perDest = s.queueTo[destId]
          const have = perDest?.[sh] || 0
          if (have>0) {
            const take = Math.min(have, remain)
            perDest[sh] -= take
            s.queueBy[sh] -= take
            // add into train passengersTo
            t.passengersTo[destId] = t.passengersTo[destId] || zeroByShape()
            t.passengersTo[destId][sh] = (t.passengersTo[destId][sh]||0) + take
            t.passengersBy[sh] += take
            remain -= take
          }
        }
        capacityLeft = remain
      }
    }
  }
}

function render(ctx: CanvasRenderingContext2D, camera: Camera, canvas: HTMLCanvasElement) {
  ctx.save()
  ctx.setTransform(camera.scale, 0, 0, camera.scale, -camera.pos.x*camera.scale, -camera.pos.y*camera.scale)
  // clear
  ctx.fillStyle = '#111'; ctx.fillRect(camera.pos.x, camera.pos.y, canvas.width/camera.scale, canvas.height/camera.scale)
  // draw lines then stations then trains
  state.lines.forEach(l=>drawLine(ctx,l))

  // preview line if drawing
  if (interaction.drawingFrom && interaction.previewTo) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#aaa'; ctx.lineWidth = 4
    ctx.beginPath();
    const a = interaction.drawingFrom.pos
    ctx.moveTo(a.x, a.y)
    const b = interaction.previewTo
    ctx.lineTo(b.x, b.y)
    ctx.stroke();
    ctx.restore();
  }

  // 绘制智能吸附的视觉反馈
  drawSmartAttachmentFeedback(ctx)

  state.stations.forEach(s=>drawStation(ctx,s))
  state.trains.forEach(t=>drawTrain(ctx,t))
  ctx.restore()
}

function drawSmartAttachmentFeedback(ctx: CanvasRenderingContext2D) {
  if (!smartAttachment.isDraggingLine || !smartAttachment.activeCandidate) return

  const candidate = smartAttachment.activeCandidate
  const station = candidate.station
  const intensity = smartAttachment.highlightIntensity

  ctx.save()

  // 动态高亮目标站点
  const highlightColor = `rgba(0, 255, 136, ${intensity})`
  ctx.strokeStyle = highlightColor
  ctx.lineWidth = 3 + intensity * 2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(station.pos.x, station.pos.y, 25 + intensity * 5, 0, Math.PI * 2)
  ctx.stroke()

  // 绘制吸附预览线
  if (smartAttachment.currentDragPos) {
    ctx.strokeStyle = highlightColor
    ctx.lineWidth = 2 + intensity
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(smartAttachment.currentDragPos.x, smartAttachment.currentDragPos.y)
    ctx.lineTo(station.pos.x, station.pos.y)
    ctx.stroke()

    // 绘制投影点
    ctx.fillStyle = highlightColor
    ctx.beginPath()
    ctx.arc(candidate.projectionPoint.x, candidate.projectionPoint.y, 4 + intensity * 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制拖拽指示器
  if (smartAttachment.currentDragPos) {
    ctx.fillStyle = `rgba(0, 255, 136, ${0.3 + intensity * 0.2})`
    ctx.beginPath()
    ctx.arc(smartAttachment.currentDragPos.x, smartAttachment.currentDragPos.y, 8 + intensity * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = highlightColor
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(smartAttachment.currentDragPos.x, smartAttachment.currentDragPos.y, 8 + intensity * 2, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 绘制动画效果
  for (const anim of smartAttachment.animations) {
    if (anim.type === 'attachment') {
      const alpha = 1 - anim.progress
      ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`
      ctx.lineWidth = 3
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(anim.to.x, anim.to.y, 20 * anim.progress, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.restore()
}



function setupInput(canvas: HTMLCanvasElement, camera: Camera) {
  let isPanning = false
  let pinchDist0 = 0
  let pointers: Map<number, Vec2> = new Map()

  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)
    if (pointers.size === 1) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)
      const s = hitTestStation(world)

      // 检查是否点击了线路（用于拖拽）
      const lineSegment = hitTestLineSegment(world, 15)

      if (interaction.drawingFrom) {
        // Second tap: show link chooser
        const target = s ?? nearestStationWithin(world, 20)
        if (target && target.id !== interaction.drawingFrom.id) {
          showLinkChooser(interaction.drawingFrom, target)
        }
        interaction.drawingFrom = null
        interaction.previewTo = null
        return
      } else {
        if (s) {
          // First tap: start drawing from station
          interaction.drawingFrom = s
          interaction.previewTo = { ...s.pos }
          isPanning = false
          return
        } else if (lineSegment) {
          // 开始拖拽线路
          startLineDrag(lineSegment, world)
          isPanning = false
          return
        } else if (!s) {
          // Start panning if not tapping a station or line
          // If previously in drawing mode, a blank tap cancels
          if (interaction.drawingFrom) {
            interaction.drawingFrom = null
            interaction.previewTo = null
            interaction.selectedLine = null // Reset selected line on cancel
            hideLinkChooser()
          }
          isPanning = true
        }
      }
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)

      if (smartAttachment.isDraggingLine) {
        // 更新线路拖拽
        updateLineDrag(world)
        return
      } else if (interaction.drawingFrom) {
        // update preview (snap preview to nearest station within 20px)
        const snapped = nearestStationWithin(world, 20)
        interaction.previewTo = snapped ? { ...snapped.pos } : world
        // Prevent panning while drawing
        return
      } else if (isPanning && prev) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        camera.pos.x -= dx / camera.scale
        camera.pos.y -= dy / camera.scale
      }
    } else if (pointers.size === 2) {
      const [a,b] = [...pointers.values()]
      const d = Math.hypot(a.x-b.x, a.y-b.y)
      if (pinchDist0 === 0) pinchDist0 = d
      const factor = d / pinchDist0
      const center = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }
      const worldBefore = camera.toWorld(center)
      camera.scale = clamp(camera.scale * factor, 0.5, 3)
      const worldAfter = camera.toWorld(center)
      camera.pos.x += worldBefore.x - worldAfter.x
      camera.pos.y += worldBefore.y - worldAfter.y
      pinchDist0 = d
    }
  }
  function onPointerUp(e: PointerEvent) {
    // 处理线路拖拽结束
    if (smartAttachment.isDraggingLine) {
      const attachmentMade = endLineDrag()
      if (attachmentMade) {
        // 吸附成功，可以添加一些反馈
        console.log('智能吸附成功！')
      }
    }

    // finish drawing if released on a station
    if (interaction.drawingFrom) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)
      const target = hitTestStation(world)
      if (target && target.id !== interaction.drawingFrom.id) {
        // Show link chooser instead of directly toggling line
        showLinkChooser(interaction.drawingFrom, target)
      }
      interaction.drawingFrom = null
      interaction.previewTo = null
      interaction.selectedLine = null // Reset selected line on pointer up
    }

    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchDist0 = 0
    if (pointers.size === 0) { isPanning = false }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

  // Prevent iOS context menu and selection gestures on canvas
  canvas.addEventListener('contextmenu', (e)=> e.preventDefault())
  canvas.addEventListener('selectstart', (e)=> e.preventDefault())

  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const mouse: Vec2 = { x: e.clientX, y: e.clientY }
    const worldBefore = camera.toWorld(mouse)
    camera.scale = clamp(camera.scale * factor, 0.5, 3)
    const worldAfter = camera.toWorld(mouse)
    camera.pos.x += worldBefore.x - worldAfter.x
    camera.pos.y += worldBefore.y - worldAfter.y
  }, { passive: false })
}


function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const hud = document.getElementById('hud') as HTMLDivElement
  const { ctx } = setupCanvas(canvas)
  const camera = new Camera()
  setupInput(canvas, camera)
  spawnInitialWorld()

  // Initialize UI
  renderLinesPanel()

  // loop with fixed timestep
  let last = performance.now()
  let acc = 0
  const step = 1/30 // 30Hz logic
  function frame(now: number) {
    const dt = (now - last) / 1000; last = now; acc += Math.min(dt, 0.1)
    while (acc >= step) { update(step); acc -= step }
    render(ctx, camera, canvas)
    hud.textContent = `t=${state.time.toFixed(1)} s | stations=${state.stations.length} | trains=${state.trains.length}`
    requestAnimationFrame(frame)
  // UI buttons
  const btnAuto = document.getElementById('toggle-auto') as HTMLButtonElement
  const btnSpawn = document.getElementById('spawn-one') as HTMLButtonElement
  const btnOnConnect = document.getElementById('spawn-on-connect') as HTMLButtonElement
  if (btnAuto && btnSpawn && btnOnConnect) {
    const updateLabels = ()=>{
      btnAuto.textContent = `Auto Spawn: ${state.autoSpawnEnabled? 'On':'Off'}`
      btnOnConnect.textContent = `Spawn on Connect: ${state.spawnOnConnect? 'On':'Off'}`
    }
    btnAuto.onclick = ()=> { state.autoSpawnEnabled = !state.autoSpawnEnabled; updateLabels() }
    btnOnConnect.onclick = ()=> { state.spawnOnConnect = !state.spawnOnConnect; updateLabels() }
    btnSpawn.onclick = ()=> {
      const pos = { x: camera.pos.x + (Math.random()*0.6+0.2)* ( canvas.width / camera.scale ),
                    y: camera.pos.y + (Math.random()*0.6+0.2)* ( canvas.height / camera.scale ) }
      const shapes: Station['shape'][] = ['circle','triangle','square','star','heart']
      addStation(pos, shapes[Math.floor(Math.random()*shapes.length)])
    }
    updateLabels()
  }

  // 乘客生成概率滑块 (每秒乘客数)
  const passengerRateSlider = document.getElementById('passenger-rate') as HTMLInputElement
  const passengerRateValue = document.getElementById('passenger-rate-value') as HTMLSpanElement
  if (passengerRateSlider && passengerRateValue) {
    // 将概率转换为每秒乘客数显示 (概率 * 10)
    const passengersPerSecond = state.passengerSpawnBaseRate * 10
    passengerRateSlider.value = passengersPerSecond.toString()
    passengerRateValue.textContent = passengersPerSecond.toString()
    passengerRateSlider.oninput = () => {
      const passengersPerSecond = parseFloat(passengerRateSlider.value)
      // 将每秒乘客数转换为概率 (每秒乘客数 / 10)
      state.passengerSpawnBaseRate = passengersPerSecond * 0.1
      passengerRateValue.textContent = passengersPerSecond.toString()
    }
  }

  // HUD actions: +Train / Capacity +1 / Lines list and New Line
  const btnAddTrain = document.getElementById('btn-add-train') as HTMLButtonElement
  const btnCap = document.getElementById('btn-capacity') as HTMLButtonElement

  if (btnAddTrain) {
    btnAddTrain.onclick = () => {
      if (state.currentLineId == null) return
      state.trains.push({
        id: nextId++,
        lineId: state.currentLineId,
        atIndex: 0,
        t: 0,
        dir: 1,
        capacity: 6,
        passengersBy: zeroByShape(),
        passengersTo: {},
        dwell: 0
      })
    }
  }

  if (btnCap) {
    btnCap.onclick = () => {
      if (state.currentLineId == null) return
      state.trains.filter(t => t.lineId === state.currentLineId).forEach(t => t.capacity += 1)
    }
  }

  }
  requestAnimationFrame(frame)
}

main()
