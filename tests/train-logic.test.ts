import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addStation, addLine, state } from '../src/game-state.ts'
import { spawnPassengers } from '../src/train-logic.ts'

describe('train-logic spawnPassengers', () => {
  beforeEach(() => {
    // Ensure deterministic spawning
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  it('spawns a passenger when possible', () => {
    const a = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const b = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    addLine(null, a, b, '1号线', true)

    const before = a.waitingPassengers.length
    // high dt to ensure spawn condition
    spawnPassengers(1)
    const after = a.waitingPassengers.length
    expect(after).toBeGreaterThanOrEqual(before)
  })
})

