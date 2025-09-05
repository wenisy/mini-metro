import { describe, it, expect } from 'vitest'
import { addStation, addLine } from '../src/game-state.ts'
import { findShortestPath } from '../src/path-planning.ts'

describe('path-planning BFS', () => {
  it('finds direct route on same line', () => {
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    const line = addLine(null, s1, s2, '1号线', true)
    expect(line).toBeTruthy()
    const route = findShortestPath(s1.id, s2.id)
    expect(route).toBeTruthy()
    expect(route!.transferCount).toBe(0)
    expect(route!.steps[0].stationId).toBe(s1.id)
    expect(route!.steps[route!.steps.length - 1].stationId).toBe(s2.id)
  })
})

