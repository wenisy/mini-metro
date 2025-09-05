import { describe, it, expect } from 'vitest'
import { pointerPos } from '../src/input-handling.ts'

describe('input-handling pointerPos', () => {
  it('converts client to canvas coords using DPR-aware rect', () => {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    Object.defineProperty(canvas, 'width', { value: 200 })
    Object.defineProperty(canvas, 'height', { value: 100 })
    // simulate CSS size 100x50 -> scale 2x both
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 50,
      width: 100,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as any)

    const p = pointerPos({ clientX: 10, clientY: 10 } as any, canvas)
    // scale factor 2, so result should be 20,20
    expect(p.x).toBeCloseTo(20)
    expect(p.y).toBeCloseTo(20)
  })
})

