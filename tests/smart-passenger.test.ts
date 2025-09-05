import { describe, it, expect } from 'vitest'
import { addStation, addLine, state } from '../src/game-state.ts'
import { smartPassengerBoarding, smartPassengerAlighting } from '../src/smart-passenger.ts'

describe('smart-passenger basics', () => {
  it('boarding and alighting update counts', () => {
    const a = addStation({ x: 0, y: 0 }, 'circle', 'small')
    const b = addStation({ x: 100, y: 0 }, 'triangle', 'small')
    const line = addLine(null, a, b, '1号线', true)!
    const train = state.trains.find(t => t.lineId === line.id)!
    const station = a

    // create a minimal passenger waiting at station a to go b
    const p: any = {
      id: 'p1',
      shape: 'triangle',
      fromStationId: a.id,
      toStationId: b.id,
      route: { from: a.id, to: b.id, steps: [{ stationId: a.id, lineId: line.id, isTransfer: false }, { stationId: b.id, lineId: line.id, isTransfer: false }], totalDistance: 1, transferCount: 0, estimatedTime: 1 },
      currentStep: 0,
      isWaitingForTransfer: false,
      boardTime: 0,
    }
    station.waitingPassengers.push(p)
    station.queueBy[p.shape]++

    smartPassengerBoarding(train, station)
    expect(train.passengers.length).toBe(1)

    const alighted = smartPassengerAlighting(train, b)
    expect(alighted).toBe(1)
    expect(train.passengers.length).toBe(0)
  })
})

