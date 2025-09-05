import { describe, it, expect } from 'vitest'
import { Camera, setGlobalCamera, globalCamera } from '../src/rendering.ts'

describe('rendering helpers', () => {
  it('Camera toWorld/toScreen invert', () => {
    const cam = new Camera()
    cam.pos = { x: 10, y: 20 }
    cam.scale = 2
    const screen = cam.toScreen({ x: 12, y: 23 })
    const world = cam.toWorld(screen)
    expect(world.x).toBeCloseTo(12)
    expect(world.y).toBeCloseTo(23)
  })

  it('setGlobalCamera stores reference', () => {
    const cam = new Camera()
    setGlobalCamera(cam)
    expect(globalCamera).toBe(cam)
  })
})

