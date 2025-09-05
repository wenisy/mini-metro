// Vitest global setup for jsdom environment
// - stub alert/confirm
// - provide requestAnimationFrame
// - helpers to reset game state between tests

// Stubs
(globalThis as any).alert = (msg?: any) => { /* no-op in tests */ return undefined }
(globalThis as any).confirm = (_msg?: any) => true

if (!(globalThis as any).requestAnimationFrame) {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
}

// Helper: reset game state before each test to avoid cross-test pollution
import { beforeEach } from 'vitest'

beforeEach(async () => {
  const gs = await import('../src/game-state.ts')
  const { state, economy, transactions, moneyEffects } = gs as any
  // reset core state
  state.time = 0
  state.stations.length = 0
  state.lines.length = 0
  state.trains.length = 0
  state.autoSpawnEnabled = false
  state.gameOver = false
  state.currentLineId = null
  state.focusedLineId = null
  state.nextLineNum = 1
  state.showLinkChooser = false
  state.linkChooserFrom = null
  state.linkChooserTo = null
  state.passengerSpawnBaseRate = 0.05
  state.infiniteMode = false
  state.gameSpeed = 1
  state.paused = false

  economy.balance = 500
  economy.totalIncome = 0
  economy.totalExpense = 0
  economy.incomeHistory.length = 0
  economy.expenseHistory.length = 0

  transactions.length = 0
  moneyEffects.length = 0
})

