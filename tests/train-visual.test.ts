import { describe, it, expect } from 'vitest'
import { calculateTargetLength, calculateTargetColor, trainVisualConfig, getLoadRatio } from '../src/train-visual.ts'
import { addStation, addLine, state } from '../src/game-state.ts'

describe('train-visual', () => {
  it('target length increases with load', () => {
    const low = calculateTargetLength(0)
    const high = calculateTargetLength(1)
    expect(high).toBeGreaterThan(low)
    expect(low).toBeGreaterThanOrEqual(trainVisualConfig.length.min)
    expect(high).toBeLessThanOrEqual(trainVisualConfig.length.max)
  })

  it('target color changes across thresholds', () => {
    const c1 = calculateTargetColor(0)
    const c2 = calculateTargetColor(trainVisualConfig.capacity.thresholds.warning + 0.01)
    const c3 = calculateTargetColor(1)
    expect(c1).not.toBe(c2)
    expect(c3).not.toBe(c2)
  })

  it('getLoadRatio uses passengersBy and capacity', () => {
    const a = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const b = addStation({ x: 10, y: 0 }, 'triangle', 'small')
    const line = addLine(null, a, b, '1号线', true)!
    const train = state.trains.find(t => t.lineId === line.id)!
    const ratio0 = getLoadRatio(train as any)
    expect(ratio0).toBe(0)
  })
})

