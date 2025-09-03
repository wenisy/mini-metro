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

  const html = state.lines.map(l => {
    const lineTrains = state.trains.filter(t => t.lineId === l.id)
    const trainCount = lineTrains.length
    const isSelected = state.currentLineId === l.id
    const isCollapsed = lineCollapsedState.get(l.id) ?? false // 默认展开

    // 线路头部
    let lineHtml = `<div style="margin:4px 0;border-radius:4px;border:1px solid ${l.color};background:${isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'};">
      <div style="display:flex;align-items:center;gap:4px;padding:8px;background:${isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:3px 3px 0 0;border-bottom:1px solid rgba(255,255,255,0.1);">
        <button data-line-collapse="${l.id}" class="line-collapse" style="font-size:12px;width:20px;height:20px;padding:0;background:none;border:none;color:#ccc;cursor:pointer;border-radius:2px;margin-right:4px;" title="${isCollapsed ? '展开' : '折叠'}">${isCollapsed ? '▶' : '▼'}</button>
        <button data-line="${l.id}" class="line-select" style="font-size:14px;flex:1;text-align:left;background:none;border:none;color:#fff;cursor:pointer;padding:0;font-weight:bold;" title="选择线路">${l.name}</button>
        <span style="font-size:12px;color:#ccc;">${trainCount}辆列车</span>
        <button data-line-add-train="${l.id}" class="line-add-train" style="font-size:12px;color:#4CAF50;border:1px solid #4CAF50;background:none;cursor:pointer;padding:3px 8px;border-radius:3px;" title="添加列车">+</button>
        <button data-line-delete="${l.id}" class="line-delete" style="font-size:12px;color:#ff6b6b;border:1px solid #ff6b6b;background:none;cursor:pointer;padding:3px 8px;border-radius:3px;" title="删除线路">×</button>
      </div>`

    // 列车详情
    if (!isCollapsed) {
      if (trainCount > 0) {
        lineHtml += '<div style="padding:6px;">'
        lineTrains.forEach((train, index) => {
          const currentPassengers = total(train.passengersBy)
          const capacity = train.capacity
          const loadRatio = currentPassengers / capacity
          const statusColor = loadRatio > 0.8 ? '#ff6b6b' : loadRatio > 0.5 ? '#ffa726' : '#66bb6a'

          lineHtml += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;padding:4px;background:rgba(255,255,255,0.05);border-radius:3px;">
            <span style="font-size:12px;color:#ccc;min-width:25px;font-weight:bold;">#${index + 1}</span>
            <span style="font-size:12px;color:${statusColor};font-weight:bold;min-width:35px;">${currentPassengers}/${capacity}</span>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;">
              <div style="height:100%;width:${Math.min(loadRatio * 100, 100)}%;background:${statusColor};border-radius:3px;"></div>
            </div>
            <button data-train-upgrade="${train.id}" class="train-upgrade" style="font-size:10px;color:#2196F3;border:1px solid #2196F3;background:none;cursor:pointer;padding:2px 6px;border-radius:3px;" title="增加载客量">+载客</button>
          </div>`
        })
        lineHtml += '</div>'
      } else {
        lineHtml += '<div style="padding:10px;text-align:center;font-size:12px;color:#666;">暂无列车</div>'
      }
    }

    lineHtml += '</div>'
    return lineHtml
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
        // 为单个列车升级容量
        const cost = priceConfig.trainCapacityUpgradeCost
        if (canAfford(cost)) {
          spendMoney(cost, `升级列车容量`)
          train.capacity += 1
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