import { state, addTrain, upgradeTrainCapacity, priceConfig, canAfford, toggleInfiniteMode, addStationSafely, economy } from './game-state.js'
import { enableSegmentDeletionMode, disableSegmentDeletionMode, segmentDeletion } from './smart-attachment.js'

// 设置UI控件
export function setupUIControls(): void {
  // 自动生成和手动生成按钮
  const btnAuto = document.getElementById('toggle-auto') as HTMLButtonElement
  const btnSpawn = document.getElementById('spawn-one') as HTMLButtonElement
  const btnDeleteMode = document.getElementById('toggle-delete-mode') as HTMLButtonElement
  const btnInfiniteMode = document.getElementById('toggle-infinite-mode') as HTMLButtonElement

  if (btnAuto && btnSpawn && btnDeleteMode) {
    const updateLabels = () => {
      updateButtonStates()
    }

    btnAuto.onclick = () => {
      state.autoSpawnEnabled = !state.autoSpawnEnabled
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
        // 导入updateFinancialPanel以避免循环依赖
        import('./ui-panels.js').then(({ updateFinancialPanel }) => {
          updateFinancialPanel()
        })
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

  // 游戏速度控制按钮
  const btnSpeed1x = document.getElementById('btn-speed-1x') as HTMLButtonElement
  const btnSpeed2x = document.getElementById('btn-speed-2x') as HTMLButtonElement
  const btnSpeed3x = document.getElementById('btn-speed-3x') as HTMLButtonElement

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
        // 导入updateFinancialPanel以避免循环依赖
        import('./ui-panels.js').then(({ updateFinancialPanel }) => {
          updateFinancialPanel()
        })
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
        // 导入updateFinancialPanel以避免循环依赖
        import('./ui-panels.js').then(({ updateFinancialPanel }) => {
          updateFinancialPanel()
        })
        console.log('成功升级列车容量')
      } else {
        const currentLineTrains = state.trains.filter(t => t.lineId === state.currentLineId).length
        const totalCost = priceConfig.trainCapacityUpgradeCost * currentLineTrains
        alert(`余额不足！需要 $${totalCost}，当前余额 $${economy.balance}`)
      }
    }
  }

  // 游戏速度控制
  function updateSpeedButtons() {
    if (btnSpeed1x) {
      btnSpeed1x.style.backgroundColor = state.gameSpeed === 1 ? '#4CAF50' : '#666'
      btnSpeed1x.style.color = state.gameSpeed === 1 ? '#fff' : '#ccc'
    }
    if (btnSpeed2x) {
      btnSpeed2x.style.backgroundColor = state.gameSpeed === 2 ? '#4CAF50' : '#666'
      btnSpeed2x.style.color = state.gameSpeed === 2 ? '#fff' : '#ccc'
    }
    if (btnSpeed3x) {
      btnSpeed3x.style.backgroundColor = state.gameSpeed === 3 ? '#4CAF50' : '#666'
      btnSpeed3x.style.color = state.gameSpeed === 3 ? '#fff' : '#ccc'
    }
  }

  if (btnSpeed1x) {
    btnSpeed1x.onclick = () => {
      state.gameSpeed = 1
      updateSpeedButtons()
      console.log('游戏速度设置为 1x')
    }
  }

  if (btnSpeed2x) {
    btnSpeed2x.onclick = () => {
      state.gameSpeed = 2
      updateSpeedButtons()
      console.log('游戏速度设置为 2x')
    }
  }

  if (btnSpeed3x) {
    btnSpeed3x.onclick = () => {
      state.gameSpeed = 3
      updateSpeedButtons()
      console.log('游戏速度设置为 3x')
    }
  }

  // 初始化速度按钮状态
  updateSpeedButtons()

  // 初始化财务面板
  import('./ui-panels.js').then(({ updateFinancialPanel }) => {
    updateFinancialPanel()
  })
}

// 按钮状态更新函数
function updateButtonStates(): void {
  const addTrainBtn = document.getElementById('btn-add-train') as HTMLButtonElement
  const capacityBtn = document.getElementById('btn-capacity') as HTMLButtonElement
  const autoBtn = document.getElementById('toggle-auto') as HTMLButtonElement
  const spawnBtn = document.getElementById('spawn-one') as HTMLButtonElement
  const deleteBtn = document.getElementById('toggle-delete-mode') as HTMLButtonElement
  const infiniteBtn = document.getElementById('toggle-infinite-mode') as HTMLButtonElement

  // 更新列车相关按钮
  if (addTrainBtn) {
    const canAffordTrain = canAfford(priceConfig.newTrainCost) && state.currentLineId !== null
    addTrainBtn.disabled = !canAffordTrain
    addTrainBtn.style.opacity = canAffordTrain ? '1' : '0.5'
    addTrainBtn.style.cursor = canAffordTrain ? 'pointer' : 'not-allowed'
    addTrainBtn.style.backgroundColor = canAffordTrain ? '#666' : '#444'
  }

  if (capacityBtn) {
    const currentLineTrains = state.currentLineId ? state.trains.filter(t => t.lineId === state.currentLineId).length : 0
    const totalCost = priceConfig.trainCapacityUpgradeCost * Math.max(1, currentLineTrains)
    const canAffordCapacity = canAfford(totalCost) && state.currentLineId !== null
    capacityBtn.disabled = !canAffordCapacity
    capacityBtn.style.opacity = canAffordCapacity ? '1' : '0.5'
    capacityBtn.style.cursor = canAffordCapacity ? 'pointer' : 'not-allowed'
    capacityBtn.style.backgroundColor = canAffordCapacity ? '#666' : '#444'
  }

  // 更新设置按钮
  if (autoBtn) {
    autoBtn.textContent = `自动生成: ${state.autoSpawnEnabled ? '开启' : '关闭'}`
    autoBtn.style.backgroundColor = state.autoSpawnEnabled ? '#4CAF50' : '#666'
  }

  if (deleteBtn) {
    deleteBtn.textContent = `删除模式: ${segmentDeletion.deleteMode ? '开启' : '关闭'}`
    deleteBtn.style.backgroundColor = segmentDeletion.deleteMode ? '#ff4757' : '#666'
  }

  if (infiniteBtn) {
    infiniteBtn.textContent = `💰 无限模式: ${state.infiniteMode ? '开启' : '关闭'}`
    infiniteBtn.style.backgroundColor = state.infiniteMode ? '#FF6B35' : '#4CAF50'
  }

  if (spawnBtn) {
    spawnBtn.style.backgroundColor = '#666'
  }
}
