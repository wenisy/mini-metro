import { state, removeLine, economy, priceConfig, addTrain, canAfford, spendMoney, total } from './game-state.js'

// 线路折叠状态跟踪
const lineCollapsedState = new Map<number, boolean>()

// 渲染线路面板
export function renderLinesPanel(): void {
  console.log('renderLinesPanel 被调用，当前线路数量:', state.lines.length)
  const linesList = document.getElementById('lines-list') as HTMLDivElement
  if (!linesList) {
    console.log('linesList 元素未找到')
    return
  }

  if (state.lines.length === 0) {
    linesList.innerHTML = '<div style="font-size:14px; color:#888; text-align:center; padding:12px;">暂无线路</div>'
    return
  }

  // 如果有聚焦线路，添加取消聚焦按钮
  let focusControlHtml = ''
  if (state.focusedLineId !== null) {
    const focusedLine = state.lines.find(l => l.id === state.focusedLineId)
    if (focusedLine) {
      focusControlHtml = `
        <div style="margin-bottom:8px;padding:6px;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;color:#ccc;">🎯 聚焦: ${focusedLine.name}</span>
            <button id="clear-focus" style="font-size:11px;padding:2px 6px;background:#666;color:#fff;border:none;border-radius:3px;cursor:pointer;" title="取消聚焦">✕</button>
          </div>
        </div>
      `
    }
  }

  // 按照线路名称排序（提取数字部分进行排序）
  const sortedLines = state.lines.slice().sort((a, b) => {
    const aMatch = a.name.match(/(\d+)/)
    const bMatch = b.name.match(/(\d+)/)

    const aNum = aMatch ? parseInt(aMatch[1]) : 0
    const bNum = bMatch ? parseInt(bMatch[1]) : 0

    return aNum - bNum
  })

  const html = sortedLines.map(l => {
    const lineTrains = state.trains.filter(t => t.lineId === l.id)
    const trainCount = lineTrains.length
    const isSelected = state.currentLineId === l.id
    const isFocused = state.focusedLineId === l.id
    const isCollapsed = lineCollapsedState.get(l.id) ?? false // 默认展开

    // 获取线路统计信息
    const stats = l.stats || { totalPassengersTransported: 0, totalIncome: 0, lastUpdateTime: 0 }
    const totalPassengers = stats.totalPassengersTransported
    const totalIncome = stats.totalIncome

    // 根据聚焦状态调整样式
    const borderColor = isFocused ? l.color : l.color
    const borderWidth = isFocused ? '2px' : '1px'
    const backgroundColor = isFocused ? 'rgba(255,255,255,0.15)' : (isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)')
    const headerBackground = isFocused ? 'rgba(255,255,255,0.2)' : (isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)')
    const focusIndicator = isFocused ? '🎯 ' : ''
    const boxShadow = isFocused ? `box-shadow: 0 0 8px ${l.color}40;` : ''

    // 线路头部
    let lineHtml = `<div style="margin:4px 0;border-radius:4px;border:${borderWidth} solid ${borderColor};background:${backgroundColor};${boxShadow}">
      <div style="display:flex;align-items:center;gap:4px;padding:8px;background:${headerBackground};border-radius:3px 3px 0 0;border-bottom:1px solid rgba(255,255,255,0.1);">
        <button data-line-collapse="${l.id}" class="line-collapse" style="font-size:12px;width:20px;height:20px;padding:0;background:none;border:none;color:#ccc;cursor:pointer;border-radius:2px;" title="${isCollapsed ? '展开' : '折叠'}">${isCollapsed ? '▶' : '▼'}</button>
        <button data-line="${l.id}" class="line-select" style="font-size:14px;flex:1;text-align:left;background:none;border:none;color:#fff;cursor:pointer;padding:0;font-weight:bold;display:flex;align-items:center;gap:6px;" title="${isFocused ? '点击取消聚焦' : '点击聚焦线路'}">
          <div style="width:12px;height:12px;border-radius:50%;background:${l.color};border:1px solid rgba(255,255,255,0.3);flex-shrink:0;${isFocused ? 'box-shadow: 0 0 4px ' + l.color + ';' : ''}"></div>
          <span>${focusIndicator}${l.name}</span>
        </button>
        <span style="font-size:11px;color:#ccc;">${trainCount}辆</span>
        <div style="display:flex;gap:2px;align-items:center;">
          <button data-line-add-train="${l.id}" class="line-add-train" style="font-size:14px;color:#4CAF50;border:1px solid #4CAF50;background:none;cursor:pointer;padding:0;border-radius:3px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;line-height:1;" title="添加列车">+</button>
          <button data-line-delete="${l.id}" class="line-delete" style="font-size:14px;color:#ff6b6b;border:1px solid #ff6b6b;background:none;cursor:pointer;padding:0;border-radius:3px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;line-height:1;" title="删除线路">×</button>
        </div>
      </div>

      <!-- 线路统计信息 -->
      <div style="padding:6px 8px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
          <span>💰 收入: $${totalIncome}</span>
          <span>👥 载客: ${totalPassengers}人</span>
        </div>
      </div>`

    // 列车详情
    if (!isCollapsed) {
      if (trainCount > 0) {
        lineHtml += '<div style="padding:6px 8px;">'
        lineTrains.forEach((train, index) => {
          const currentPassengers = total(train.passengersBy)
          const capacity = train.capacity
          const loadRatio = currentPassengers / capacity
          const statusColor = loadRatio > 0.8 ? '#ff6b6b' : loadRatio > 0.5 ? '#ffa726' : '#66bb6a'

          lineHtml += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;padding:4px 6px;background:rgba(255,255,255,0.05);border-radius:3px;">
            <span style="font-size:11px;color:#ccc;min-width:20px;font-weight:bold;">#${index + 1}</span>
            <span style="font-size:11px;color:${statusColor};font-weight:bold;min-width:30px;">${currentPassengers}/${capacity}</span>
            <div style="flex:1;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;">
              <div style="height:100%;width:${Math.min(loadRatio * 100, 100)}%;background:${statusColor};border-radius:2px;"></div>
            </div>
            <button data-train-upgrade="${train.id}" class="train-upgrade" style="font-size:10px;color:#2196F3;border:1px solid #2196F3;background:none;cursor:pointer;padding:1px 4px;border-radius:2px;min-width:18px;" title="升级容量 ($${priceConfig.trainCapacityUpgradeCost})">⬆</button>
          </div>`
        })
        lineHtml += '</div>'
      } else {
        lineHtml += '<div style="padding:8px;text-align:center;color:#888;font-size:11px;">暂无列车</div>'
      }
    }

    lineHtml += '</div>'
    return lineHtml
  }).join('')

  console.log('生成的HTML:', html)
  linesList.innerHTML = focusControlHtml + html

  // 添加取消聚焦按钮事件监听器
  const clearFocusBtn = document.getElementById('clear-focus')
  if (clearFocusBtn) {
    clearFocusBtn.addEventListener('click', () => {
      state.focusedLineId = null
      console.log('手动取消线路聚焦')
      renderLinesPanel()
    })
  }

  // 添加线路选择事件监听器
  linesList.querySelectorAll('button.line-select').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number((btn as HTMLButtonElement).dataset.line)

      // 实现聚焦切换逻辑
      if (state.focusedLineId === id) {
        // 如果点击的是已聚焦的线路，取消聚焦
        state.focusedLineId = null
        console.log('取消线路聚焦')
      } else {
        // 聚焦新线路
        state.focusedLineId = id
        console.log('聚焦线路:', id)
      }

      // 保持原有的currentLineId逻辑
      state.currentLineId = id

      renderLinesPanel() // 重新渲染以显示选择状态
      // 导入updateFinancialPanel以避免循环依赖
      import('./ui-panels.js').then(({ updateFinancialPanel }) => {
        updateFinancialPanel()
      })
    })
  })

  // 添加列车按钮事件监听器
  linesList.querySelectorAll('button.line-add-train').forEach(btn => {
    btn.addEventListener('click', () => {
      const lineId = Number((btn as HTMLButtonElement).dataset.lineAddTrain)
      if (addTrain(lineId)) {
        console.log(`成功为线路 ${lineId} 添加列车`)
        renderLinesPanel()
        // 导入updateFinancialPanel以避免循环依赖
        import('./ui-panels.js').then(({ updateFinancialPanel }) => {
          updateFinancialPanel()
        })
      } else {
        alert(`余额不足！需要 $${priceConfig.newTrainCost}，当前余额 $${economy.balance}`)
      }
    })
  })

  // 添加列车升级按钮事件监听器
  linesList.querySelectorAll('button.train-upgrade').forEach(btn => {
    btn.addEventListener('click', () => {
      const trainId = Number((btn as HTMLButtonElement).dataset.trainUpgrade)
      const train = state.trains.find(t => t.id === trainId)
      if (train) {
        // 使用统一的升级函数
        const cost = priceConfig.trainCapacityUpgradeCost
        if (canAfford(cost)) {
          spendMoney(cost, `升级列车容量`)
          train.capacity += 20  // 每次升级增加20个容量
          console.log(`列车 ${trainId} 容量升级为 ${train.capacity}`)
          renderLinesPanel()
          // 导入updateFinancialPanel以避免循环依赖
          import('./ui-panels.js').then(({ updateFinancialPanel }) => {
            updateFinancialPanel()
          })
        } else {
          alert(`余额不足！需要 $${cost}，当前余额 $${economy.balance}`)
        }
      }
    })
  })

  // 添加折叠/展开按钮事件监听器
  linesList.querySelectorAll('button.line-collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      const lineId = Number((btn as HTMLButtonElement).dataset.lineCollapse)
      const currentState = lineCollapsedState.get(lineId) ?? false
      lineCollapsedState.set(lineId, !currentState)
      renderLinesPanel() // 重新渲染以更新显示状态
    })
  })

  // 添加删除按钮事件监听器
  linesList.querySelectorAll('button.line-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number((btn as HTMLButtonElement).dataset.lineDelete)
      if (confirm(`确定要删除 ${state.lines.find(l => l.id === id)?.name} 吗？`)) {
        removeLine(id)
        // 清理折叠状态
        lineCollapsedState.delete(id)
        renderLinesPanel()
        // 导入updateFinancialPanel以避免循环依赖
        import('./ui-panels.js').then(({ updateFinancialPanel }) => {
          updateFinancialPanel()
        })
      }
    })
  })
  console.log('renderLinesPanel 完成')
}