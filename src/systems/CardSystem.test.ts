import { describe, it, expect } from 'vitest'
import {
  buildStarterDeck,
  buildEnemyDeck,
  shuffle,
  drawCards,
  addCardToDeck,
} from './CardSystem'
import { STARTER_DECK_IDS, CARD_DEFINITIONS } from '../types/cards'

describe('buildStarterDeck', () => {
  it('returns the correct number of cards', () => {
    const deck = buildStarterDeck()
    expect(deck).toHaveLength(STARTER_DECK_IDS.length)
  })

  it('each card has a unique instanceId', () => {
    const deck = buildStarterDeck()
    const ids = deck.map(c => c.instanceId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('card definitions match STARTER_DECK_IDS', () => {
    const deck = buildStarterDeck()
    deck.forEach((c, i) => {
      expect(c.definition.id).toBe(STARTER_DECK_IDS[i])
    })
  })

  it('all cards start unupgraded', () => {
    const deck = buildStarterDeck()
    deck.forEach(c => expect(c.upgraded).toBe(false))
  })
})

describe('buildEnemyDeck', () => {
  it('returns cards for floor < 3', () => {
    const deck = buildEnemyDeck(1)
    expect(deck.length).toBeGreaterThan(0)
  })

  it('returns harder cards for floor >= 3', () => {
    const easyDeck = buildEnemyDeck(1)
    const hardDeck = buildEnemyDeck(3)
    const easyIds = easyDeck.map(c => c.definition.id)
    const hardIds = hardDeck.map(c => c.definition.id)
    // floor 3 deck has ghost_knight and martyr_pawn, floor 1 does not
    expect(hardIds).toContain('ghost_knight')
    expect(easyIds).not.toContain('ghost_knight')
  })
})

describe('shuffle', () => {
  it('preserves array length', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr)).toHaveLength(arr.length)
  })

  it('contains the same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr).sort()).toEqual([...arr].sort())
  })

  it('does not mutate the original', () => {
    const arr = [1, 2, 3]
    const orig = [...arr]
    shuffle(arr)
    expect(arr).toEqual(orig)
  })
})

describe('drawCards', () => {
  it('draws the requested number of cards', () => {
    // Build a deck large enough to draw from without exhausting it
    const deck = [...buildStarterDeck(), ...buildStarterDeck()]
    const { drawn } = drawCards(deck, [], 5)
    expect(drawn).toHaveLength(5)
  })

  it('removes drawn cards from the deck', () => {
    const deck = [...buildStarterDeck(), ...buildStarterDeck()]
    const { newDeck } = drawCards(deck, [], 5)
    expect(newDeck).toHaveLength(deck.length - 5)
  })

  it('reshuffles discard when deck is exhausted', () => {
    const deck = buildStarterDeck().slice(0, 3)
    const discard = buildStarterDeck().slice(0, 4)
    const { drawn, newDeck, newDiscard } = drawCards(deck, discard, 6)
    expect(drawn).toHaveLength(6)
    expect(newDiscard).toHaveLength(0)
    expect(newDeck.length).toBe(deck.length + discard.length - 6)
  })

  it('draws at most deck+discard size', () => {
    const deck = buildStarterDeck().slice(0, 2)
    const { drawn } = drawCards(deck, [], 10)
    expect(drawn).toHaveLength(2)
  })
})

describe('addCardToDeck', () => {
  it('adds the card at the end of the deck', () => {
    const deck = buildStarterDeck()
    const newDeck = addCardToDeck(deck, 'ghost_knight')
    expect(newDeck).toHaveLength(deck.length + 1)
    expect(newDeck[newDeck.length - 1].definition.id).toBe('ghost_knight')
  })

  it('throws on unknown card id', () => {
    expect(() => addCardToDeck([], 'nonexistent_card')).toThrow()
  })
})

describe('CARD_DEFINITIONS integrity', () => {
  it('all starter deck IDs exist in CARD_DEFINITIONS', () => {
    STARTER_DECK_IDS.forEach(id => {
      expect(CARD_DEFINITIONS[id], `Missing card definition: ${id}`).toBeDefined()
    })
  })

  it('all definitions have required fields', () => {
    Object.values(CARD_DEFINITIONS).forEach(def => {
      expect(def.id).toBeTruthy()
      expect(def.name).toBeTruthy()
      expect(def.pieceType).toBeTruthy()
      expect(def.rarity).toBeTruthy()
    })
  })

  it('abilities have all required fields when present', () => {
    Object.values(CARD_DEFINITIONS).forEach(def => {
      if (def.ability) {
        expect(def.ability.id).toBeTruthy()
        expect(def.ability.name).toBeTruthy()
        expect(def.ability.trigger).toBeTruthy()
        expect(typeof def.ability.effect).toBe('function')
      }
    })
  })

  it('upgradeBonus has a description when present', () => {
    Object.values(CARD_DEFINITIONS).forEach(def => {
      if (def.upgradeBonus) {
        expect(def.upgradeBonus.description, `Missing upgradeBonus.description on ${def.id}`).toBeTruthy()
      }
    })
  })

  it('starter deck cards all have an upgradeBonus', () => {
    const uniqueIds = [...new Set(STARTER_DECK_IDS)]
    uniqueIds.forEach(id => {
      const def = CARD_DEFINITIONS[id]!
      expect(def.upgradeBonus, `${id} is missing upgradeBonus`).toBeDefined()
    })
  })
})
