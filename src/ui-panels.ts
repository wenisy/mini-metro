import { state, economy, transactions, total } from './game-state.js'

// 更新财务面板和乘客统计
export function updateFinancialPanel(): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') return

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

  // 更新乘客统计
  updatePassengerStats()


  // 更新按钮状态（启用/禁用）
  updateButtonStates()
}

// 更新乘客统计
function updatePassengerStats(): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') return

  const totalPassengersElement = document.getElementById('total-passengers')
  const waitingPassengersElement = document.getElementById('waiting-passengers')

  if (totalPassengersElement) {
    // 计算已运送的总乘客数（从交易记录中获取）
    const totalTransported = transactions
      .filter(t => t.type === 'income' && t.description.includes('运输'))
      .reduce((sum, t) => sum + (t.amount / 25), 0) // 假设平均票价25来估算乘客数
    totalPassengersElement.textContent = Math.floor(totalTransported).toString()
  }

  if (waitingPassengersElement) {
    // 计算等待中的乘客总数
    const waitingPassengers = state.stations.reduce((sum, station) => sum + total(station.queueBy), 0)
    waitingPassengersElement.textContent = waitingPassengers.toString()
  }
}

// 更新游戏统计
export function updateGameStats(): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') return

  const gameTimeElement = document.getElementById('game-time')
  const stationCountElement = document.getElementById('station-count')
  const trainCountElement = document.getElementById('train-count')

  if (gameTimeElement) {
    gameTimeElement.textContent = Math.floor(state.time).toString()
  }

  if (stationCountElement) {
    stationCountElement.textContent = state.stations.length.toString()
  }

  if (trainCountElement) {
    trainCountElement.textContent = state.trains.length.toString()
  }
}

function updateButtonStates(): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') return

  const autoBtn = document.getElementById('toggle-auto') as HTMLButtonElement
  const spawnBtn = document.getElementById('spawn-one') as HTMLButtonElement
  const deleteBtn = document.getElementById('toggle-delete-mode') as HTMLButtonElement
  const infiniteBtn = document.getElementById('toggle-infinite-mode') as HTMLButtonElement


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

// 导入segmentDeletion以避免循环依赖
import { segmentDeletion } from './smart-attachment.js'