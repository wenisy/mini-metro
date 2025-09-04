import type { Vec2, Station, Line, Train, Shape } from './types.js'
import { state, total, isTransferStation, getStationLineCount, moneyEffects } from './game-state.js'
import { getTotalWaitingPassengers, getStationCongestionLevel } from './smart-passenger.js'
import { smartAttachment, segmentDeletion } from './smart-attachment.js'
import { getTrainDisplayLength, getTrainDisplayColor, getPulseIntensity, trainVisualConfig, getLoadRatio, getTrainShadowIntensity, shouldShowWarning } from './train-visual.js'

// 相机类
export class Camera {
  pos: Vec2 = { x: 0, y: 0 }
  scale = 1

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.pos.x) * this.scale, y: (p.y - this.pos.y) * this.scale }
  }

  toWorld(p: Vec2): Vec2 {
    return { x: p.x / this.scale + this.pos.x, y: p.y / this.scale + this.pos.y }
  }
}

// 全局摄像机实例引用
export let globalCamera: Camera | null = null

// 设置全局摄像机引用
export function setGlobalCamera(camera: Camera): void {
  globalCamera = camera
}

// 绘制站点
export function drawStation(ctx: CanvasRenderingContext2D, s: Station): void {
  ctx.save()
  ctx.translate(s.pos.x, s.pos.y)

  const baseSize = s.size === 'small' ? 8 : s.size === 'medium' ? 12 : 16
  const capacityRadius = baseSize + 6

  // 检查站点是否在聚焦线路上
  const isOnFocusedLine = state.focusedLineId !== null &&
    state.lines.find(l => l.id === state.focusedLineId)?.stations.includes(s.id)
  const hasFocusedLine = state.focusedLineId !== null

  ctx.lineWidth = 2
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#111'

  // 应用聚焦效果
  if (hasFocusedLine && !isOnFocusedLine) {
    // 不在聚焦线路上的站点：降低透明度
    ctx.globalAlpha = 0.4
  }

  // 绘制站点图形
  switch (s.shape) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, baseSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    case 'triangle':
      const triangleSize = baseSize * 1.2
      ctx.beginPath()
      ctx.moveTo(0, -triangleSize)
      ctx.lineTo(triangleSize, triangleSize * 0.8)
      ctx.lineTo(-triangleSize, triangleSize * 0.8)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'square':
      ctx.beginPath()
      ctx.rect(-baseSize, -baseSize, baseSize * 2, baseSize * 2)
      ctx.fill()
      ctx.stroke()
      break
    case 'star':
      drawStar(ctx, 0, 0, 5, baseSize * 1.2, baseSize * 0.6)
      ctx.fill()
      ctx.stroke()
      break
    case 'heart':
      drawHeart(ctx, 0, 0, baseSize)
      ctx.fill()
      ctx.stroke()
      break
  }

  // 绘制容量可视化圆圈（使用智能乘客系统）
  const totalPassengers = getTotalWaitingPassengers(s)
  const congestionLevel = getStationCongestionLevel(s)
  const fillRatio = Math.min(totalPassengers / s.capacity, 1)

  // 外圈（空心）
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, capacityRadius, 0, Math.PI * 2)
  ctx.stroke()

  // 内圈（实心，根据拥堵程度着色）
  if (fillRatio > 0) {
    switch (congestionLevel) {
      case 'low':
        ctx.fillStyle = '#66bb6a' // 绿色
        break
      case 'medium':
        ctx.fillStyle = '#ffa726' // 橙色
        break
      case 'high':
        ctx.fillStyle = '#ff6b6b' // 红色
        break
      case 'critical':
        ctx.fillStyle = '#d32f2f' // 深红色
        break
    }

    ctx.beginPath()
    ctx.arc(0, 0, capacityRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fillRatio)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fill()
  }

  // 显示容量数字和换乘信息
  ctx.fillStyle = '#fff'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'

  // 显示等待乘客数（普通 + 换乘）
  const waitingCount = s.waitingPassengers.length
  const transferCount = s.transferPassengers.length
  if (transferCount > 0) {
    ctx.fillText(`${waitingCount}+${transferCount}/${s.capacity}`, 0, capacityRadius + 16)
  } else {
    ctx.fillText(`${totalPassengers}/${s.capacity}`, 0, capacityRadius + 16)
  }

  // 换乘站标识和拥堵警告
  if (isTransferStation(s.id)) {
    const lineCount = getStationLineCount(s.id)
    ctx.fillStyle = '#ffd700' // 金色
    ctx.font = '8px system-ui'
    ctx.fillText(`换乘(${lineCount})`, 0, capacityRadius + 28)

    // 显示换乘乘客数量
    if (transferCount > 0) {
      ctx.fillStyle = '#ff9800'
      ctx.fillText(`🔄${transferCount}`, 0, capacityRadius + 40)
    }
  }

  // 拥堵警告
  if (congestionLevel === 'critical') {
    ctx.fillStyle = '#ff1744'
    ctx.font = 'bold 8px system-ui'
    ctx.fillText('⚠️拥堵', 0, capacityRadius + (isTransferStation(s.id) ? 52 : 40))
  }

  // 显示乘客队列详情
  if (totalPassengers > 0) {
    ctx.textAlign = 'left'
    let yOffset = -capacityRadius - 20
    const shapes: Shape[] = ['circle', 'triangle', 'square', 'star', 'heart']
    const shapeSymbols = { circle: '●', triangle: '▲', square: '■', star: '★', heart: '♥' }

    shapes.forEach(shape => {
      if (s.queueBy[shape] > 0) {
        ctx.fillStyle = shape === 'circle' ? '#4fc3f7' :
          shape === 'triangle' ? '#81c784' :
            shape === 'square' ? '#ffb74d' :
              shape === 'star' ? '#ffd54f' : '#f48fb1'
        ctx.fillText(`${shapeSymbols[shape]}${s.queueBy[shape]}`, capacityRadius + 8, yOffset)
        yOffset += 12
      }
    })
  }

  ctx.restore()
}

// 绘制五角星
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number): void {
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

// 绘制心形
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
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

// 绘制线路
export function drawLine(ctx: CanvasRenderingContext2D, line: Line): void {
  const pts = line.stations.map(id => state.stations.find(s => s.id === id)!.pos)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // 检查是否有聚焦线路
  const isFocused = state.focusedLineId === line.id
  const hasFocusedLine = state.focusedLineId !== null

  if (hasFocusedLine) {
    if (isFocused) {
      // 聚焦线路：增加宽度，提高亮度，添加发光效果
      ctx.strokeStyle = line.color
      ctx.lineWidth = 10

      // 添加发光效果
      ctx.shadowColor = line.color
      ctx.shadowBlur = 8
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      // 非聚焦线路：降低透明度
      ctx.strokeStyle = line.color
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 6
    }
  } else {
    // 没有聚焦线路时的正常显示
    ctx.strokeStyle = line.color
    ctx.lineWidth = 6
  }

  ctx.beginPath()
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
  ctx.stroke()
  ctx.restore()
}

// 绘制列车（带性能优化）
export function drawTrain(ctx: CanvasRenderingContext2D, t: Train): void {
  const line = state.lines.find(l => l.id === t.lineId)!
  if (!line || line.stations.length < 2) return

  // 性能优化：检查列车是否在视野内
  // 这里可以添加视锥剔除逻辑，但为了简化暂时跳过

  let nextIndex: number
  if (t.dir > 0) {
    nextIndex = Math.min(t.atIndex + 1, line.stations.length - 1)
  } else {
    nextIndex = Math.max(t.atIndex - 1, 0)
  }

  const a = state.stations.find(s => s.id === line.stations[t.atIndex])!.pos
  const b = state.stations.find(s => s.id === line.stations[nextIndex])!.pos
  const x = a.x + (b.x - a.x) * t.t
  const y = a.y + (b.y - a.y) * t.t

  ctx.save()

  // 检查列车是否在聚焦线路上
  const isOnFocusedLine = state.focusedLineId === t.lineId
  const hasFocusedLine = state.focusedLineId !== null

  // 应用聚焦效果
  if (hasFocusedLine && !isOnFocusedLine) {
    // 不在聚焦线路上的列车：降低透明度
    ctx.globalAlpha = 0.4
  }

  // 使用新的视觉系统获取列车属性
  const trainLength = getTrainDisplayLength(t)
  const trainColor = getTrainDisplayColor(t)
  const pulseIntensity = t.visual ? getPulseIntensity(t.visual) : 0
  const shadowIntensity = getTrainShadowIntensity(t)
  const showWarning = shouldShowWarning(t)

  // 计算载客状态
  const totalP = total(t.passengersBy)
  const loadRatio = getLoadRatio(t)

  // 计算列车方向向量
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const dirX = dx / distance
  const dirY = dy / distance

  // 计算垂直于方向的向量（用于列车宽度）
  const perpX = -dirY
  const perpY = dirX

  // 列车宽度（增大宽度让列车更明显）
  const trainWidth = 10

  // 应用脉冲效果（满载时）
  const pulseScale = 1 + pulseIntensity * 0.1
  const effectiveLength = trainLength * pulseScale
  const effectiveWidth = trainWidth * pulseScale
  const halfLength = effectiveLength / 2
  const halfWidth = effectiveWidth / 2

  // 绘制阴影（增强阴影效果）
  if (shadowIntensity > 0.15) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(shadowIntensity * 1.2, 0.4)})`
    ctx.beginPath()
    const shadowOffset = 3 // 增大阴影偏移
    ctx.moveTo(x - dirX * halfLength - perpX * halfWidth + shadowOffset, y - dirY * halfLength - perpY * halfWidth + shadowOffset)
    ctx.lineTo(x + dirX * halfLength - perpX * halfWidth + shadowOffset, y + dirY * halfLength - perpY * halfWidth + shadowOffset)
    ctx.lineTo(x + dirX * halfLength + perpX * halfWidth + shadowOffset, y + dirY * halfLength + perpY * halfWidth + shadowOffset)
    ctx.lineTo(x - dirX * halfLength + perpX * halfWidth + shadowOffset, y - dirY * halfLength + perpY * halfWidth + shadowOffset)
    ctx.closePath()
    ctx.fill()
  }

  // 绘制列车主体（矩形）
  ctx.fillStyle = trainColor
  ctx.beginPath()

  ctx.moveTo(x - dirX * halfLength - perpX * halfWidth, y - dirY * halfLength - perpY * halfWidth)
  ctx.lineTo(x + dirX * halfLength - perpX * halfWidth, y + dirY * halfLength - perpY * halfWidth)
  ctx.lineTo(x + dirX * halfLength + perpX * halfWidth, y + dirY * halfLength + perpY * halfWidth)
  ctx.lineTo(x - dirX * halfLength + perpX * halfWidth, y - dirY * halfLength + perpY * halfWidth)
  ctx.closePath()
  ctx.fill()

  // 警告效果（接近满载时的边框闪烁）
  if (showWarning) {
    const warningAlpha = pulseIntensity > 0 ? 0.6 + pulseIntensity * 0.4 : 0.4
    ctx.strokeStyle = `rgba(255, 152, 0, ${warningAlpha})` // 更鲜明的橙色
    ctx.lineWidth = 3 // 更粗的警告边框
    ctx.stroke()

    // 满载时添加外圈光晕效果
    if (loadRatio >= trainVisualConfig.capacity.thresholds.full && pulseIntensity > 0) {
      ctx.strokeStyle = `rgba(244, 67, 54, ${pulseIntensity * 0.6})`
      ctx.lineWidth = 1
      ctx.beginPath()
      const glowOffset = 2
      ctx.moveTo(x - dirX * (halfLength + glowOffset) - perpX * (halfWidth + glowOffset), y - dirY * (halfLength + glowOffset) - perpY * (halfWidth + glowOffset))
      ctx.lineTo(x + dirX * (halfLength + glowOffset) - perpX * (halfWidth + glowOffset), y + dirY * (halfLength + glowOffset) - perpY * (halfWidth + glowOffset))
      ctx.lineTo(x + dirX * (halfLength + glowOffset) + perpX * (halfWidth + glowOffset), y + dirY * (halfLength + glowOffset) + perpY * (halfWidth + glowOffset))
      ctx.lineTo(x - dirX * (halfLength + glowOffset) + perpX * (halfWidth + glowOffset), y - dirY * (halfLength + glowOffset) + perpY * (halfWidth + glowOffset))
      ctx.closePath()
      ctx.stroke()
    }
  }

  // 绘制列车边框（增强边框）
  ctx.strokeStyle = trainVisualConfig.capacity.colors.border
  ctx.lineWidth = 2 // 增加边框宽度
  ctx.stroke()

  // 添加内部高光效果
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  const innerOffset = 1
  ctx.moveTo(x - dirX * (halfLength - innerOffset) - perpX * (halfWidth - innerOffset), y - dirY * (halfLength - innerOffset) - perpY * (halfWidth - innerOffset))
  ctx.lineTo(x + dirX * (halfLength - innerOffset) - perpX * (halfWidth - innerOffset), y + dirY * (halfLength - innerOffset) - perpY * (halfWidth - innerOffset))
  ctx.lineTo(x + dirX * (halfLength - innerOffset) + perpX * (halfWidth - innerOffset), y + dirY * (halfLength - innerOffset) + perpY * (halfWidth - innerOffset))
  ctx.lineTo(x - dirX * (halfLength - innerOffset) + perpX * (halfWidth - innerOffset), y - dirY * (halfLength - innerOffset) + perpY * (halfWidth - innerOffset))
  ctx.closePath()
  ctx.stroke()

  // 载客进度条已移除 - 车身颜色已经能够表示载客状态

  // 显示列车内乘客数量
  if (totalP > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.font = 'bold 9px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`${totalP}/${t.capacity}`, x, y + 1)
  }

  ctx.restore()
}

// 绘制智能吸附反馈
export function drawSmartAttachmentFeedback(ctx: CanvasRenderingContext2D): void {
  if (!smartAttachment.isDraggingLine || !smartAttachment.activeCandidate) return

  const candidate = smartAttachment.activeCandidate
  const station = candidate.station
  const intensity = smartAttachment.highlightIntensity
  const isCurrentLine = state.currentLineId === candidate.line.id

  ctx.save()

  // 根据是否为当前线路选择不同的高亮颜色
  const highlightColor = isCurrentLine
    ? `rgba(0, 255, 136, ${intensity})` // 绿色：当前线路
    : `rgba(255, 165, 0, ${intensity})`  // 橙色：其他线路

  // 动态高亮目标站点
  ctx.strokeStyle = highlightColor
  ctx.lineWidth = isCurrentLine ? 4 + intensity * 2 : 3 + intensity * 2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(station.pos.x, station.pos.y, 25 + intensity * 5, 0, Math.PI * 2)
  ctx.stroke()

  // 高亮目标线路
  const targetLine = candidate.line
  if (targetLine.stations.length >= 2) {
    ctx.strokeStyle = isCurrentLine
      ? `rgba(0, 255, 136, ${0.6 + intensity * 0.4})`
      : `rgba(255, 165, 0, ${0.6 + intensity * 0.4})`
    ctx.lineWidth = isCurrentLine ? 6 : 4
    ctx.setLineDash([8, 4])

    ctx.beginPath()
    for (let i = 0; i < targetLine.stations.length - 1; i++) {
      const startStation = state.stations.find(s => s.id === targetLine.stations[i])
      const endStation = state.stations.find(s => s.id === targetLine.stations[i + 1])

      if (startStation && endStation) {
        if (i === 0) {
          ctx.moveTo(startStation.pos.x, startStation.pos.y)
        }
        ctx.lineTo(endStation.pos.x, endStation.pos.y)
      }
    }
    ctx.stroke()
  }

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
    const dragColor = isCurrentLine
      ? `rgba(0, 255, 136, ${0.3 + intensity * 0.2})`
      : `rgba(255, 165, 0, ${0.3 + intensity * 0.2})`

    ctx.fillStyle = dragColor
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

  // 绘制线路名称提示
  if (smartAttachment.currentDragPos) {
    const textColor = isCurrentLine ? '#00ff88' : '#ffa500'
    const prefix = isCurrentLine ? '✓ ' : '→ '
    const text = `${prefix}${candidate.line.name}`

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.font = 'bold 12px system-ui'
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const textHeight = 16

    const textX = smartAttachment.currentDragPos.x + 15
    const textY = smartAttachment.currentDragPos.y - 15

    // 绘制背景
    ctx.fillRect(textX - 4, textY - textHeight + 2, textWidth + 8, textHeight + 4)

    // 绘制文本
    ctx.fillStyle = textColor
    ctx.fillText(text, textX, textY)
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

// 绘制线路段删除反馈
export function drawSegmentDeletionFeedback(ctx: CanvasRenderingContext2D): void {
  if (!segmentDeletion.deleteMode || !segmentDeletion.hoveredSegment) return

  const segment = segmentDeletion.hoveredSegment
  const startStation = state.stations.find(s => s.id === segment.startStationId)
  const endStation = state.stations.find(s => s.id === segment.endStationId)

  if (!startStation || !endStation) return

  ctx.save()

  // 高亮要删除的线段
  ctx.strokeStyle = '#ff4757'
  ctx.lineWidth = 8
  ctx.setLineDash([10, 5])
  ctx.beginPath()
  ctx.moveTo(startStation.pos.x, startStation.pos.y)
  ctx.lineTo(endStation.pos.x, endStation.pos.y)
  ctx.stroke()

  // 在线段中点显示删除图标
  const midX = (startStation.pos.x + endStation.pos.x) / 2
  const midY = (startStation.pos.y + endStation.pos.y) / 2

  // 删除图标背景
  ctx.fillStyle = 'rgba(255, 71, 87, 0.9)'
  ctx.beginPath()
  ctx.arc(midX, midY, 12, 0, Math.PI * 2)
  ctx.fill()

  // 删除图标（X）
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(midX - 6, midY - 6)
  ctx.lineTo(midX + 6, midY + 6)
  ctx.moveTo(midX + 6, midY - 6)
  ctx.lineTo(midX - 6, midY + 6)
  ctx.stroke()

  ctx.restore()
}

// 绘制金钱变化效果
export function drawMoneyEffects(ctx: CanvasRenderingContext2D): void {
  const currentTime = performance.now()

  for (const effect of moneyEffects) {
    const elapsed = currentTime - effect.startTime
    const progress = Math.min(elapsed / effect.duration, 1)

    if (progress >= 1) continue // 效果已结束，将在更新中被移除

    ctx.save()

    // 计算位置（向上飘动）
    const offsetY = -progress * 50 // 向上移动50像素
    const x = effect.pos.x
    const y = effect.pos.y + offsetY

    // 计算透明度（淡出效果）
    const alpha = 1 - progress

    // 设置样式
    const isIncome = effect.type === 'income'
    const sign = isIncome ? '+' : '-'

    ctx.fillStyle = `rgba(${isIncome ? '0, 255, 136' : '255, 71, 87'}, ${alpha})`
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'

    // 绘制金钱变化文本
    const text = `${sign}$${Math.abs(effect.amount)}`
    ctx.fillText(text, x, y)

    // 添加阴影效果
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.5})`
    ctx.fillText(text, x + 1, y + 1)

    ctx.restore()
  }
}

// 更新金钱效果（移除已完成的效果）
export function updateMoneyEffects(): void {
  const currentTime = performance.now()
  const gameSpeed = state.gameSpeed || 1

  for (let i = moneyEffects.length - 1; i >= 0; i--) {
    const effect = moneyEffects[i]
    const elapsed = (currentTime - effect.startTime) * gameSpeed

    if (elapsed >= effect.duration) {
      moneyEffects.splice(i, 1)
    }
  }
}

// 主渲染函数
export function render(ctx: CanvasRenderingContext2D, camera: Camera, canvas: HTMLCanvasElement, interaction: any): void {
  ctx.save()
  ctx.setTransform(camera.scale, 0, 0, camera.scale, -camera.pos.x * camera.scale, -camera.pos.y * camera.scale)

  // 清屏
  ctx.fillStyle = '#111'
  ctx.fillRect(camera.pos.x, camera.pos.y, canvas.width / camera.scale, canvas.height / camera.scale)

  // 绘制线路
  state.lines.forEach(l => drawLine(ctx, l))

  // 绘制预览线路
  if (interaction.drawingFrom && interaction.previewTo) {
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 4
    ctx.beginPath()
    const a = interaction.drawingFrom.pos
    ctx.moveTo(a.x, a.y)
    const b = interaction.previewTo
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.restore()
  }

  // 绘制智能吸附反馈
  drawSmartAttachmentFeedback(ctx)

  // 绘制线路段删除反馈
  drawSegmentDeletionFeedback(ctx)

  // 绘制站点
  state.stations.forEach(s => drawStation(ctx, s))

  // 绘制列车
  state.trains.forEach(t => drawTrain(ctx, t))

  // 绘制金钱变化效果
  drawMoneyEffects(ctx)

  // 绘制暂停状态
  if (state.paused) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0) // 重置变换，使用屏幕坐标

    // 半透明黑色遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 暂停文本
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 48px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('游戏已暂停', canvas.width / 2, canvas.height / 2 - 20)

    // 提示文本
    ctx.font = '24px system-ui'
    ctx.fillText('按空格键或P键恢复', canvas.width / 2, canvas.height / 2 + 30)

    ctx.restore()
  }

  ctx.restore()
}
