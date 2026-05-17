import type { RunState, MapNode, NodeType } from '../types/index'
import { buildStarterDeck } from './CardSystem'

function makeNode(id: string, type: NodeType, depth: number, connections: string[]): MapNode {
  return { id, type, depth, cleared: false, connections }
}

// Map layout: 10 depths (0=start virtual, 9=boss).
// Node IDs at depths 1..8 follow `n{depth}{letter}` (n1a, n2b, …).
const MAP_LAYOUT: NodeType[][] = [
  ['combat'],                          // 0 — start (not rendered)
  ['combat', 'combat'],                // 1
  ['combat', 'shop', 'combat'],        // 2
  ['combat', 'event', 'combat'],       // 3
  ['elite', 'combat'],                 // 4
  ['combat', 'rest', 'event'],         // 5
  ['combat', 'shop', 'combat'],        // 6
  ['elite', 'combat'],                 // 7
  ['rest'],                            // 8
  ['boss'],                            // 9
]

const NODE_ID_LETTERS = 'abcdefg'

function nodeIdAt(depth: number, indexInDepth: number, lastDepth: number): string {
  if (depth === 0) return 'start'
  if (depth === lastDepth) return 'boss'
  return `n${depth}${NODE_ID_LETTERS[indexInDepth]}`
}

export function generateMap(): MapNode[] {
  const nodes: MapNode[] = []
  const lastDepth = MAP_LAYOUT.length - 1

  for (let d = 0; d < MAP_LAYOUT.length; d++) {
    const types = MAP_LAYOUT[d]
    for (let i = 0; i < types.length; i++) {
      nodes.push(makeNode(nodeIdAt(d, i, lastDepth), types[i], d, []))
    }
  }

  // Connect each depth to the next so every node is reachable from start
  // and every node reaches the boss.
  for (let d = 0; d < lastDepth; d++) {
    const cur = nodes.filter(n => n.depth === d)
    const next = nodes.filter(n => n.depth === d + 1)

    if (next.length === 1) {
      cur.forEach(n => n.connections.push(next[0].id))
      continue
    }

    cur.forEach((n, i) => {
      const frac = cur.length === 1 ? 0.5 : i / (cur.length - 1)
      const baseIdx = Math.min(next.length - 1, Math.round(frac * (next.length - 1)))
      n.connections.push(next[baseIdx].id)
      // Branching: ~55% chance to also connect to an adjacent next-depth node
      const offsetCandidates = [-1, 1].filter(o => baseIdx + o >= 0 && baseIdx + o < next.length)
      if (offsetCandidates.length > 0 && Math.random() < 0.55) {
        const offset = offsetCandidates[Math.floor(Math.random() * offsetCandidates.length)]
        n.connections.push(next[baseIdx + offset].id)
      }
    })

    // Ensure every next-depth node has at least one inbound connection
    const inbound = new Set<string>()
    cur.forEach(n => n.connections.forEach(c => inbound.add(c)))
    next.forEach((nn, idx) => {
      if (inbound.has(nn.id)) return
      const frac = next.length === 1 ? 0.5 : idx / (next.length - 1)
      const fromIdx = cur.length === 1 ? 0 : Math.round(frac * (cur.length - 1))
      if (!cur[fromIdx].connections.includes(nn.id)) cur[fromIdx].connections.push(nn.id)
    })
  }

  return nodes
}

export function createRunState(): RunState {
  const deck = buildStarterDeck()
  return {
    deck,
    relics: [],
    gold: 10,
    maxHp: 30,
    currentHp: 30,
    map: generateMap(),
    currentNodeId: 'start',
    floor: 0,
  }
}

export function getCurrentNode(run: RunState): MapNode {
  const node = run.map.find(n => n.id === run.currentNodeId)
  if (!node) throw new Error(`Node not found: ${run.currentNodeId}`)
  return node
}

export function advanceToNode(run: RunState, nodeId: string): RunState {
  const current = getCurrentNode(run)
  if (!current.connections.includes(nodeId)) {
    throw new Error(`Cannot advance to ${nodeId} from ${current.id}`)
  }
  const newMap = run.map.map(n =>
    n.id === current.id ? { ...n, cleared: true } : n,
  )
  return {
    ...run,
    map: newMap,
    currentNodeId: nodeId,
    floor: run.floor + 1,
  }
}

export function applyDamage(run: RunState, amount: number): RunState {
  return { ...run, currentHp: Math.max(0, run.currentHp - amount) }
}

export function healHp(run: RunState, amount: number): RunState {
  return { ...run, currentHp: Math.min(run.maxHp, run.currentHp + amount) }
}

export function combatGoldReward(run: RunState): number {
  const goldBonus = run.relics.some(r => r.id === 'gold_coin') ? 3 : 0
  return 45 + run.floor * 7 + goldBonus
}

export function rewardCombat(run: RunState): RunState {
  return { ...run, gold: run.gold + combatGoldReward(run) }
}

export function hasRelic(run: RunState, relicId: string): boolean {
  return run.relics.some(r => r.id === relicId)
}
