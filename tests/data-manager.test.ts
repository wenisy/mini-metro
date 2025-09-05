import { describe, it, expect } from 'vitest'
import { createFileInput } from '../src/data-manager.ts'

describe('data-manager', () => {
  it('createFileInput returns hidden file input', () => {
    const input = createFileInput()
    expect(input.type).toBe('file')
    expect(input.style.display).toBe('none')
    expect(input.accept).toContain('.json')
  })
})

