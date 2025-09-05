import { describe, it, expect } from 'vitest'
import type { Vec2, Shape } from '../src/types.ts'

describe('types module', () => {
  it('Vec2 and Shape type usage', () => {
    const p: Vec2 = { x: 1, y: 2 }
    const s: Shape = 'circle'
    expect(p.x + p.y).toBe(3)
    expect(typeof s).toBe('string')
  })
})

