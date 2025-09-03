import type { Train, TrainVisualState } from './types.js'
import { total } from './game-state.js'

// 列车视觉配置
export const trainVisualConfig = {
  // 长度配置
  length: {
    min: 18,              // 最小长度（增大基础长度）
    max: 48,              // 最大长度（增大最大长度让变化更明显）
    transitionSpeed: 3.0  // 长度变化速度（每秒像素）
  },

  // 载客状态可视化
  capacity: {
    colors: {
      empty: '#e8f5e8',     // 空载颜色（浅绿）
      normal: '#4caf50',    // 正常载客颜色（绿色）
      warning: '#ff9800',   // 接近满载颜色（橙色）
      full: '#f44336',      // 满载颜色（红色）
      border: '#333'        // 边框颜色
    },
    thresholds: {
      warning: 0.7,         // 警告阈值（70%）
      full: 0.95            // 满载阈值（95%）
    }
  },

  // 动画配置
  animation: {
    lengthTransition: 0.5,    // 长度变化动画时间（秒）
    colorTransition: 0.3,     // 颜色变化动画时间（秒）
    pulseSpeed: 2.0,          // 满载时的脉冲速度（每秒周期）
    pulseIntensity: 0.3       // 脉冲强度
  },

  // 进度条配置
  progressBar: {
    height: 2,              // 进度条高度
    margin: 1,              // 进度条边距
    backgroundColor: 'rgba(255,255,255,0.3)',
    foregroundColor: 'rgba(255,255,255,0.8)'
  }
}

// 初始化列车视觉状态
export function initTrainVisualState(train: Train): TrainVisualState {
  const totalPassengers = total(train.passengersBy)
  const loadRatio = totalPassengers / train.capacity
  const targetLength = calculateTargetLength(loadRatio)
  const targetColor = calculateTargetColor(loadRatio)

  return {
    currentLength: targetLength,
    targetLength: targetLength,
    currentColor: targetColor,
    targetColor: targetColor,
    pulsePhase: 0,
    lastUpdateTime: performance.now()
  }
}

// 计算目标长度
export function calculateTargetLength(loadRatio: number): number {
  const { min, max } = trainVisualConfig.length
  // 使用平方根函数让长度变化更明显
  const normalizedRatio = Math.sqrt(Math.max(0, Math.min(1, loadRatio)))
  return min + (max - min) * normalizedRatio
}

// 计算目标颜色
export function calculateTargetColor(loadRatio: number): string {
  const { colors, thresholds } = trainVisualConfig.capacity

  if (loadRatio <= 0.1) {
    return colors.empty
  } else if (loadRatio < thresholds.warning) {
    return colors.normal
  } else if (loadRatio < thresholds.full) {
    return colors.warning
  } else {
    return colors.full
  }
}

// 颜色插值函数
export function interpolateColor(color1: string, color2: string, factor: number): string {
  if (factor <= 0) return color1
  if (factor >= 1) return color2

  // 解析颜色（支持十六进制和RGB）
  const parseColor = (color: string): [number, number, number] => {
    if (color.startsWith('#')) {
      const hex = color.slice(1)
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ]
      }
    }
    // 简化处理，返回默认值
    return [255, 255, 255]
  }

  const [r1, g1, b1] = parseColor(color1)
  const [r2, g2, b2] = parseColor(color2)

  const r = Math.round(r1 + (r2 - r1) * factor)
  const g = Math.round(g1 + (g2 - g1) * factor)
  const b = Math.round(b1 + (b2 - b1) * factor)

  return `rgb(${r}, ${g}, ${b})`
}

// 缓动函数
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// 平滑插值函数（使用指数衰减）
export function smoothLerp(current: number, target: number, speed: number, deltaTime: number): number {
  const diff = target - current
  if (Math.abs(diff) < 0.1) return target

  // 使用指数衰减实现更自然的动画
  const factor = 1 - Math.exp(-speed * deltaTime)
  return current + diff * factor
}

// 带缓动的插值函数
export function smoothLerpWithEasing(current: number, target: number, speed: number, deltaTime: number, easingFn = easeOutCubic): number {
  const diff = target - current
  if (Math.abs(diff) < 0.1) return target

  const rawFactor = Math.min(speed * deltaTime, 1)
  const easedFactor = easingFn(rawFactor)
  return current + diff * easedFactor
}

// 性能优化：缓存计算结果
const visualCache = new Map<number, {
  lastPassengerCount: number
  lastCapacity: number
  lastUpdateTime: number
  cachedLength: number
  cachedColor: string
}>()

// 更新列车视觉状态（带性能优化）
export function updateTrainVisualState(train: Train, deltaTime: number): void {
  // 确保列车有视觉状态
  if (!train.visual) {
    train.visual = initTrainVisualState(train)
    return
  }

  const currentTime = performance.now()
  const dt = Math.min(deltaTime, 1 / 30) // 限制最大时间步长

  // 计算当前载客状态
  const totalPassengers = total(train.passengersBy)
  const loadRatio = totalPassengers / train.capacity

  // 性能优化：检查是否需要重新计算
  const cache = visualCache.get(train.id)
  const needsUpdate = !cache ||
    cache.lastPassengerCount !== totalPassengers ||
    cache.lastCapacity !== train.capacity ||
    currentTime - cache.lastUpdateTime > 100 // 最多100ms更新一次

  if (needsUpdate) {
    // 更新目标值
    train.visual.targetLength = calculateTargetLength(loadRatio)
    train.visual.targetColor = calculateTargetColor(loadRatio)

    // 更新缓存
    visualCache.set(train.id, {
      lastPassengerCount: totalPassengers,
      lastCapacity: train.capacity,
      lastUpdateTime: currentTime,
      cachedLength: train.visual.targetLength,
      cachedColor: train.visual.targetColor
    })
  }

  // 平滑更新当前长度（使用指数衰减）
  const lengthDiff = Math.abs(train.visual.currentLength - train.visual.targetLength)
  if (lengthDiff > 0.1) {
    train.visual.currentLength = smoothLerp(
      train.visual.currentLength,
      train.visual.targetLength,
      trainVisualConfig.length.transitionSpeed,
      dt
    )
  }

  // 平滑更新颜色（如果颜色不同，进行插值）
  if (train.visual.currentColor !== train.visual.targetColor) {
    // 简化版本：直接切换到目标颜色
    // 在更复杂的实现中，可以使用颜色插值
    train.visual.currentColor = train.visual.targetColor
  }

  // 更新脉冲动画（满载时）
  if (loadRatio >= trainVisualConfig.capacity.thresholds.full) {
    train.visual.pulsePhase += trainVisualConfig.animation.pulseSpeed * dt
    if (train.visual.pulsePhase > Math.PI * 2) {
      train.visual.pulsePhase -= Math.PI * 2
    }
  } else if (train.visual.pulsePhase > 0) {
    // 逐渐减少脉冲
    train.visual.pulsePhase = Math.max(0, train.visual.pulsePhase - trainVisualConfig.animation.pulseSpeed * dt * 2)
  }

  train.visual.lastUpdateTime = currentTime
}

// 清理缓存（当列车被删除时调用）
export function clearTrainVisualCache(trainId: number): void {
  visualCache.delete(trainId)
}

// 获取脉冲强度
export function getPulseIntensity(visual: TrainVisualState): number {
  if (visual.pulsePhase === 0) return 0
  return Math.sin(visual.pulsePhase) * trainVisualConfig.animation.pulseIntensity
}

// 获取列车显示长度
export function getTrainDisplayLength(train: Train): number {
  if (!train.visual) {
    const totalPassengers = total(train.passengersBy)
    const loadRatio = totalPassengers / train.capacity
    return calculateTargetLength(loadRatio)
  }
  return train.visual.currentLength
}

// 获取列车显示颜色
export function getTrainDisplayColor(train: Train): string {
  if (!train.visual) {
    const totalPassengers = total(train.passengersBy)
    const loadRatio = totalPassengers / train.capacity
    return calculateTargetColor(loadRatio)
  }
  return train.visual.currentColor
}

// 获取载客率
export function getLoadRatio(train: Train): number {
  const totalPassengers = total(train.passengersBy)
  return totalPassengers / train.capacity
}

// 检查是否需要警告效果
export function shouldShowWarning(train: Train): boolean {
  const loadRatio = getLoadRatio(train)
  return loadRatio >= trainVisualConfig.capacity.thresholds.warning
}

// 检查是否满载
export function isTrainFull(train: Train): boolean {
  const loadRatio = getLoadRatio(train)
  return loadRatio >= trainVisualConfig.capacity.thresholds.full
}

// 获取列车阴影效果
export function getTrainShadowIntensity(train: Train): number {
  const loadRatio = getLoadRatio(train)
  // 载客越多，阴影越深
  return 0.2 + loadRatio * 0.3
}
