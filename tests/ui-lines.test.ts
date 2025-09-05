import { describe, it, expect } from 'vitest'
import { renderLinesPanel } from '../src/ui-lines.ts'

describe('ui-lines', () => {
  it('renders placeholder when no lines', () => {
    const container = document.createElement('div')
    container.id = 'lines-list'
    document.body.appendChild(container)

    renderLinesPanel()
    expect(container.innerHTML).toMatch(/暂无线路/)
  })
})

