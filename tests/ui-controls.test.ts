import { describe, it, expect } from 'vitest'
import { setupUIControls } from '../src/ui-controls.ts'

function createElement<K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.id = id
  document.body.appendChild(el)
  return el
}

describe('ui-controls', () => {
  it('setupUIControls binds buttons without throwing', async () => {
    // required DOM elements used by setupUIControls and panels
    createElement('toggle-auto', 'button')
    createElement('spawn-one', 'button')
    createElement('toggle-delete-mode', 'button')
    createElement('toggle-infinite-mode', 'button')
    createElement('toggle-pause', 'button')
    createElement('toggle-viewport-spawn', 'button')
    createElement('passenger-rate', 'input')
    createElement('passenger-rate-value', 'span')
    createElement('passenger-rate-decrease', 'button')
    createElement('passenger-rate-increase', 'button')
    createElement('btn-speed-1x', 'button')
    createElement('btn-speed-2x', 'button')
    createElement('btn-speed-3x', 'button')
    createElement('btn-export-data', 'button')
    createElement('btn-import-data', 'button')
    // panels used by updateFinancialPanel
    createElement('money-balance', 'span')
    createElement('total-income', 'span')
    createElement('total-expense', 'span')

    // lines list container referenced elsewhere
    createElement('lines-list', 'div')

    // link chooser elements (not used here but safe to provide)
    createElement('link-chooser', 'div')
    createElement('link-chooser-text', 'div')
    createElement('link-chooser-buttons', 'div')

    // ensure there is a canvas element for possible viewport-based spawn logic
    const canvas = document.createElement('canvas')
    canvas.id = 'game'
    Object.defineProperty(canvas, 'clientWidth', { value: 800 })
    Object.defineProperty(canvas, 'clientHeight', { value: 600 })
    document.body.appendChild(canvas)

    setupUIControls()

    // basic assertion: labels should be initialized on buttons
    expect((document.getElementById('toggle-auto') as HTMLButtonElement).textContent).toMatch(/自动生成/)
  })
})

