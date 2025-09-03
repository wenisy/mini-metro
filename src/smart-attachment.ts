import type { Vec2, LineSegment, AttachmentCandidate, SmartAttachmentState, Animation } from './types.js'
import { state, dist2 } from './game-state.js'

// 智能吸附状态
export const smartAttachment: SmartAttachmentState = {
  isDraggingLine: false,
  draggedSegment: null,
  dragStartPos: null,
  currentDragPos: null,
  attachmentCandidates: [],
  activeCandidate: null,
  snapThreshold: 75,
  minSnapThreshold: 50,
  animations: [],
  highlightIntensity: 0,
  highlightDirection: 1,
}

// 线路段删除状态
export const segmentDeletion = {
  hoveredSegment: null as LineSegment | null,
  deleteMode: false,
  confirmationTimeout: null as number | null,
}

// 距离计算函数
export function pointToLineSegmentDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): { distance: number, projection: Vec2 } {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    const distance = Math.sqrt(dist2(point, lineStart))
    return { distance, projection: { ...lineStart } }
  }

  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared))

  const projection = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy
  }

  const distance = Math.sqrt(dist2(point, projection))

  return { distance, projection }
}

// 获取所有线段
export function getAllLineSegments(): LineSegment[] {
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

// 查找吸附候选
export function findAttachmentCandidates(targetStation: any): AttachmentCandidate[] {
  const candidates: AttachmentCandidate[] = []
  const segments = getAllLineSegments()

  for (const segment of segments) {
    const line = state.lines.find(l => l.id === segment.lineId)!
    if (line.stations.includes(targetStation.id)) continue

    const { distance, projection } = pointToLineSegmentDistance(
      targetStation.pos,
      segment.startPos,
      segment.endPos
    )

    if (distance >= smartAttachment.minSnapThreshold && distance <= smartAttachment.snapThreshold) {
      const distToStart = Math.sqrt(dist2(targetStation.pos, segment.startPos))
      const distToEnd = Math.sqrt(dist2(targetStation.pos, segment.endPos))
      const isNearEndpoint = distToStart <= smartAttachment.snapThreshold || distToEnd <= smartAttachment.snapThreshold

      candidates.push({
        station: targetStation,
        line,
        insertIndex: segment.segmentIndex + 1,
        distance,
        attachmentType: isNearEndpoint ? 'endpoint' : 'middle',
        projectionPoint: projection
      })
    }
  }

  // 智能排序：优先考虑当前选中的线路
  candidates.sort((a, b) => {
    // 如果有当前选中的线路，优先选择它
    if (state.currentLineId) {
      const aIsCurrentLine = a.line.id === state.currentLineId
      const bIsCurrentLine = b.line.id === state.currentLineId

      if (aIsCurrentLine && !bIsCurrentLine) return -1
      if (!aIsCurrentLine && bIsCurrentLine) return 1
    }

    // 如果都是或都不是当前线路，按距离排序
    return a.distance - b.distance
  })

  return candidates
}

// 线段点击检测
export function hitTestLineSegment(p: Vec2, threshold: number = 15): LineSegment | null {
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

// 更新吸附候选
export function updateAttachmentCandidates(dragPos: Vec2): void {
  smartAttachment.attachmentCandidates = []
  smartAttachment.activeCandidate = null

  for (const station of state.stations) {
    const distance = Math.sqrt(dist2(dragPos, station.pos))
    if (distance <= smartAttachment.snapThreshold) {
      const candidates = findAttachmentCandidates(station)
      smartAttachment.attachmentCandidates.push(...candidates)
    }
  }

  // 对所有候选进行智能排序
  smartAttachment.attachmentCandidates.sort((a, b) => {
    // 如果有当前选中的线路，优先选择它
    if (state.currentLineId) {
      const aIsCurrentLine = a.line.id === state.currentLineId
      const bIsCurrentLine = b.line.id === state.currentLineId

      if (aIsCurrentLine && !bIsCurrentLine) return -1
      if (!aIsCurrentLine && bIsCurrentLine) return 1
    }

    // 如果都是或都不是当前线路，按距离排序
    return a.distance - b.distance
  })

  if (smartAttachment.attachmentCandidates.length > 0) {
    smartAttachment.activeCandidate = smartAttachment.attachmentCandidates[0]
    const currentLineText = state.currentLineId && smartAttachment.activeCandidate.line.id === state.currentLineId ? ' (当前线路)' : ''
    console.log(`找到吸附候选: ${smartAttachment.activeCandidate.station.shape} → ${smartAttachment.activeCandidate.line.name}${currentLineText}, 距离: ${smartAttachment.activeCandidate.distance.toFixed(1)}`)
  }
}

// 拖拽控制函数
export function startLineDrag(segment: LineSegment, startPos: Vec2): void {
  smartAttachment.isDraggingLine = true
  smartAttachment.draggedSegment = segment
  smartAttachment.dragStartPos = startPos
  smartAttachment.currentDragPos = startPos
  smartAttachment.attachmentCandidates = []
  smartAttachment.activeCandidate = null
}

export function updateLineDrag(currentPos: Vec2): void {
  if (!smartAttachment.isDraggingLine) return

  smartAttachment.currentDragPos = currentPos
  updateAttachmentCandidates(currentPos)
}

export function endLineDrag(): boolean {
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

// 执行吸附
export function performAttachment(candidate: AttachmentCandidate): boolean {
  const line = candidate.line
  const station = candidate.station

  if (line.stations.includes(station.id)) {
    return false
  }

  if (!isValidAttachment(candidate)) {
    return false
  }

  // 创建吸附动画
  if (smartAttachment.currentDragPos) {
    createAttachmentAnimation(smartAttachment.currentDragPos, station.pos)
  }

  // 执行吸附
  if (candidate.attachmentType === 'endpoint') {
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
    line.stations.splice(candidate.insertIndex, 0, station.id)
  }

  return true
}

// 验证吸附有效性
export function isValidAttachment(candidate: AttachmentCandidate): boolean {
  const line = candidate.line
  const station = candidate.station
  const minDistance = 30

  if (candidate.attachmentType === 'endpoint') {
    const firstStation = state.stations.find(s => s.id === line.stations[0])!
    const lastStation = state.stations.find(s => s.id === line.stations[line.stations.length - 1])!

    const distToFirst = Math.sqrt(dist2(station.pos, firstStation.pos))
    const distToLast = Math.sqrt(dist2(station.pos, lastStation.pos))

    return distToFirst >= minDistance && distToLast >= minDistance
  } else {
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

// 动画函数
export function updateAnimations(dt: number): void {
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

export function createAttachmentAnimation(from: Vec2, to: Vec2): void {
  const animation: Animation = {
    id: Date.now(),
    type: 'attachment',
    startTime: performance.now(),
    duration: 300,
    from: { ...from },
    to: { ...to },
    progress: 0,
    completed: false
  }
  smartAttachment.animations.push(animation)
}

// 线路段删除功能
export function enableSegmentDeletionMode(): void {
  segmentDeletion.deleteMode = true
  console.log('线路段删除模式已启用')
}

export function disableSegmentDeletionMode(): void {
  segmentDeletion.deleteMode = false
  segmentDeletion.hoveredSegment = null
  if (segmentDeletion.confirmationTimeout) {
    clearTimeout(segmentDeletion.confirmationTimeout)
    segmentDeletion.confirmationTimeout = null
  }
  console.log('线路段删除模式已禁用')
}

export function updateSegmentHover(mousePos: Vec2): void {
  if (!segmentDeletion.deleteMode) return

  const segment = hitTestLineSegment(mousePos, 20) // 更大的检测范围
  segmentDeletion.hoveredSegment = segment
}

export function attemptSegmentDeletion(mousePos: Vec2): boolean {
  if (!segmentDeletion.deleteMode) return false

  const segment = hitTestLineSegment(mousePos, 20)
  if (!segment) return false

  const line = state.lines.find(l => l.id === segment.lineId)
  if (!line) return false

  // 确认删除
  const startStation = state.stations.find(s => s.id === segment.startStationId)
  const endStation = state.stations.find(s => s.id === segment.endStationId)

  if (!startStation || !endStation) return false

  const confirmed = confirm(
    `确定要删除线路段 ${startStation.shape} → ${endStation.shape} 吗？\n` +
    `这可能会将 ${line.name} 分割成两条独立的线路。`
  )

  if (confirmed) {
    return deleteLineSegment(segment)
  }

  return false
}

export function deleteLineSegment(segment: LineSegment): boolean {
  const line = state.lines.find(l => l.id === segment.lineId)
  if (!line || line.stations.length < 3) {
    // 如果线路只有2个站点，删除整条线路
    if (line) {
      import('./game-state.js').then(({ removeLine }) => {
        removeLine(line.id)
      })
    }
    return true
  }

  // 分割线路
  return splitLineAtSegment(line, segment)
}

function splitLineAtSegment(line: any, segment: LineSegment): boolean {
  const segmentIndex = segment.segmentIndex

  // 分割点：在segmentIndex和segmentIndex+1之间
  const firstPart = line.stations.slice(0, segmentIndex + 1)
  const secondPart = line.stations.slice(segmentIndex + 1)

  if (firstPart.length < 2 || secondPart.length < 2) {
    // 如果任一部分少于2个站点，删除整条线路
    import('./game-state.js').then(({ removeLine }) => {
      removeLine(line.id)
    })
    return true
  }

  // 动态导入以避免循环依赖
  import('./game-state.js').then(({ COLORS, addLine, removeLine, getNextAvailableLineNumber }) => {
    // 智能命名：为分割后的线路生成合适的名称
    const originalName = line.name
    const isNumberedLine = /(\d+)号线/.test(originalName)

    let newLine1Name: string
    let newLine2Name: string

    if (isNumberedLine) {
      // 如果是数字编号线路，使用分支命名
      const match = originalName.match(/(\d+)号线/)
      const baseNumber = match ? match[1] : '1'
      newLine1Name = `${baseNumber}号线A`
      newLine2Name = `${baseNumber}号线B`
    } else {
      // 非数字线路，使用新的数字编号
      const newLineNumber1 = getNextAvailableLineNumber()
      const newLineNumber2 = getNextAvailableLineNumber() + 1
      newLine1Name = `${newLineNumber1}号线`
      newLine2Name = `${newLineNumber2}号线`
    }

    // 创建第一条新线路
    const firstStations = firstPart.map((id: number) => state.stations.find(s => s.id === id)!)
    const newLine1 = addLine(line.color, firstStations[0], firstStations[1], newLine1Name)

    if (!newLine1) {
      console.error('无法创建第一条新线路')
      return false
    }

    // 添加剩余站点到第一条线路
    for (let i = 2; i < firstStations.length; i++) {
      newLine1.stations.push(firstStations[i].id)
    }

    // 创建第二条新线路（使用不同颜色）
    const secondStations = secondPart.map((id: number) => state.stations.find(s => s.id === id)!)
    const newColor = COLORS[(state.lines.length) % COLORS.length]
    const newLine2 = addLine(newColor, secondStations[0], secondStations[1], newLine2Name)

    if (!newLine2) {
      console.error('无法创建第二条新线路')
      return false
    }

    // 添加剩余站点到第二条线路
    for (let i = 2; i < secondStations.length; i++) {
      newLine2.stations.push(secondStations[i].id)
    }

    // 转移列车到新线路
    const originalTrains = state.trains.filter(t => t.lineId === line.id)
    originalTrains.forEach(train => {
      // 根据列车当前位置决定分配到哪条线路
      if (train.atIndex <= segmentIndex) {
        train.lineId = newLine1.id
        // 调整索引范围
        train.atIndex = Math.min(train.atIndex, newLine1.stations.length - 1)
      } else {
        train.lineId = newLine2.id
        // 调整索引
        train.atIndex = train.atIndex - (segmentIndex + 1)
        train.atIndex = Math.max(0, Math.min(train.atIndex, newLine2.stations.length - 1))
      }
    })

    // 删除原线路
    removeLine(line.id)

    console.log(`线路 ${line.name} 已分割为 ${newLine1.name} 和 ${newLine2.name}`)
  })

  return true
}
