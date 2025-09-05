import { describe, it, expect } from 'vitest'
import { setupCounter } from '../src/counter.ts'

describe('counter util', () => {
  it('increments on click', () => {
    const btn = document.createElement('button') as HTMLButtonElement
    setupCounter(btn)
    expect(btn.innerHTML).toMatch(/count is 0/)
    btn.click()
    expect(btn.innerHTML).toMatch(/count is 1/)
  })
})

