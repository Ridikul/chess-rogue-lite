import { describe, it, expect } from 'vitest'
import {
  createRunState,
  generateMap,
  getCurrentNode,
  advanceToNode,
  applyDamage,
  healHp,
  rewardCombat,
  hasRelic,
} from './RunState'
import { RELIC_DEFINITIONS } from '../types/relics'

describe('generateMap', () => {
  it('contains a start node', () => {
    const map = generateMap()
    expect(map.find(n => n.id === 'start')).toBeDefined()
  })

  it('contains a boss node', () => {
    const map = generateMap()
    expect(map.find(n => n.id === 'boss')).toBeDefined()
  })

  it('all connections point to existing nodes', () => {
    const map = generateMap()
    const ids = new Set(map.map(n => n.id))
    map.forEach(node => {
      node.connections.forEach(connId => {
        expect(ids.has(connId), `Connection ${connId} from ${node.id} does not exist`).toBe(true)
      })
    })
  })

  it('all nodes start uncleared', () => {
    const map = generateMap()
    map.forEach(n => expect(n.cleared).toBe(false))
  })
})

describe('createRunState', () => {
  it('initializes with full HP', () => {
    const run = createRunState()
    expect(run.currentHp).toBe(run.maxHp)
  })

  it('starts on the start node', () => {
    const run = createRunState()
    expect(run.currentNodeId).toBe('start')
  })

  it('starts with no relics and 10 gold', () => {
    const run = createRunState()
    expect(run.relics).toHaveLength(0)
    expect(run.gold).toBe(10)
  })

  it('starts with a non-empty deck', () => {
    const run = createRunState()
    expect(run.deck.length).toBeGreaterThan(0)
  })
})

describe('getCurrentNode', () => {
  it('returns the current node', () => {
    const run = createRunState()
    const node = getCurrentNode(run)
    expect(node.id).toBe('start')
  })

  it('throws if currentNodeId is invalid', () => {
    const run = { ...createRunState(), currentNodeId: 'nonexistent' }
    expect(() => getCurrentNode(run)).toThrow()
  })
})

describe('advanceToNode', () => {
  it('moves to a connected node', () => {
    const run = createRunState()
    const startNode = getCurrentNode(run)
    const nextId = startNode.connections[0]
    const newRun = advanceToNode(run, nextId)
    expect(newRun.currentNodeId).toBe(nextId)
  })

  it('marks the current node as cleared', () => {
    const run = createRunState()
    const nextId = getCurrentNode(run).connections[0]
    const newRun = advanceToNode(run, nextId)
    const cleared = newRun.map.find(n => n.id === 'start')
    expect(cleared?.cleared).toBe(true)
  })

  it('increments floor', () => {
    const run = createRunState()
    const nextId = getCurrentNode(run).connections[0]
    const newRun = advanceToNode(run, nextId)
    expect(newRun.floor).toBe(run.floor + 1)
  })

  it('throws when trying to go to an unconnected node', () => {
    const run = createRunState()
    expect(() => advanceToNode(run, 'boss')).toThrow()
  })

  it('does not mutate the original run state', () => {
    const run = createRunState()
    const nextId = getCurrentNode(run).connections[0]
    advanceToNode(run, nextId)
    expect(run.currentNodeId).toBe('start')
  })
})

describe('applyDamage', () => {
  it('reduces HP by the given amount', () => {
    const run = createRunState()
    const newRun = applyDamage(run, 5)
    expect(newRun.currentHp).toBe(run.currentHp - 5)
  })

  it('does not go below 0', () => {
    const run = createRunState()
    const newRun = applyDamage(run, 9999)
    expect(newRun.currentHp).toBe(0)
  })

  it('does not mutate the original', () => {
    const run = createRunState()
    const originalHp = run.currentHp
    applyDamage(run, 5)
    expect(run.currentHp).toBe(originalHp)
  })
})

describe('healHp', () => {
  it('increases HP by the given amount', () => {
    const run = { ...createRunState(), currentHp: 10 }
    const newRun = healHp(run, 5)
    expect(newRun.currentHp).toBe(15)
  })

  it('does not exceed maxHp', () => {
    const run = createRunState()
    const newRun = healHp(run, 9999)
    expect(newRun.currentHp).toBe(run.maxHp)
  })
})

describe('rewardCombat', () => {
  it('adds gold based on floor', () => {
    const run = createRunState()
    const newRun = rewardCombat(run)
    expect(newRun.gold).toBeGreaterThan(0)
  })

  it('gives exactly 45 + floor * 7 gold (on top of existing gold)', () => {
    // createRunState starts with gold=10; rewardCombat adds 45 + floor*7
    expect(rewardCombat({ ...createRunState(), floor: 1 }).gold).toBe(10 + 52)
    expect(rewardCombat({ ...createRunState(), floor: 3 }).gold).toBe(10 + 66)
    expect(rewardCombat({ ...createRunState(), floor: 5 }).gold).toBe(10 + 80)
  })

  it('adds bonus gold with gold_coin relic', () => {
    const run = { ...createRunState(), relics: [RELIC_DEFINITIONS['gold_coin']!] }
    const withRelic = rewardCombat(run)
    const without = rewardCombat(createRunState())
    expect(withRelic.gold).toBe(without.gold + 3)
  })

  it('does not mutate the original run state', () => {
    const run = createRunState()
    const originalGold = run.gold
    rewardCombat(run)
    expect(run.gold).toBe(originalGold)
  })
})

describe('hasRelic', () => {
  it('returns false when relic not owned', () => {
    const run = createRunState()
    expect(hasRelic(run, 'iron_crown')).toBe(false)
  })

  it('returns true when relic is owned', () => {
    const run = { ...createRunState(), relics: [RELIC_DEFINITIONS['iron_crown']!] }
    expect(hasRelic(run, 'iron_crown')).toBe(true)
  })
})
