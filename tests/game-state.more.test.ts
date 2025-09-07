import { describe, it, expect } from 'vitest'
import {
  state,
  economy,
  addStation,
  addLine,
  findLineBetween,
  removeLine,
  hitTestStation,
  nearestStationWithin,
  getAvailableColor,
  getNextAvailableLineNumber,
  getStationLineCount,
  calculateDwellTime,
  isTransferStation,
  canExtendLine,
  getExtendableLines,
  extendLine,
  addTrain,
  upgradeTrainCapacity,
  addMoney,
  spendMoney,
  calculateModificationCost,
  calculateTicketPrice,
} from '../src/game-state.ts'

describe('game-state more functions', () => {
  it('hitTest and nearestStationWithin work', () => {
    const s1 = addStation({ x: 10, y: 10 }, 'circle', 'small')
    const s2 = addStation({ x: 60, y: 10 }, 'triangle', 'small')
    expect(hitTestStation({ x: 10, y: 10 })?.id).toBe(s1.id)
    expect(nearestStationWithin({ x: 58, y: 10 }, 5)?.id).toBe(s2.id)
  })

  it('color availability and next line number', () => {
    const a = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const b = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    const l1 = addLine(null, a, b, '1号线', true)!
    expect(l1).toBeTruthy()
    const next = getNextAvailableLineNumber()
    expect(next).toBeGreaterThanOrEqual(2)
    const color = getAvailableColor()
    expect(typeof color).toBe('string')
  })

  it('findLineBetween and removeLine', () => {
    const a = addStation({ x: 0, y: 0 }, 'square', 'small')
    const b = addStation({ x: 10, y: 0 }, 'star', 'small')
    const line = addLine(null, a, b, 'X号线', true)!
    expect(findLineBetween(a.id, b.id)?.id).toBe(line.id)
    const trainCountBefore = state.trains.length
    removeLine(line.id)
    expect(findLineBetween(a.id, b.id)).toBeNull()
    expect(state.trains.length).toBeLessThan(trainCountBefore)
  })

  it('transfer checks and dwell time scale with lines', () => {
    const sA = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const sB = addStation({ x: 50, y: 0 }, 'triangle', 'small')
    const sC = addStation({ x: 100, y: 0 }, 'square', 'small')
    const lA = addLine(null, sA, sB, 'A号线', true)!
    // extend to include sC
    lA.stations.push(sC.id)
    const baseDwell = calculateDwellTime(sB.id)
    // add another line that shares sB
    const lB = addLine(null, sB, sC, 'B号线', true)!
    expect(getStationLineCount(sB.id)).toBeGreaterThanOrEqual(2)
    expect(isTransferStation(sB.id)).toBe(true)
    const transferDwell = calculateDwellTime(sB.id)
    expect(transferDwell).toBeGreaterThan(baseDwell)
    // sanity: avoid unused vars
    expect(lB.id).toBeGreaterThan(0)
  })

  it('extendLine charges economy and returns true', () => {
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 50, y: 0 }, 'triangle', 'small')
    const s3 = addStation({ x: 100, y: 0 }, 'square', 'small')
    const line = addLine(null, s1, s2, 'E号线', true)!
    const before = economy.balance
    const ok = extendLine(line, 0, { x: 25, y: 0 })
    expect(ok).toBe(true)
    expect(economy.balance).toBeLessThan(before)
    // actually extend
    line.stations.push(s3.id)
  })

  it('getExtendableLines/canExtendLine logic', () => {
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 50, y: 0 }, 'triangle', 'small')
    const s3 = addStation({ x: 100, y: 0 }, 'square', 'small')
    const line = addLine(null, s1, s2, 'C号线', true)!
    const ext = getExtendableLines(s1, s3)
    expect(ext.some(l => l.id === line.id)).toBe(true)
    expect(canExtendLine(line, s1, s3)).toBe(true)
  })

  it('addTrain and upgradeTrainCapacity', () => {
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 50, y: 0 }, 'triangle', 'small')
    const line = addLine(null, s1, s2, 'T号线', true)!
    const ok = addTrain(line.id)
    expect(ok).toBe(true)
    const before = state.trains.filter(t => t.lineId === line.id).map(t => t.capacity)
    const upgraded = upgradeTrainCapacity(line.id)
    expect(upgraded).toBe(true)
    const after = state.trains.filter(t => t.lineId === line.id).map(t => t.capacity)
    expect(after.every((c, i) => c === before[i] + 20)).toBe(true)
  })

  it('economy addMoney/spendMoney and ticket price', () => {
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 50, y: 0 }, 'triangle', 'small')
    const line = addLine(null, s1, s2, 'P号线', true)!
    const bal0 = economy.balance
    addMoney(100, 'test income', s1.pos)
    expect(economy.balance).toBe(bal0 + 100)
    const bal1 = economy.balance
    spendMoney(50, 'test expense', s1.pos)
    expect(economy.balance).toBe(bal1 - 50)
    const price = calculateTicketPrice(s1.id, s2.id, 'circle')
    expect(price).toBeGreaterThan(0)
    expect(calculateModificationCost()).toBeGreaterThan(0)
    // unused var to silence ts removal warning
    expect(line.id).toBeGreaterThan(0)
  })
})

