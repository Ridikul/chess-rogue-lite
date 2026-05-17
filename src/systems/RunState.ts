import type { RunState, MapNode, NodeType } from '../types/index'
import { buildStarterDeck } from './CardSystem'

function makeNode(id: string, type: NodeType, depth: number, connections: string[]): MapNode {
  return { id, type, depth, cleared: false, connections }
}

export function generateMap(): MapNode[] {
  // 3 chemins possibles sur 5 étages + boss final
  const nodes: MapNode[] = []

  // Depth 0 : départ
  nodes.push(makeNode('start', 'combat', 0, ['n1a', 'n1b']))

  // Depth 1
  nodes.push(makeNode('n1a', 'combat', 1, ['n2a', 'n2b']))
  nodes.push(makeNode('n1b', 'combat', 1, ['n2b', 'n2c']))

  // Depth 2
  nodes.push(makeNode('n2a', 'shop', 2, ['n3a']))
  nodes.push(makeNode('n2b', 'elite', 2, ['n3a', 'n3b']))
  nodes.push(makeNode('n2c', 'combat', 2, ['n3b']))

  // Depth 3
  nodes.push(makeNode('n3a', 'combat', 3, ['n4']))
  nodes.push(makeNode('n3b', 'rest', 3, ['n4']))

  // Depth 4
  nodes.push(makeNode('n4', 'event', 4, ['boss']))

  // Boss
  nodes.push(makeNode('boss', 'boss', 5, []))

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
