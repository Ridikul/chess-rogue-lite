import { describe, it, expect } from 'vitest'
import { RELIC_DEFINITIONS, ALL_RELIC_IDS } from './relics'
import { createRunState } from '../systems/RunState'

describe('RELIC_DEFINITIONS integrity', () => {
  it('ALL_RELIC_IDS matches keys of RELIC_DEFINITIONS', () => {
    expect(ALL_RELIC_IDS.sort()).toEqual(Object.keys(RELIC_DEFINITIONS).sort())
  })

  it('all relics have required fields', () => {
    Object.values(RELIC_DEFINITIONS).forEach(relic => {
      expect(relic.id).toBeTruthy()
      expect(relic.name).toBeTruthy()
      expect(relic.description).toBeTruthy()
    })
  })
})

describe('iron_crown onAcquire', () => {
  it('increases maxHp and currentHp by 5', () => {
    const run = createRunState()
    const relic = RELIC_DEFINITIONS['iron_crown']!
    relic.onAcquire!(run)
    expect(run.maxHp).toBe(35)
    expect(run.currentHp).toBe(35)
  })

  it('does not let currentHp exceed maxHp', () => {
    const run = createRunState()
    const relic = RELIC_DEFINITIONS['iron_crown']!
    relic.onAcquire!(run)
    expect(run.currentHp).toBeLessThanOrEqual(run.maxHp)
  })
})
