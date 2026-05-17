import { describe, it, expect, beforeEach } from 'vitest'
import { ChessEngine } from './ChessEngine'
import { createRunState } from './RunState'
import { CARD_DEFINITIONS } from '../types/cards'
import type { BoardPiece, RunState } from '../types/index'

function makeRun(): RunState { return createRunState() }

function basicSetup(engine: ChessEngine) {
  const pieces: BoardPiece[] = [
    { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
    { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
    { type: 'rook', color: 'white', square: 'a1', cardInstanceId: null },
    { type: 'rook', color: 'black', square: 'a8', cardInstanceId: null },
  ]
  engine.setupFromPlacement(pieces)
}

describe('ChessEngine.setupFromPlacement', () => {
  it('populates getBoardPieces correctly', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const pieces = engine.getBoardPieces()
    expect(pieces.size).toBe(4)
    expect(pieces.get('e1')?.type).toBe('king')
    expect(pieces.get('a8')?.color).toBe('black')
  })

  it('white always moves first', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    expect(engine.getTurn()).toBe('white')
  })
})

describe('ChessEngine.getLegalMoves', () => {
  it('returns valid destinations for a rook', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const moves = engine.getLegalMoves('a1')
    expect(moves.length).toBeGreaterThan(0)
    moves.forEach(sq => expect(sq).toMatch(/^[a-h][1-8]$/))
  })

  it('returns empty array for empty square', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    expect(engine.getLegalMoves('d4')).toHaveLength(0)
  })
})

describe('ChessEngine.applyMove', () => {
  it('moves a piece to the target square', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const run = makeRun()
    engine.applyMove('a1', 'a5', run)
    const pieces = engine.getBoardPieces()
    expect(pieces.get('a5')?.type).toBe('rook')
    expect(pieces.has('a1')).toBe(false)
  })

  it('returns null for an illegal move', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const result = engine.applyMove('a1', 'd4', makeRun())
    expect(result).toBeNull()
  })

  it('captures the enemy piece', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'rook', color: 'white', square: 'a1', cardInstanceId: null },
      { type: 'rook', color: 'black', square: 'a8', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const run = makeRun()
    // White rook goes to a8, capturing black rook
    engine.applyMove('a1', 'a8', run)
    const board = engine.getBoardPieces()
    expect(board.get('a8')?.color).toBe('white')
    expect(board.size).toBe(3)
  })
})

describe('ChessEngine abilities', () => {
  it('ghost_knight grants bonusTurn on capture', () => {
    const engine = new ChessEngine()
    const ghostKnightDef = CARD_DEFINITIONS['ghost_knight']!
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      {
        type: 'knight',
        color: 'white',
        square: 'c3',
        cardInstanceId: 'gk1',
        ability: ghostKnightDef.ability,
      },
      { type: 'pawn', color: 'black', square: 'd5', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const result = engine.applyMove('c3', 'd5', makeRun())
    expect(result).not.toBeNull()
    expect(result!.bonusTurn).toBe(true)
    expect(engine.hasExtraTurn()).toBe(true)
  })

  it('martyr_pawn sets penalty on captor', () => {
    const engine = new ChessEngine()
    const martyrDef = CARD_DEFINITIONS['martyr_pawn']!
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'rook', color: 'white', square: 'a1', cardInstanceId: null },
      {
        type: 'pawn',
        color: 'black',
        square: 'a5',
        cardInstanceId: 'mp1',
        ability: martyrDef.ability,
      },
    ]
    engine.setupFromPlacement(pieces)
    const result = engine.applyMove('a1', 'a5', makeRun())
    expect(result).not.toBeNull()
    expect(result!.penaltyApplied).toBe(true)
  })

  it('queen_of_thorns removes the captor', () => {
    const engine = new ChessEngine()
    const thornsDef = CARD_DEFINITIONS['queen_of_thorns']!
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'rook', color: 'white', square: 'a1', cardInstanceId: null },
      {
        type: 'queen',
        color: 'black',
        square: 'a8',
        cardInstanceId: 'qt1',
        ability: thornsDef.ability,
      },
    ]
    engine.setupFromPlacement(pieces)
    const result = engine.applyMove('a1', 'a8', makeRun())
    expect(result).not.toBeNull()
    expect(result!.thornsKill).toBe(true)
    // The capturing rook should be removed from the board
    expect(engine.getBoardPieces().has('a8')).toBe(false)
  })
})

describe('ChessEngine.isGameOver', () => {
  it('returns not over for a normal position', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const { over } = engine.isGameOver()
    expect(over).toBe(false)
  })
})

describe('ChessEngine.getBestMoveForEnemy', () => {
  it('returns a valid from/to pair', () => {
    const engine = new ChessEngine()
    // Switch turn to black by making a white move first
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'rook', color: 'white', square: 'a1', cardInstanceId: null },
      { type: 'rook', color: 'black', square: 'h8', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    // Make a white move to give the turn to black
    engine.applyMove('a1', 'a3', makeRun())
    const move = engine.getBestMoveForEnemy()
    expect(move).not.toBeNull()
    expect(move!.from).toMatch(/^[a-h][1-8]$/)
    expect(move!.to).toMatch(/^[a-h][1-8]$/)
  })
})

describe('ChessEngine.tryUndying', () => {
  let engine: ChessEngine

  beforeEach(() => { engine = new ChessEngine() })

  it('returns true the first time', () => {
    expect(engine.tryUndying()).toBe(true)
  })

  it('returns false the second time', () => {
    engine.tryUndying()
    expect(engine.tryUndying()).toBe(false)
  })
})

describe('ChessEngine upgradeBonus.hpOnCapture', () => {
  it('heals the player when an upgraded piece captures', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      {
        type: 'rook', color: 'white', square: 'a1', cardInstanceId: 'r1',
        upgraded: true,
        upgradeBonus: { description: '+3 PV', hpOnCapture: 3 },
      },
      { type: 'rook', color: 'black', square: 'a8', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const run = { ...makeRun(), currentHp: 20, maxHp: 30 }
    const result = engine.applyMove('a1', 'a8', run)
    expect(result).not.toBeNull()
    expect(result!.upgradeHpGain).toBe(3)
    expect(run.currentHp).toBe(23)
  })

  it('does not heal when piece is not upgraded', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'rook', color: 'white', square: 'a1', cardInstanceId: 'r1', upgraded: false },
      { type: 'rook', color: 'black', square: 'a8', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const run = { ...makeRun(), currentHp: 20, maxHp: 30 }
    const result = engine.applyMove('a1', 'a8', run)
    expect(result).not.toBeNull()
    expect(result!.upgradeHpGain).toBe(0)
    expect(run.currentHp).toBe(20)
  })

  it('does not exceed maxHp', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      {
        type: 'rook', color: 'white', square: 'a1', cardInstanceId: 'r1',
        upgraded: true,
        upgradeBonus: { description: '+10 PV', hpOnCapture: 10 },
      },
      { type: 'rook', color: 'black', square: 'a8', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const run = { ...makeRun(), currentHp: 28, maxHp: 30 }
    engine.applyMove('a1', 'a8', run)
    expect(run.currentHp).toBe(30)
  })

  it('upgradeHpGain is 0 on a non-capture move', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      {
        type: 'rook', color: 'white', square: 'a1', cardInstanceId: 'r1',
        upgraded: true,
        upgradeBonus: { description: '+3 PV', hpOnCapture: 3 },
      },
    ]
    engine.setupFromPlacement(pieces)
    const run = { ...makeRun(), currentHp: 20, maxHp: 30 }
    const result = engine.applyMove('a1', 'a4', run)
    expect(result).not.toBeNull()
    expect(result!.upgradeHpGain).toBe(0)
    expect(run.currentHp).toBe(20)
  })
})

describe('ChessEngine pawn promotion', () => {
  it('promoted pawn becomes a queen on the board', () => {
    const engine = new ChessEngine()
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'a1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'h8', cardInstanceId: null },
      { type: 'pawn', color: 'white', square: 'e7', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    const result = engine.applyMove('e7', 'e8', makeRun())
    expect(result).not.toBeNull()
    expect(result!.promoted).toBe(true)
    expect(engine.getBoardPieces().get('e8')?.type).toBe('queen')
    expect(engine.getBoardPieces().has('e7')).toBe(false)
  })

  it('normal move has promoted = false', () => {
    const engine = new ChessEngine()
    basicSetup(engine)
    const result = engine.applyMove('a1', 'a5', makeRun())
    expect(result).not.toBeNull()
    expect(result!.promoted).toBe(false)
  })
})

describe('ChessEngine.consumeExtraTurn', () => {
  it('clears the extra turn flag', () => {
    const engine = new ChessEngine()
    const ghostKnightDef = CARD_DEFINITIONS['ghost_knight']!
    const pieces: BoardPiece[] = [
      { type: 'king', color: 'white', square: 'e1', cardInstanceId: null },
      { type: 'king', color: 'black', square: 'e8', cardInstanceId: null },
      { type: 'knight', color: 'white', square: 'c3', cardInstanceId: 'gk1', ability: ghostKnightDef.ability },
      { type: 'pawn', color: 'black', square: 'd5', cardInstanceId: null },
    ]
    engine.setupFromPlacement(pieces)
    engine.applyMove('c3', 'd5', makeRun())
    expect(engine.hasExtraTurn()).toBe(true)
    engine.consumeExtraTurn()
    expect(engine.hasExtraTurn()).toBe(false)
  })
})
