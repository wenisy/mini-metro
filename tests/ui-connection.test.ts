import { describe, it, expect } from 'vitest'
import { hideLinkChooser } from '../src/ui-connection.ts'
import { state } from '../src/game-state.ts'

describe('ui-connection', () => {
  it('hideLinkChooser hides chooser and clears state', () => {
    const chooser = document.createElement('div')
    chooser.id = 'link-chooser'
    chooser.style.display = 'block'
    document.body.appendChild(chooser)

    state.showLinkChooser = true
    hideLinkChooser()
    expect(state.showLinkChooser).toBe(false)
    expect(chooser.style.display).toBe('none')
  })
})

