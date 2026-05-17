import { Chess } from 'chess.js'
import type { Move } from 'chess.js'
import type { BoardPiece, BoardState, PieceColor, PieceType, Square, RunState } from '../types/index'

const PIECE_SYMBOL: Record<PieceType, string> = {
  pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', queen: 'q', king: 'k',
}

// chess.js Square type is strict — we cast with 'as'
type ChessSquare = Parameters<Chess['get']>[0]

export interface MoveResult {
  move: Move
  captured?: { square: Square; piece: BoardPiece }
  bonusTurn: boolean
  penaltyApplied: boolean
  thornsKill: boolean
  upgradeHpGain: number
  promoted: boolean
}

export class ChessEngine {
  private chess: Chess
  private boardPieces: Map<Square, BoardPiece> = new Map()
  private undyingUsed = false
  private extraTurn = false
  private penalizedSquare: Square | null = null

  constructor() {
    this.chess = new Chess()
    this.chess.clear()
  }

  setupFromPlacement(pieces: BoardPiece[]): void {
    this.chess.clear()
    this.boardPieces.clear()

    for (const p of pieces) {
      const sym = PIECE_SYMBOL[p.type] as Parameters<Chess['put']>[0]['type']
      const color = p.color === 'white' ? 'w' : 'b'
      this.chess.put({ type: sym, color }, p.square as ChessSquare)
      this.boardPieces.set(p.square, p)
    }

    // Force white to move first by rebuilding FEN
    const parts = this.chess.fen().split(' ')
    parts[1] = 'w'
    this.chess.load(parts.join(' '))
  }

  getBoardPieces(): Map<Square, BoardPiece> {
    return new Map(this.boardPieces)
  }

  getTurn(): PieceColor {
    return this.chess.turn() === 'w' ? 'white' : 'black'
  }

  getLegalMoves(square: Square): Square[] {
    const moves = this.chess.moves({ square: square as ChessSquare, verbose: true }).map(m => m.to as Square)
    const movingPiece = this.boardPieces.get(square)
    // A king cannot capture a queen_of_thorns — it would kill itself and break game state.
    if (movingPiece?.type === 'king') {
      return moves.filter(to => this.boardPieces.get(to)?.ability?.id !== 'thorns')
    }
    return moves
  }

  isGameOver(): { over: boolean; winner: PieceColor | 'draw' | null } {
    if (!this.chess.isGameOver()) return { over: false, winner: null }
    if (this.chess.isDraw()) return { over: true, winner: 'draw' }
    const loser: PieceColor = this.chess.turn() === 'w' ? 'white' : 'black'
    return { over: true, winner: loser === 'white' ? 'black' : 'white' }
  }

  applyMove(from: Square, to: Square, runState: RunState): MoveResult | null {
    if (this.penalizedSquare === from) {
      this.penalizedSquare = null
      return null
    }

    const movingPiece = this.boardPieces.get(from)
    if (!movingPiece) return null

    const capturedBefore = this.boardPieces.get(to)

    let moveResult
    try {
      moveResult = this.chess.move({ from: from as ChessSquare, to: to as ChessSquare, promotion: 'q' })
    } catch {
      return null
    }
    if (!moveResult) return null

    const PROMO: Record<string, PieceType> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }
    const promotedType: PieceType | undefined = moveResult.promotion
      ? PROMO[moveResult.promotion]
      : undefined

    this.boardPieces.delete(from)
    if (capturedBefore) this.boardPieces.delete(to)
    this.boardPieces.set(to, { ...movingPiece, square: to, type: promotedType ?? movingPiece.type })

    let bonusTurn = false
    let penaltyApplied = false
    let thornsKill = false
    let upgradeHpGain = 0

    const abilityCtx = {
      from,
      to,
      capturedPiece: capturedBefore?.type,
      board: this.boardPieces as BoardState,
    }

    if (capturedBefore && movingPiece.ability?.trigger === 'on_capture') {
      movingPiece.ability.effect(abilityCtx, runState)
      if (movingPiece.ability.id === 'phase_through') bonusTurn = true
    }

    // upgradeBonus : hpOnCapture
    if (capturedBefore && movingPiece.upgraded && movingPiece.upgradeBonus?.hpOnCapture) {
      upgradeHpGain = movingPiece.upgradeBonus.hpOnCapture
      runState.currentHp = Math.min(runState.maxHp, runState.currentHp + upgradeHpGain)
    }

    if (capturedBefore?.ability?.trigger === 'on_captured') {
      capturedBefore.ability.effect(abilityCtx, runState)
      if (capturedBefore.ability.id === 'martyrdom') {
        this.penalizedSquare = to
        penaltyApplied = true
      }
      if (capturedBefore.ability.id === 'thorns') {
        this.chess.remove(to as ChessSquare)
        this.boardPieces.delete(to)
        thornsKill = true
      }
    }

    this.extraTurn = bonusTurn

    // Bonus turn: chess.js already flipped the side-to-move after the capture,
    // so undo that flip so the same color can play again.
    if (bonusTurn) {
      const parts = this.chess.fen().split(' ')
      parts[1] = movingPiece.color === 'white' ? 'w' : 'b'
      this.chess.load(parts.join(' '))
    }

    return {
      move: moveResult,
      captured: capturedBefore ? { square: to, piece: capturedBefore } : undefined,
      bonusTurn,
      penaltyApplied,
      thornsKill,
      upgradeHpGain,
      promoted: !!promotedType,
    }
  }

  getBestMoveForEnemy(): { from: Square; to: Square } | null {
    const moves = this.chess.moves({ verbose: true })
    if (moves.length === 0) return null

    let best: Move | null = null
    let bestScore = -Infinity

    for (const move of moves) {
      this.chess.move(move)
      const score = -this.minimax(2, -Infinity, Infinity)
      this.chess.undo()
      if (score > bestScore) {
        bestScore = score
        best = move
      }
    }

    return best ? { from: best.from as Square, to: best.to as Square } : null
  }

  private minimax(depth: number, alpha: number, beta: number): number {
    if (depth === 0 || this.chess.isGameOver()) return this.evaluate()

    const moves = this.chess.moves({ verbose: true })
    let best = -Infinity

    for (const move of moves) {
      this.chess.move(move)
      const score = -this.minimax(depth - 1, -beta, -alpha)
      this.chess.undo()
      best = Math.max(best, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }
    return best
  }

  private evaluate(): number {
    const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
    let score = 0
    for (const row of this.chess.board()) {
      for (const sq of row) {
        if (!sq) continue
        const v = VALUE[sq.type] ?? 0
        score += sq.color === this.chess.turn() ? v : -v
      }
    }
    return score
  }

  hasExtraTurn(): boolean { return this.extraTurn }
  consumeExtraTurn(): void { this.extraTurn = false }

  tryUndying(): boolean {
    if (!this.undyingUsed) { this.undyingUsed = true; return true }
    return false
  }
}
