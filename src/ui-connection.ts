import { state, removeLine, getExtendableLines, addLine, COLORS, calculateNewLineCost, calculateExtensionCost, canAfford as _canAfford, economy } from './game-state.js'
import type { Vec2 } from './types.js'

// 计算菜单位置（固定在屏幕中心）
function calculateMenuPosition(fromPos: Vec2, toPos: Vec2, camera: any): { x: number, y: number } {
  // 菜单尺寸估算
  const menuWidth = 240
  const menuHeight = 140

  // 获取视口尺寸
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 计算屏幕中心位置
  const centerX = viewportWidth / 2 - menuWidth / 2
  const centerY = viewportHeight / 2 - menuHeight / 2

  // 确保菜单完全在视口内
  const x = Math.max(10, Math.min(centerX, viewportWidth - menuWidth - 10))
  const y = Math.max(10, Math.min(centerY, viewportHeight - menuHeight - 10))

  // 使用参数避免TypeScript警告（虽然实际不需要使用）
  void fromPos;
  void toPos;
  void camera;

  console.log(`菜单定位: 屏幕中心 (${x.toFixed(1)}, ${y.toFixed(1)})`)
  return { x, y }
}

// 显示连接选择器
export function showLinkChooser(from: any, to: any, camera?: any): void {
  // 动态导入以避免循环依赖
  import('./game-state.js').then(({ findLineBetween }) => {
    const existing = findLineBetween(from.id, to.id)

    if (existing) {
      // 已存在连接，显示删除选项
      showLinkChooserUI(from, to, existing, [], camera)
    } else {
      // 检查可用操作
      const extendableLines = getExtendableLines(from, to)

      if (extendableLines.length === 0) {
        // 只能新建线路，检查余额后直接执行
        const newLineCost = calculateNewLineCost()
        if (_canAfford(newLineCost)) {
          const color = COLORS[(state.lines.length) % COLORS.length]
          const newLine = addLine(color, from, to)
          if (newLine) {
            state.currentLineId = newLine.id
            // 导入renderLinesPanel和updateFinancialPanel以避免循环依赖
            import('./ui-lines.js').then(({ renderLinesPanel }) => {
              renderLinesPanel()
            })
            import('./ui-panels.js').then(({ updateFinancialPanel }) => {
              updateFinancialPanel()
            })
            console.log(`自动创建新线路: ${newLine.name}`)
          }
        } else {
          alert(`余额不足！建设新线路需要 $${newLineCost}，当前余额 $${economy.balance}`)
        }
      } else {
        // 有多个选项，显示选择界面
        showLinkChooserUI(from, to, null, extendableLines, camera)
      }
    }
  })
}

// 显示连接选择器UI
function showLinkChooserUI(from: any, to: any, existing: any = null, extendableLines: any[] = [], camera?: any): void {
  state.showLinkChooser = true
  state.linkChooserFrom = from
  state.linkChooserTo = to

  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  const text = document.getElementById('link-chooser-text') as HTMLDivElement
  const buttons = document.getElementById('link-chooser-buttons') as HTMLDivElement

  if (!chooser || !text || !buttons) return

  // 动态定位菜单（基于两个站点的中点）
  if (camera) {
    const position = calculateMenuPosition(from.pos, to.pos, camera)
    chooser.style.left = `${position.x}px`
    chooser.style.top = `${position.y}px`
    chooser.style.transform = 'none' // 清除任何之前的transform
  } else {
    // 回退到默认位置
    chooser.style.left = '50%'
    chooser.style.top = 'auto'
    chooser.style.bottom = '20px'
    chooser.style.transform = 'translateX(-50%)'
  }

  if (existing) {
    text.textContent = `${from.shape} ↔ ${to.shape} 已连接`
    buttons.innerHTML = `<button id="remove-line">删除连接</button>`
  } else {
    text.textContent = `连接 ${from.shape} → ${to.shape}`
    let html = ''

    // 添加可扩展线路选项
    if (extendableLines.length > 0) {
      const extensionCost = calculateExtensionCost()
      extendableLines.forEach(line => {
        html += `<button class="extend-line" data-line-id="${line.id}" style="display:flex;align-items:center;gap:6px;padding:6px 8px;">
          <span style="display:inline-block;width:12px;height:12px;background:${line.color};border-radius:50%;border:1px solid rgba(255,255,255,0.3);"></span>
          <span>延长 ${line.name} ($${extensionCost})</span>
        </button>`
      })
    }

    const newLineCost = calculateNewLineCost()
    html += `<button id="new-line">新建线路 ($${newLineCost})</button>`
    html += `<button id="cancel-action">取消</button>`
    buttons.innerHTML = html
  }

  chooser.style.display = 'block'

  // 添加事件监听器
  const removeBtn = document.getElementById('remove-line')
  const newBtn = document.getElementById('new-line')
  const cancelBtn = document.getElementById('cancel-action')
  const extendBtns = document.querySelectorAll('.extend-line')

  if (removeBtn) {
    removeBtn.onclick = () => {
      if (existing) removeLine(existing.id)
      hideLinkChooser()
      // 导入renderLinesPanel以避免循环依赖
      import('./ui-lines.js').then(({ renderLinesPanel }) => {
        renderLinesPanel()
      })
    }
  }

  // 处理扩展线路按钮
  extendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lineId = Number((btn as HTMLButtonElement).dataset.lineId)
      const line = state.lines.find(l => l.id === lineId)
      if (line) {
        // 检查余额
        import('./game-state.js').then(({ extendLine, canAfford: _canAfford, economy }) => {
          const midPoint = {
            x: (from.pos.x + to.pos.x) / 2,
            y: (from.pos.y + to.pos.y) / 2
          }

          if (extendLine(line, 0, midPoint)) { // 使用0作为占位符，实际逻辑在extendLine中
            // 确定要添加哪个站点以及添加到哪里
            const fromOnLine = line.stations.includes(from.id)
            const toOnLine = line.stations.includes(to.id)

            if (fromOnLine && !toOnLine) {
              // 添加 'to' 站点到线路
              const fromIndex = line.stations.indexOf(from.id)
              if (fromIndex === 0) {
                // 在线路开头添加
                line.stations.unshift(to.id)
              } else if (fromIndex === line.stations.length - 1) {
                // 在线路末尾添加
                line.stations.push(to.id)
              } else {
                // 从中间站点扩展：创建分支线路
                // 为了简化，我们在当前站点后插入新站点
                line.stations.splice(fromIndex + 1, 0, to.id)
              }
            } else if (toOnLine && !fromOnLine) {
              // 添加 'from' 站点到线路
              const toIndex = line.stations.indexOf(to.id)
              if (toIndex === 0) {
                // 在线路开头添加
                line.stations.unshift(from.id)
              } else if (toIndex === line.stations.length - 1) {
                // 在线路末尾添加
                line.stations.push(from.id)
              } else {
                // 从中间站点扩展：创建分支线路
                // 为了简化，我们在当前站点后插入新站点
                line.stations.splice(toIndex + 1, 0, from.id)
              }
            }
            state.currentLineId = lineId // 设置为当前线路
            // 导入renderLinesPanel和updateFinancialPanel以避免循环依赖
            import('./ui-lines.js').then(({ renderLinesPanel }) => {
              renderLinesPanel()
            })
            import('./ui-panels.js').then(({ updateFinancialPanel }) => {
              updateFinancialPanel()
            })
          } else {
            const extensionCost = calculateExtensionCost()
            alert(`余额不足！延长线路需要 $${extensionCost}，当前余额 $${economy.balance}`)
          }
        })
      }
      hideLinkChooser()
    })
  })

  if (newBtn) {
    newBtn.onclick = () => {
      const newLineCost = calculateNewLineCost()
      if (_canAfford(newLineCost)) {
        const color = COLORS[(state.lines.length) % COLORS.length]
        const newLine = addLine(color, from, to)
        if (newLine) {
          state.currentLineId = newLine.id
          // 导入renderLinesPanel和updateFinancialPanel以避免循环依赖
          import('./ui-lines.js').then(({ renderLinesPanel }) => {
            renderLinesPanel()
          })
          import('./ui-panels.js').then(({ updateFinancialPanel }) => {
            updateFinancialPanel()
          })
        }
      } else {
        alert(`余额不足！建设新线路需要 $${newLineCost}，当前余额 $${economy.balance}`)
      }
      hideLinkChooser()
    }
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      hideLinkChooser()
    }
  }
}

// 隐藏连接选择器
export function hideLinkChooser(): void {
  state.showLinkChooser = false
  state.linkChooserFrom = null
  state.linkChooserTo = null
  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  if (chooser) chooser.style.display = 'none'
}
