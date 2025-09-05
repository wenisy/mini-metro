import { describe, it, expect } from 'vitest'
import {
  zeroByShape,
  clamp,
  dist2,
  addStation,
  isPositionValidForStation,
  addStationSafely,
  state,
  toggleInfiniteMode,
  calculateNewLineCost,
  calculateExtensionCost,
  COLORS,
  addLine,
} from '../src/game-state.ts'

describe('game-state basics', () => {
  it('zeroByShape returns zeros', () => {
    const z = zeroByShape()
    expect(Object.values(z).every(v => v === 0)).toBe(true)
  })

  it('clamp works', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('dist2 works', () => {
    expect(dist2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25)
  })

  it('addStation and validity check', () => {
    const s1 = addStation({ x: 100, y: 100 }, 'circle', 'small')
    expect(state.stations.includes(s1)).toBe(true)
    // within distance 10 -> invalid
    expect(isPositionValidForStation({ x: 105, y: 100 }, 10)).toBe(false)
  })

  it('addStationSafely respects minimum distance', () => {
    // existing station at 100,100
    const s2 = addStationSafely({ x: 105, y: 100 })
    // If too close, it will try to find alternative; must return a station
    expect(s2).not.toBeNull()
  })

  it('cost calculations and infinite mode', () => {
    const newLineCost = calculateNewLineCost()
    const extCost = calculateExtensionCost()
    expect(newLineCost).toBeGreaterThan(0)
    expect(extCost).toBeGreaterThan(0)
    const prev = state.infiniteMode
    toggleInfiniteMode()
    expect(state.infiniteMode).toBe(true)
    toggleInfiniteMode()
    expect(state.infiniteMode).toBe(prev)
  })

  it('addLine creates line and default train', () => {
    const a = addStation({ x: 10, y: 10 }, 'triangle', 'small')
    const b = addStation({ x: 50, y: 10 }, 'square', 'small')
    const line = addLine(COLORS[0], a, b, 'T1', true)
    expect(line).toBeTruthy()
    expect(state.lines.find(l => l.id === line!.id)).toBeTruthy()
    expect(state.trains.some(t => t.lineId === line!.id)).toBe(true)
  })
})
