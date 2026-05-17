import type { CardInstance, CardDefinition } from '../types/index'
import { CARD_DEFINITIONS, STARTER_DECK_IDS } from '../types/cards'

let _instanceCounter = 0

function makeInstance(def: CardDefinition): CardInstance {
  return {
    instanceId: `card_${_instanceCounter++}`,
    definition: def,
    upgraded: false,
  }
}

export function buildStarterDeck(): CardInstance[] {
  return STARTER_DECK_IDS.map(id => {
    const def = CARD_DEFINITIONS[id]
    if (!def) throw new Error(`Unknown card id: ${id}`)
    return makeInstance(def)
  })
}

export function buildEnemyDeck(floor: number): CardInstance[] {
  const ids = floor < 3
    ? ['basic_pawn', 'basic_pawn', 'basic_pawn', 'basic_rook', 'basic_knight', 'basic_bishop']
    : ['basic_pawn', 'basic_pawn', 'ghost_knight', 'basic_rook', 'martyr_pawn', 'basic_bishop']
  return ids.map(id => makeInstance(CARD_DEFINITIONS[id]!))
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function drawCards(
  deck: CardInstance[],
  discard: CardInstance[],
  count: number,
): { drawn: CardInstance[]; newDeck: CardInstance[]; newDiscard: CardInstance[] } {
  let d = [...deck]
  let disc = [...discard]

  if (d.length < count) {
    d = [...d, ...disc]
    disc = []
  }

  const drawn = d.splice(0, count)
  return { drawn, newDeck: d, newDiscard: disc }
}

export function addCardToDeck(deck: CardInstance[], cardId: string): CardInstance[] {
  const def = CARD_DEFINITIONS[cardId]
  if (!def) throw new Error(`Unknown card id: ${cardId}`)
  return [...deck, makeInstance(def)]
}
