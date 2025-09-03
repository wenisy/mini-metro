import type { Vec2, InteractionState } from './types.js'
import { Camera } from './rendering.js'
import { hitTestStation, nearestStationWithin, clamp } from './game-state.js'
import { hitTestLineSegment, startLineDrag, updateLineDrag, endLineDrag, smartAttachment, segmentDeletion, updateSegmentHover, attemptSegmentDeletion } from './smart-attachment.js'

// 交互状态
export const interaction: InteractionState = {
  drawingFrom: null,
  previewTo: null,
  selectedLine: null,
}

// 工具函数
export function pointerPos(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): Vec2 {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// 设置输入处理
export function setupInput(canvas: HTMLCanvasElement, camera: Camera, showLinkChooser: Function, hideLinkChooser: Function): void {
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
        // 第二次点击：显示连接选择器
        const target = s ?? nearestStationWithin(world, 20)
        if (target && target.id !== interaction.drawingFrom.id) {
          showLinkChooser(interaction.drawingFrom, target, camera)
        }
        interaction.drawingFrom = null
        interaction.previewTo = null
        return
      } else {
        if (segmentDeletion.deleteMode) {
          // 删除模式：尝试删除线路段
          if (attemptSegmentDeletion(world)) {
            // 删除成功，重新渲染UI
            import('./ui-controls.js').then(({ renderLinesPanel }) => {
              renderLinesPanel()
            })
          }
          return
        } else if (s) {
          // 第一次点击：开始从站点绘制
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
          // 开始平移（如果没有点击站点或线路）
          if (interaction.drawingFrom) {
            interaction.drawingFrom = null
            interaction.previewTo = null
            interaction.selectedLine = null
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

      // 更新线路段悬停（删除模式）
      updateSegmentHover(world)

      if (smartAttachment.isDraggingLine) {
        // 更新线路拖拽
        updateLineDrag(world)
        return
      } else if (interaction.drawingFrom) {
        // 更新预览（吸附到20px内的最近站点）
        const snapped = nearestStationWithin(world, 20)
        interaction.previewTo = snapped ? { ...snapped.pos } : world
        return
      } else if (isPanning && prev) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        camera.pos.x -= dx / camera.scale
        camera.pos.y -= dy / camera.scale
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDist0 === 0) pinchDist0 = d
      const factor = d / pinchDist0
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
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
        console.log('智能吸附成功！')
      }
    }
    
    // 完成绘制（如果释放在站点上）
    if (interaction.drawingFrom) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)
      const target = hitTestStation(world)
      if (target && target.id !== interaction.drawingFrom.id) {
        showLinkChooser(interaction.drawingFrom, target, camera)
      }
      interaction.drawingFrom = null
      interaction.previewTo = null
      interaction.selectedLine = null
    }
    
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchDist0 = 0
    if (pointers.size === 0) { isPanning = false }
  }

  // 添加事件监听器
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  
  // 防止iOS上下文菜单和选择手势
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('selectstart', (e) => e.preventDefault())

  // 鼠标滚轮缩放
  canvas.addEventListener('wheel', (e) => {
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


