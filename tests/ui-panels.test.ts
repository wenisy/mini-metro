import { describe, it, expect } from 'vitest'
import { updateFinancialPanel, updateGameStats } from '../src/ui-panels.ts'
import { state } from '../src/game-state.ts'

function el(id: string, tag = 'span') {
  const e = document.createElement(tag)
  e.id = id
  document.body.appendChild(e)
  return e
}

describe('ui-panels', () => {
  it('updates financial fields without errors', () => {
    el('money-balance')
    el('total-income')
    el('total-expense')
    // required buttons for button state update
    const ids = ['toggle-auto', 'spawn-one', 'toggle-delete-mode', 'toggle-infinite-mode']
    ids.forEach(id => {
      const b = document.createElement('button')
      b.id = id
      document.body.appendChild(b)
    })
    updateFinancialPanel()
    expect(document.getElementById('money-balance')!.textContent).toBeDefined()
  })

  it('updates game stats', () => {
    el('game-time')
    el('station-count')
    el('train-count')
    state.time = 1
    updateGameStats()
    expect(document.getElementById('game-time')!.textContent).toBe('1')
  })
})

