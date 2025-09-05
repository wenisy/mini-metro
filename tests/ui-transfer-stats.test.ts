import { describe, it, expect } from 'vitest'
import { updateTransferStats } from '../src/ui-transfer-stats.ts'

describe('ui-transfer-stats', () => {
  it('writes compact stats to container', () => {
    const div = document.createElement('div')
    div.id = 'transfer-stats-content'
    document.body.appendChild(div)
    updateTransferStats()
    expect(div.innerHTML).toContain('总等待')
  })
})

