import { state } from './game-state.js'
import { getStationCongestionLevel, getLineEfficiencyStats } from './smart-passenger.js'
import { getCacheStats } from './path-planning.js'

// 更新换乘统计面板
export function updateTransferStats(): void {
  const transferStatsContent = document.getElementById('transfer-stats-content')
  if (!transferStatsContent) return

  // 收集统计数据
  const stats = collectTransferStats()
  
  // 生成HTML
  const html = generateTransferStatsHTML(stats)
  transferStatsContent.innerHTML = html
}

// 收集换乘统计数据
function collectTransferStats() {
  let totalWaitingPassengers = 0
  let totalTransferPassengers = 0
  let congestionStations = 0
  let transferStations = 0
  
  const stationStats: Array<{
    id: number,
    waiting: number,
    transfer: number,
    congestion: string,
    isTransfer: boolean
  }> = []

  // 统计站点信息
  for (const station of state.stations) {
    const waiting = station.waitingPassengers.length
    const transfer = station.transferPassengers.length
    const congestion = getStationCongestionLevel(station)
    const isTransfer = state.lines.filter(l => l.stations.includes(station.id)).length > 1

    totalWaitingPassengers += waiting
    totalTransferPassengers += transfer
    
    if (congestion === 'high' || congestion === 'critical') {
      congestionStations++
    }
    
    if (isTransfer) {
      transferStations++
    }

    stationStats.push({
      id: station.id,
      waiting,
      transfer,
      congestion,
      isTransfer
    })
  }

  // 统计线路效率
  const lineStats = state.lines.map(line => {
    const efficiency = getLineEfficiencyStats(line.id)
    return {
      id: line.id,
      name: line.name,
      color: line.color,
      ...efficiency
    }
  })

  // 路径缓存统计
  const cacheStats = getCacheStats()

  return {
    totalWaitingPassengers,
    totalTransferPassengers,
    congestionStations,
    transferStations,
    stationStats: stationStats.filter(s => s.waiting > 0 || s.transfer > 0 || s.congestion !== 'low'),
    lineStats,
    cacheStats
  }
}

// 生成换乘统计HTML（紧凑版）
function generateTransferStatsHTML(stats: any): string {
  let html = `
    <div style="margin-bottom:6px;">
      <div>总等待: <span style="color:#81C784;">${stats.totalWaitingPassengers}</span> 人</div>
      <div>换乘中: <span style="color:#FFB74D;">${stats.totalTransferPassengers}</span> 人</div>
      <div>拥堵站: <span style="color:#F06292;">${stats.congestionStations}</span> 个</div>
      <div>换乘站: <span style="color:#64B5F6;">${stats.transferStations}</span> 个</div>
    </div>
  `

  // 显示拥堵站点（紧凑版）
  if (stats.stationStats.length > 0) {
    html += `
      <div style="margin-bottom:6px;">
        <div style="font-weight:bold; color:#FFA726; margin-bottom:2px;">🚨 关注站点:</div>
    `

    for (const station of stats.stationStats.slice(0, 3)) { // 只显示前3个
      const congestionColor = getCongestionColor(station.congestion)
      const transferIcon = station.isTransfer ? '🔄' : ''

      html += `
        <div style="margin-bottom:1px; color:${congestionColor};">
          ${transferIcon}站点${station.id}: ${station.waiting}+${station.transfer}
        </div>
      `
    }

    html += `</div>`
  }

  // 显示线路效率（紧凑版）
  if (stats.lineStats.length > 0) {
    const topLines = stats.lineStats
      .filter((line: any) => line.averageLoadFactor > 0.1) // 只显示有负载的线路
      .slice(0, 2) // 只显示前2条线路

    if (topLines.length > 0) {
      html += `
        <div style="margin-bottom:6px;">
          <div style="font-weight:bold; color:#81C784; margin-bottom:2px;">📈 线路负载:</div>
      `

      for (const line of topLines) {
        const loadFactor = (line.averageLoadFactor * 100).toFixed(0)
        const loadColor = getLoadFactorColor(line.averageLoadFactor)

        html += `
          <div style="margin-bottom:1px;">
            <span style="color:${line.color};">●</span> ${line.name}:
            <span style="color:${loadColor};">${loadFactor}%</span>
            ${line.congestionPoints.length > 0 ? ` ⚠️${line.congestionPoints.length}` : ''}
          </div>
        `
      }

      html += `</div>`
    }
  }

  // 显示系统状态（紧凑版）
  const totalPassengers = stats.totalWaitingPassengers + stats.totalTransferPassengers
  const systemStatus = getSystemStatus(totalPassengers, stats.congestionStations)

  html += `
    <div style="margin-top:4px; padding:3px; border-radius:3px; background:${systemStatus.bgColor};">
      <div style="color:${systemStatus.textColor}; font-weight:bold;">
        ${systemStatus.icon} ${systemStatus.text}
      </div>
    </div>
  `

  // 显示路径缓存（简化版）
  if (stats.cacheStats.size > 0) {
    html += `
      <div style="margin-top:4px; color:#E1BEE7;">
        🧠 缓存: ${stats.cacheStats.size} 条路径
      </div>
    `
  }

  return html
}

// 获取拥堵程度颜色
function getCongestionColor(congestion: string): string {
  switch (congestion) {
    case 'low': return '#81C784'
    case 'medium': return '#FFB74D'
    case 'high': return '#F06292'
    case 'critical': return '#F44336'
    default: return '#FFFFFF'
  }
}

// 获取负载率颜色
function getLoadFactorColor(loadFactor: number): string {
  if (loadFactor < 0.3) return '#81C784'  // 绿色 - 低负载
  if (loadFactor < 0.7) return '#FFB74D'  // 橙色 - 中等负载
  if (loadFactor < 0.9) return '#F06292'  // 粉色 - 高负载
  return '#F44336'  // 红色 - 过载
}

// 获取系统状态
function getSystemStatus(totalPassengers: number, congestionStations: number): {
  icon: string,
  text: string,
  bgColor: string,
  textColor: string
} {
  if (congestionStations > 3) {
    return {
      icon: '🚨',
      text: '系统拥堵',
      bgColor: 'rgba(244, 67, 54, 0.2)',
      textColor: '#F44336'
    }
  } else if (congestionStations > 1) {
    return {
      icon: '⚠️',
      text: '需要关注',
      bgColor: 'rgba(255, 183, 77, 0.2)',
      textColor: '#FFB74D'
    }
  } else if (totalPassengers > 50) {
    return {
      icon: '📈',
      text: '运行繁忙',
      bgColor: 'rgba(129, 199, 132, 0.2)',
      textColor: '#81C784'
    }
  } else {
    return {
      icon: '✅',
      text: '运行良好',
      bgColor: 'rgba(129, 199, 132, 0.2)',
      textColor: '#81C784'
    }
  }
}

// 初始化换乘统计面板
export function initTransferStats(): void {
  // 可以在这里添加初始化逻辑
  updateTransferStats()
}
