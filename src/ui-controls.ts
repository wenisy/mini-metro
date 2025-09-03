import { state, removeLine, getExtendableLines, addLine, COLORS, economy, priceConfig, addTrain, upgradeTrainCapacity, canAfford, toggleInfiniteMode, addStationSafely, calculateNewLineCost, calculateExtensionCost } from './game-state.js'
import { enableSegmentDeletionMode, disableSegmentDeletionMode, segmentDeletion } from './smart-attachment.js'
import type { Vec2 } from './types.js'

// let nextId = 1000 // 避免与游戏状态中的ID冲突 - 暂时注释掉未使用的变量

// 更新财务面板
export function updateFinancialPanel(): void {
  const balanceElement = document.getElementById('money-balance')
  const incomeElement = document.getElementById('total-income')
  const expenseElement = document.getElementById('total-expense')

  if (balanceElement) {
    if (state.infiniteMode) {
      balanceElement.textContent = '∞ (无限模式)'
      balanceElement.style.color = '#00ff88'
      balanceElement.style.fontWeight = 'bold'
    } else {
      balanceElement.textContent = economy.balance.toString()
      balanceElement.style.color = ''
      balanceElement.style.fontWeight = ''
    }
  }
  if (incomeElement) incomeElement.textContent = economy.totalIncome.toString()
  if (expenseElement) expenseElement.textContent = economy.totalExpense.toString()

  // 更新按钮价格显示
  const trainCostElement = document.getElementById('train-cost')
  const capacityCostElement = document.getElementById('capacity-cost')

  if (trainCostElement) trainCostElement.textContent = priceConfig.newTrainCost.toString()
  if (capacityCostElement) {
    const currentLineTrains = state.currentLineId ? state.trains.filter(t => t.lineId === state.currentLineId).length : 0
    const totalCost = priceConfig.trainCapacityUpgradeCost * Math.max(1, currentLineTrains)
    capacityCostElement.textContent = totalCost.toString()
  }

  // 更新按钮状态（启用/禁用）
  updateButtonStates()
}

function updateButtonStates(): void {
  const addTrainBtn = document.getElementById('btn-add-train') as HTMLButtonElement
  const capacityBtn = document.getElementById('btn-capacity') as HTMLButtonElement

  if (addTrainBtn) {
    const canAffordTrain = canAfford(priceConfig.newTrainCost) && state.currentLineId !== null
    addTrainBtn.disabled = !canAffordTrain
    addTrainBtn.style.opacity = canAffordTrain ? '1' : '0.5'
    addTrainBtn.style.cursor = canAffordTrain ? 'pointer' : 'not-allowed'
  }

  if (capacityBtn) {
    const currentLineTrains = state.currentLineId ? state.trains.filter(t => t.lineId === state.currentLineId).length : 0
    const totalCost = priceConfig.trainCapacityUpgradeCost * Math.max(1, currentLineTrains)
    const canAffordCapacity = canAfford(totalCost) && state.currentLineId !== null
    capacityBtn.disabled = !canAffordCapacity
    capacityBtn.style.opacity = canAffordCapacity ? '1' : '0.5'
    capacityBtn.style.cursor = canAffordCapacity ? 'pointer' : 'not-allowed'
  }
}

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

  console.log(`菜单定位: 屏幕中心 (${x.toFixed(1)}, ${y.toFixed(1)})`)
  return { x, y }
}

// 渲染线路面板
export function renderLinesPanel(): void {
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

  // 添加线路选择事件监听器
  linesList.querySelectorAll('button.line-select').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number((btn as HTMLButtonElement).dataset.line)
      state.currentLineId = id
      console.log('选中线路:', id)
      renderLinesPanel() // 重新渲染以显示选择状态
    })
  })

  // 添加删除按钮事件监听器
  linesList.querySelectorAll('button.line-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number((btn as HTMLButtonElement).dataset.lineDelete)
      if (confirm(`确定要删除 ${state.lines.find(l => l.id === id)?.name} 吗？`)) {
        removeLine(id)
        renderLinesPanel()
      }
    })
  })
  console.log('renderLinesPanel 完成')
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
        if (canAfford(newLineCost)) {
          const color = COLORS[(state.lines.length) % COLORS.length]
          const newLine = addLine(color, from, to)
          if (newLine) {
            state.currentLineId = newLine.id
            renderLinesPanel()
            updateFinancialPanel()
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
        html += `<button class="extend-line" data-line-id="${line.id}">延长 ${line.name} ($${extensionCost})</button>`
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
      renderLinesPanel()
    }
  }

  // 处理扩展线路按钮
  extendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lineId = Number((btn as HTMLButtonElement).dataset.lineId)
      const line = state.lines.find(l => l.id === lineId)
      if (line) {
        // 检查余额
        import('./game-state.js').then(({ extendLine }) => {
          const midPoint = {
            x: (from.pos.x + to.pos.x) / 2,
            y: (from.pos.y + to.pos.y) / 2
          }

          if (extendLine(line, 0, midPoint)) { // 使用0作为占位符，实际逻辑在extendLine中
            // 确定要添加哪个站点以及添加到哪里
            const fromOnLine = line.stations.includes(from.id)
            const toOnLine = line.stations.includes(to.id)

            if (fromOnLine && !toOnLine) {
              // 添加 'to' 站点
              const fromIndex = line.stations.indexOf(from.id)
              if (fromIndex === 0) {
                line.stations.unshift(to.id)
              } else if (fromIndex === line.stations.length - 1) {
                line.stations.push(to.id)
              }
            } else if (toOnLine && !fromOnLine) {
              // 添加 'from' 站点
              const toIndex = line.stations.indexOf(to.id)
              if (toIndex === 0) {
                line.stations.unshift(from.id)
              } else if (toIndex === line.stations.length - 1) {
                line.stations.push(from.id)
              }
            }
            state.currentLineId = lineId // 设置为当前线路
            renderLinesPanel()
            updateFinancialPanel()
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
      if (canAfford(newLineCost)) {
        const color = COLORS[(state.lines.length) % COLORS.length]
        const newLine = addLine(color, from, to)
        if (newLine) {
          state.currentLineId = newLine.id
          renderLinesPanel()
          updateFinancialPanel()
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

// 设置UI控件
export function setupUIControls(): void {
  // 自动生成和手动生成按钮
  const btnAuto = document.getElementById('toggle-auto') as HTMLButtonElement
  const btnSpawn = document.getElementById('spawn-one') as HTMLButtonElement
  const btnOnConnect = document.getElementById('spawn-on-connect') as HTMLButtonElement
  const btnDeleteMode = document.getElementById('toggle-delete-mode') as HTMLButtonElement
  const btnInfiniteMode = document.getElementById('toggle-infinite-mode') as HTMLButtonElement

  if (btnAuto && btnSpawn && btnOnConnect && btnDeleteMode) {
    const updateLabels = () => {
      btnAuto.textContent = `Auto Spawn: ${state.autoSpawnEnabled ? 'On' : 'Off'}`
      btnOnConnect.textContent = `Spawn on Connect: ${state.spawnOnConnect ? 'On' : 'Off'}`
      btnDeleteMode.textContent = `删除线路段: ${segmentDeletion.deleteMode ? 'On' : 'Off'}`
      btnDeleteMode.style.backgroundColor = segmentDeletion.deleteMode ? '#ff3742' : '#ff4757'

      // 更新无限模式按钮
      if (btnInfiniteMode) {
        btnInfiniteMode.textContent = `💰 无限模式: ${state.infiniteMode ? 'On' : 'Off'}`
        btnInfiniteMode.style.backgroundColor = state.infiniteMode ? '#FF6B35' : '#4CAF50'
      }
    }

    btnAuto.onclick = () => {
      state.autoSpawnEnabled = !state.autoSpawnEnabled
      updateLabels()
    }

    btnOnConnect.onclick = () => {
      state.spawnOnConnect = !state.spawnOnConnect
      updateLabels()
    }

    btnDeleteMode.onclick = () => {
      if (segmentDeletion.deleteMode) {
        disableSegmentDeletionMode()
      } else {
        enableSegmentDeletionMode()
      }
      updateLabels()
    }

    // 无限模式按钮事件处理
    if (btnInfiniteMode) {
      btnInfiniteMode.onclick = () => {
        toggleInfiniteMode()
        updateLabels()
        updateFinancialPanel() // 立即更新财务面板显示
      }
    }

    btnSpawn.onclick = () => {
      // 使用改进的安全站点生成函数
      const shapes = ['circle', 'triangle', 'square', 'star', 'heart'] as const
      const randomShape = shapes[Math.floor(Math.random() * shapes.length)]

      const newStation = addStationSafely(undefined, randomShape)
      if (newStation) {
        console.log(`✅ 手动生成新站点: ${newStation.shape} (ID: ${newStation.id})`)
      } else {
        alert('⚠️ 无法生成新站点，可能空间不足。请尝试删除一些现有站点或扩大游戏区域。')
      }
    }

    updateLabels()
  }

  // 乘客生成概率滑块 (每秒乘客数) - 优化为整数控制
  const passengerRateSlider = document.getElementById('passenger-rate') as HTMLInputElement
  const passengerRateValue = document.getElementById('passenger-rate-value') as HTMLSpanElement
  const passengerRateDecrease = document.getElementById('passenger-rate-decrease') as HTMLButtonElement
  const passengerRateIncrease = document.getElementById('passenger-rate-increase') as HTMLButtonElement

  if (passengerRateSlider && passengerRateValue && passengerRateDecrease && passengerRateIncrease) {
    // 初始化为整数值
    const initialPassengersPerSecond = Math.round(state.passengerSpawnBaseRate * 10) || 1
    state.passengerSpawnBaseRate = initialPassengersPerSecond * 0.1

    const updatePassengerRate = (newValue: number) => {
      // 确保值在有效范围内
      newValue = Math.max(1, Math.min(10, Math.round(newValue)))
      passengerRateSlider.value = newValue.toString()
      passengerRateValue.textContent = newValue.toString()
      state.passengerSpawnBaseRate = newValue * 0.1
    }

    // 初始化显示
    updatePassengerRate(initialPassengersPerSecond)

    // 滑块事件
    passengerRateSlider.oninput = () => {
      const passengersPerSecond = parseInt(passengerRateSlider.value)
      updatePassengerRate(passengersPerSecond)
    }

    // 减少按钮
    passengerRateDecrease.onclick = () => {
      const currentValue = parseInt(passengerRateSlider.value)
      updatePassengerRate(currentValue - 1)
    }

    // 增加按钮
    passengerRateIncrease.onclick = () => {
      const currentValue = parseInt(passengerRateSlider.value)
      updatePassengerRate(currentValue + 1)
    }
  }

  // 列车和容量控制按钮
  const btnAddTrain = document.getElementById('btn-add-train') as HTMLButtonElement
  const btnCap = document.getElementById('btn-capacity') as HTMLButtonElement

  if (btnAddTrain) {
    btnAddTrain.onclick = () => {
      if (state.currentLineId == null) {
        alert('请先选择一条线路')
        return
      }

      if (addTrain(state.currentLineId)) {
        updateFinancialPanel()
        console.log('成功添加列车')
      } else {
        alert(`余额不足！需要 $${priceConfig.newTrainCost}，当前余额 $${economy.balance}`)
      }
    }
  }

  if (btnCap) {
    btnCap.onclick = () => {
      if (state.currentLineId == null) {
        alert('请先选择一条线路')
        return
      }

      if (upgradeTrainCapacity(state.currentLineId)) {
        updateFinancialPanel()
        console.log('成功升级列车容量')
      } else {
        const currentLineTrains = state.trains.filter(t => t.lineId === state.currentLineId).length
        const totalCost = priceConfig.trainCapacityUpgradeCost * currentLineTrains
        alert(`余额不足！需要 $${totalCost}，当前余额 $${economy.balance}`)
      }
    }
  }

  // 初始化财务面板
  updateFinancialPanel()
}
