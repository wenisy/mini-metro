import { describe, it, expect } from 'vitest'
import { addStation, addLine, state } from '../src/game-state.ts'
import { updateAttachmentCandidates, smartAttachment, performAttachment } from '../src/smart-attachment.ts'

describe('smart-attachment candidates and perform', () => {
  it('attaches station to the line (endpoint or middle)', () => {
    const a = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const b = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    const c = addStation({ x: 50, y: 10 }, 'square', 'small')
    const line = addLine(null, a, b, 'SA号线', true)!

    // simulate dragging near c to find candidates that attach c to the line
    updateAttachmentCandidates({ x: c.pos.x, y: c.pos.y })
    expect(smartAttachment.attachmentCandidates.length).toBeGreaterThan(0)
    const candidate = smartAttachment.attachmentCandidates.find(x => x.line.id === line.id)
    expect(candidate).toBeTruthy()

    // execute attach
    performAttachment(candidate!)
    // now line should include c (whether middle or endpoint depending on candidate ordering)
    const idxC = line.stations.indexOf(c.id)
    expect(idxC).toBeGreaterThanOrEqual(0)

    // silence unused
    expect(state.lines.length).toBeGreaterThan(0)
  })
})
