import { describe, it, expect } from 'vitest'
import { pointToLineSegmentDistance, createAttachmentAnimation, smartAttachment, updateAnimations } from '../src/smart-attachment.ts'

describe('smart-attachment', () => {
  it('pointToLineSegmentDistance projects within segment', () => {
    const { distance, projection } = pointToLineSegmentDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(distance).toBeCloseTo(5)
    expect(projection.x).toBeCloseTo(5)
    expect(projection.y).toBeCloseTo(0)
  })

  it('createAttachmentAnimation adds animation and updates', () => {
    createAttachmentAnimation({ x: 0, y: 0 }, { x: 10, y: 10 })
    expect(smartAttachment.animations.length).toBeGreaterThan(0)
    updateAnimations(0.2)
    // animations progress updated (not asserting exact value)
    expect(smartAttachment.animations[0].progress).toBeGreaterThan(0)
  })
})

