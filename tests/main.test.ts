import { describe, it, expect } from 'vitest'
import { main } from '../src/main.ts'

describe('main module', () => {
  it('exports main function', () => {
    expect(typeof main).toBe('function')
  })
})

