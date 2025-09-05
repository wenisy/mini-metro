import { describe, it, expect } from 'vitest'
import { drawStation, drawLine, drawTrain } from '../src/rendering.ts'
import { addStation, addLine, state, zeroByShape } from '../src/game-state.ts'

// Create a very permissive fake 2D context with no-op methods and assignable properties
function createFakeCtx(): any {
  const fn = () => {}
  const props: any = {}
  const handler = {
    get(_t: any, prop: string) {
      if (prop in props) return props[prop]
      return fn
    },
    set(_t: any, prop: string, value: any) {
      props[prop] = value
      return true
    },
  }
  return new Proxy({}, handler)
}

describe('rendering draw calls do not throw', () => {
  it('draws station/line/train with fake context', () => {
    const ctx = createFakeCtx()
    const s1 = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const s2 = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    const line = addLine('#ff0000', s1, s2, 'R号线', true)!
    // draw station
    expect(() => drawStation(ctx, s1)).not.toThrow()
    // draw line
    expect(() => drawLine(ctx, line)).not.toThrow()
    // draw train
    const train = state.trains.find(t => t.lineId === line.id)!
    // ensure minimal passengersBy exists
    train.passengersBy = zeroByShape()
    expect(() => drawTrain(ctx, train)).not.toThrow()
  })
})

