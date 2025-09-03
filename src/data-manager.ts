import type { GameState, EconomyState, Transaction } from './types.js'

// 保存数据格式接口
interface SaveData {
  version: string
  timestamp: number
  gameState: GameState
  economyState: EconomyState
  transactions: Transaction[]
  nextIds: {
    nextId: number
    nextTransactionId: number
  }
}

// 当前保存格式版本
const SAVE_DATA_VERSION = '1.0.0'

// 导出游戏数据
export function exportGameData(): void {
  try {
    // 动态导入以获取当前状态
    import('./game-state.js').then(({ state, economy, transactions, nextId, nextTransactionId }) => {
      const saveData: SaveData = {
        version: SAVE_DATA_VERSION,
        timestamp: Date.now(),
        gameState: { ...state },
        economyState: { ...economy },
        transactions: [...transactions],
        nextIds: {
          nextId,
          nextTransactionId
        }
      }

      // 序列化为JSON
      const jsonData = JSON.stringify(saveData, null, 2)

      // 创建下载链接
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // 生成文件名（包含时间戳）
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const filename = `mini-metro-save-${timestamp}.json`

      // 创建下载链接并触发下载
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // 清理URL对象
      URL.revokeObjectURL(url)

      console.log(`✅ 游戏数据已导出到文件: ${filename}`)
      alert(`游戏数据已成功导出!\n文件名: ${filename}`)
    })

  } catch (error) {
    console.error('❌ 导出游戏数据失败:', error)
    alert('导出失败，请查看控制台获取详细信息。')
  }
}

// 导入游戏数据
export function importGameData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const jsonData = event.target?.result as string
        const saveData: SaveData = JSON.parse(jsonData)

        // 验证数据格式
        if (!validateSaveData(saveData)) {
          throw new Error('数据格式验证失败')
        }

        // 恢复游戏状态
        restoreGameState(saveData)

        console.log('✅ 游戏数据已成功导入')
        alert('游戏数据已成功导入!')
        resolve()

      } catch (error) {
        console.error('❌ 导入游戏数据失败:', error)
        alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`)
        reject(error)
      }
    }

    reader.onerror = () => {
      const error = new Error('文件读取失败')
      console.error('❌ 文件读取失败:', error)
      alert('文件读取失败，请重试。')
      reject(error)
    }

    reader.readAsText(file)
  })
}

// 验证保存数据格式
function validateSaveData(data: any): data is SaveData {
  // 检查基本结构
  if (!data || typeof data !== 'object') {
    throw new Error('数据格式错误：不是有效的对象')
  }

  // 检查版本
  if (!data.version || typeof data.version !== 'string') {
    throw new Error('数据格式错误：缺少版本信息')
  }

  // 检查时间戳
  if (!data.timestamp || typeof data.timestamp !== 'number') {
    throw new Error('数据格式错误：缺少时间戳')
  }

  // 检查游戏状态
  if (!data.gameState || typeof data.gameState !== 'object') {
    throw new Error('数据格式错误：缺少游戏状态')
  }

  // 检查经济状态
  if (!data.economyState || typeof data.economyState !== 'object') {
    throw new Error('数据格式错误：缺少经济状态')
  }

  // 检查交易记录
  if (!Array.isArray(data.transactions)) {
    throw new Error('数据格式错误：交易记录格式错误')
  }

  // 检查ID计数器
  if (!data.nextIds || typeof data.nextIds !== 'object') {
    throw new Error('数据格式错误：缺少ID计数器')
  }

  // 验证游戏状态的必要字段
  const gameState = data.gameState
  if (!Array.isArray(gameState.stations)) {
    throw new Error('数据格式错误：站点数据格式错误')
  }
  if (!Array.isArray(gameState.lines)) {
    throw new Error('数据格式错误：线路数据格式错误')
  }
  if (!Array.isArray(gameState.trains)) {
    throw new Error('数据格式错误：列车数据格式错误')
  }

  return true
}

// 恢复游戏状态
function restoreGameState(saveData: SaveData): void {
  try {
    // 动态导入并恢复状态
    import('./game-state.js').then(({ state, economy, transactions, setNextIds }) => {
      // 恢复游戏状态
      Object.assign(state, saveData.gameState)

      // 恢复经济状态
      Object.assign(economy, saveData.economyState)

      // 恢复交易记录
      transactions.splice(0, transactions.length, ...saveData.transactions)

      // 恢复ID计数器
      setNextIds(saveData.nextIds.nextId, saveData.nextIds.nextTransactionId)

      console.log('✅ 游戏状态已恢复')
    })

  } catch (error) {
    console.error('❌ 恢复游戏状态失败:', error)
    throw new Error('恢复游戏状态时发生错误')
  }
}

// 创建文件输入元素用于导入
export function createFileInput(): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.style.display = 'none'
  return input
}