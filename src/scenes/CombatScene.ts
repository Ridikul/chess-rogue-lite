import Phaser from 'phaser'
import { FONT, rarityLabel } from '../utils/style'
import { RARITY_COLOR, PIECE_EMOJI, drawCardBorder } from '../utils/cardBorder'
import { ChessEngine } from '../systems/ChessEngine'
import { drawCards, shuffle, buildEnemyDeck } from '../systems/CardSystem'
import { rewardCombat, hasRelic } from '../systems/RunState'
import type { RunState, CardInstance, BoardPiece, PieceType, Square } from '../types/index'

const CELL = 64
const BOARD_X = 64        // (640 - 512) / 2
const BOARD_Y = 90        // below HUD bar, with breathing room
const COLS = 8
const ROWS = 8
const HAND_Y_BASE = BOARD_Y + CELL * ROWS + 40   // 90 + 512 + 40 = 642
const CARD_W = 82
const CARD_H = 112

// Chess phase expansion target: cell 64→76, board 512→608
const CHESS_BOARD_X = 16   // (640 - 608) / 2
const CHESS_BOARD_Y = 70   // just below HUD bar
const CHESS_SCALE = 76 / 64 // 1.1875

const PIECE_EMOJI_WHITE: Record<PieceType, string> = {
  pawn: '♙', rook: '♖', knight: '♘', bishop: '♗', queen: '♕', king: '♔',
}

type Phase = 'draw' | 'deal' | 'placement' | 'chess' | 'result'

const COLOR_DESCRIPTION_CARD = '#e85362'
export class CombatScene extends Phaser.Scene {
  private runState!: RunState
  private engine!: ChessEngine
  private phase: Phase = 'draw'

  private playerHand: CardInstance[] = []

  private enemyPlaced: BoardPiece[] = []
  private playerPlaced: BoardPiece[] = []
  private selectedCard: CardInstance | null = null
  private placementBudget = 5

  private selectedSquare: Square | null = null
  private legalTargets: Square[] = []
  private isPlayerTurn = true
  private aiThinking = false

  private boardContainer!: Phaser.GameObjects.Container
  private boardGraphics!: Phaser.GameObjects.Graphics
  private pieceTexts: Map<Square, Phaser.GameObjects.Text> = new Map()
  private upgradeMarkers: Map<Square, Phaser.GameObjects.Text> = new Map()
  private cardObjects: Phaser.GameObjects.Container[] = []
  private cardBounds: Array<{ card: CardInstance; x: number; y: number; bg: Phaser.GameObjects.Rectangle }> = []
  private inputAbortController?: AbortController
  private placedCardMap: Map<string, CardInstance> = new Map()
  private cardPreviewContainer?: Phaser.GameObjects.Container
  private cardPreviewOverlay?: Phaser.GameObjects.Rectangle

  // Drag & drop state
  private dragGhost?: Phaser.GameObjects.Text
  private dragHighlight?: Phaser.GameObjects.Rectangle
  private pendingDrag: { card: CardInstance; startGx: number; startGy: number } | null = null

  // Deal phase state
  private dealIndex = 0
  private dealObjects: Phaser.GameObjects.GameObject[] = []
  private dealCardContainer?: Phaser.GameObjects.Container
  private dealProgressText?: Phaser.GameObjects.Text
  private dealNextBtnLabel?: Phaser.GameObjects.Text
  private dealButtons: Array<{ x: number; y: number; w: number; h: number; action: () => void }> = []
  private relicHudObjects: Phaser.GameObjects.GameObject[] = []
  private statusText!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private confirmBtnBg!: Phaser.GameObjects.Rectangle
  private confirmBtnLabel!: Phaser.GameObjects.Text
  private confirmShimmerTween: Phaser.Tweens.Tween | null = null
  private abandonBtnBg!: Phaser.GameObjects.Rectangle
  private abandonBtnLabel!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'CombatScene' })
  }

  init(data: { runState: RunState }) {
    this.runState = data.runState
    this.phase = 'draw'
    this.playerHand = []
    this.enemyPlaced = []
    this.playerPlaced = []
    this.selectedCard = null
    this.selectedSquare = null
    this.legalTargets = []
    this.isPlayerTurn = true
    this.aiThinking = false
    this.pieceTexts = new Map()
    this.upgradeMarkers = new Map()
    this.relicHudObjects = []
    this.cardObjects = []
    this.cardBounds = []
    this.dealIndex = 0
    this.dealObjects = []
    this.dealCardContainer = undefined
    this.dealProgressText = undefined
    this.dealNextBtnLabel = undefined
    this.dealButtons = []
    this.placedCardMap = new Map()
    this.cardPreviewContainer = undefined
    this.cardPreviewOverlay = undefined
    this.dragGhost?.destroy()
    this.dragGhost = undefined
    this.dragHighlight?.destroy()
    this.dragHighlight = undefined
    this.pendingDrag = null
  }

  create() {
    this.inputAbortController?.abort()
    this.inputAbortController = new AbortController()

    this.engine = new ChessEngine()

    const W = this.scale.width
    this.add.rectangle(0, 0, W, this.scale.height, 0x1a1a2e).setOrigin(0)

    // ── HUD bar: HP | status message | gold ──────────────────
    this.add.rectangle(0, 0, W, 68, 0x07070f, 0.94).setOrigin(0)

    this.hpText = this.add.text(10, 8, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ff5555', fontStyle: 'bold',
    })
    this.goldText = this.add.text(W - 10, 8, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(1, 0)
    this.statusText = this.add.text(W / 2, 9, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ddeeff', fontStyle: 'bold',
      wordWrap: { width: 360 }, align: 'center',
    }).setOrigin(0.5, 0)
    // ─────────────────────────────────────────────────────────

    // Board container: all board graphics and pieces live here so we can
    // tween position+scale as a unit when transitioning to chess phase.
    this.boardGraphics = this.add.graphics()
    this.boardContainer = this.add.container(BOARD_X, BOARD_Y)
    this.boardContainer.add(this.boardGraphics)

    this.createBoardLabels()
    this.buildConfirmButton()
    this.buildAbandonButton()
    this.setupNativeInput(this.inputAbortController.signal)
    this.startDrawPhase()
  }

  // ─── DRAW PHASE ─────────────────────────────────────────────────────────────

  private startDrawPhase() {
    this.phase = 'draw'

    // Draw from the persistent deck (king + pawns + acquired cards) in order, no shuffle.
    // Each combat starts from the full deck (fresh draw, no carry-over of draw position).
    const extraSlot = hasRelic(this.runState, 'extra_card') ? 1 : 0
    const gamblerBonus = hasRelic(this.runState, 'gamblers_dice') && Math.random() < 0.5 ? 1 : 0
    const { drawn } = drawCards(this.runState.deck, [], this.runState.deck.length)
    this.playerHand = drawn
    this.placementBudget = drawn.length + extraSlot + gamblerBonus

    if (this.runState.floor === 1) {
      this.enemyPlaced = [{ type: 'king', color: 'black', square: 'e8', cardInstanceId: null }]
    } else {
      const enemyDeckFull = buildEnemyDeck(this.runState.floor)
      const { drawn: enemyDrawn } = drawCards(enemyDeckFull, [], 4)
      this.placeEnemyCards(enemyDrawn)
    }

    this.startDealPhase()
  }

  // ─── DEAL PHASE ──────────────────────────────────────────────────────────────

  private startDealPhase() {
    this.phase = 'deal'
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'deal'
    this.dealIndex = 0

    const { width } = this.scale
    const btnY = 480

    this.renderBoard()

    const overlay = this.add.rectangle(0, 0, width, this.scale.height, 0x0a0a1e, 0.90).setOrigin(0)

    const title = this.add.text(width / 2, 28, 'Tes cartes de combat', {
      fontFamily: FONT, fontSize: '20px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.dealProgressText = this.add.text(width / 2, 56, '', {
      fontFamily: FONT, fontSize: '14px', color: '#8888aa',
    }).setOrigin(0.5)

    const skipBg = this.add.rectangle(160, btnY, 164, 44, 0x1e1e2e).setStrokeStyle(1, 0x444466)
    const skipTxt = this.add.text(160, btnY, '← Passer tout', {
      fontFamily: FONT, fontSize: '14px', color: '#9999bb',
    }).setOrigin(0.5)

    const nextBg = this.add.rectangle(480, btnY, 164, 44, 0x225588)
    this.dealNextBtnLabel = this.add.text(480, btnY, 'Suivant →', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.dealObjects = [overlay, title, this.dealProgressText, skipBg, skipTxt, nextBg, this.dealNextBtnLabel]

    this.dealButtons = [
      { x: 78, y: btnY - 21, w: 164, h: 42, action: () => this.skipDealPhase() },
      { x: 398, y: btnY - 21, w: 164, h: 42, action: () => this.advanceDealCard() },
    ]

    this.showDealCard(0)
  }

  private showDealCard(idx: number) {
    this.dealCardContainer?.destroy()
    this.dealCardContainer = undefined

    if (idx >= this.playerHand.length) {
      this.skipDealPhase()
      return
    }

    const card = this.playerHand[idx]
    const def = card.definition
    const { width } = this.scale
    const cw = 220
    const ch = 300
    const targetY = 250

    this.dealProgressText?.setText(`${idx + 1} / ${this.playerHand.length}`)
    const isLast = idx === this.playerHand.length - 1
    this.dealNextBtnLabel?.setText(isLast ? 'Commencer  ✓' : 'Suivant →')

    const container = this.add.container(width / 2, targetY + 40)

    const bg = this.add.rectangle(0, 0, cw, ch, 0x0e0e22)
    const frame = this.add.graphics()
    drawCardBorder(frame, -cw / 2, -ch / 2, cw, ch, RARITY_COLOR[def.rarity])

    const emoji = this.add.text(0, -ch / 2 + 74, PIECE_EMOJI[def.pieceType], {
      fontFamily: FONT, fontSize: '96px',
    }).setOrigin(0.5)

    const name = this.add.text(0, -ch / 2 + 140, def.name, {
      fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)

    const rarityHex = `#${RARITY_COLOR[def.rarity].toString(16).padStart(6, '0')}`
    const rarityTxt = this.add.text(0, -ch / 2 + 216, rarityLabel(def.rarity), {
      fontFamily: FONT, fontSize: '16px', color: rarityHex, fontStyle: 'bold',
    }).setOrigin(0.5)

    const bodyText = def.ability?.description ?? def.flavorText ?? ''
  
    const body = this.add.text(0, -ch / 2 + 238, bodyText, {
      fontFamily: FONT, fontSize: '15px',
      color: def.ability ? '#aaccff' : COLOR_DESCRIPTION_CARD,
      fontStyle: def.ability ? 'normal' : 'italic',
      align: 'center',
      wordWrap: { width: cw - 28 },
    }).setOrigin(0.5, 0)

    if (card.upgraded && def.upgradeBonus) {
      container.add(
        this.add.text(0, ch / 2 - 16, `✦ ${def.upgradeBonus.description}`, {
          fontFamily: FONT, fontSize: '12px', color: '#ffd700', align: 'center', wordWrap: { width: cw - 20 },
        }).setOrigin(0.5, 1),
      )
    }

    container.add([bg, frame, emoji, name, rarityTxt, body])
    container.setAlpha(0).setScale(0.78)

    this.dealCardContainer = container

    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: targetY,
      duration: 420,
      ease: 'Back.Out',
    })
  }

  private advanceDealCard() {
    const container = this.dealCardContainer
    if (!container) {
      this.dealIndex++
      this.showDealCard(this.dealIndex)
      return
    }
    this.tweens.add({
      targets: container,
      alpha: 0,
      x: '-=70',
      duration: 200,
      ease: 'Quad.In',
      onComplete: () => {
        if (this.dealCardContainer === container) {
          container.destroy()
          this.dealCardContainer = undefined
        }
        this.dealIndex++
        if (this.dealIndex >= this.playerHand.length) {
          this.skipDealPhase()
        } else {
          this.showDealCard(this.dealIndex)
        }
      },
    })
  }

  private skipDealPhase() {
    if (this.dealCardContainer) {
      this.tweens.killTweensOf(this.dealCardContainer)
    }
    this.clearDealObjects()
    const tutorialLines = this.getTutorialLines(this.runState.floor)
    if (tutorialLines) {
      this.showTutorialPopup(tutorialLines, () => this.enterPlacementPhase())
    } else {
      this.enterPlacementPhase()
    }
  }

  private getTutorialLines(floor: number): string[] | null {
    if (floor === 1) return [
      '🎓  Premier combat — tutoriel',
      '',
      'Place ton Roi et tes Pions sur les rangées 1 à 4.',
      '',
      'Avance tes Pions jusqu\'à la rangée 8 pour les\npromouvoir en Reine !',
      '',
      'Puis mets le Roi ennemi en échec et mat pour gagner.',
    ]
    return null
  }

  private showTutorialPopup(lines: string[], onDismiss: () => void) {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'tutorial'
    const { width, height } = this.scale
    const popupW = 460
    const popupH = 360
    const popupX = (width - popupW) / 2
    const popupY = (height - popupH) / 2

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.65).setOrigin(0)
    const panel = this.add.rectangle(popupX, popupY, popupW, popupH, 0x12122a)
      .setOrigin(0).setStrokeStyle(2, 0x4466bb)

    const body = lines.join('\n')
    const bodyText = this.add.text(width / 2, popupY + 26, body, {
      fontFamily: FONT, fontSize: '16px',
      color: '#eeeeff',
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: popupW - 40 },
    }).setOrigin(0.5, 0)

    const btnY = popupY + popupH - 38
    const btnBg = this.add.rectangle(width / 2, btnY, 180, 38, 0x336699)
    const btnLabel = this.add.text(width / 2, btnY, 'Compris !', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)

    const popupObjects = [overlay, panel, bodyText, btnBg, btnLabel]

    const canvas = this.game.canvas
    const toGame = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      return {
        gx: (clientX - rect.left) * (width / rect.width),
        gy: (clientY - rect.top) * (height / rect.height),
      }
    }
    const ac = new AbortController()
    const dismiss = () => {
      ac.abort()
      popupObjects.forEach(o => o.destroy())
      onDismiss()
    }
    const onDown = (clientX: number, clientY: number) => {
      const { gx, gy } = toGame(clientX, clientY)
      if (Math.abs(gx - width / 2) <= 90 && Math.abs(gy - btnY) <= 19) dismiss()
    }
    canvas.addEventListener('mousedown', (e: MouseEvent) => onDown(e.clientX, e.clientY), { signal: ac.signal })
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY)
    }, { signal: ac.signal, passive: false } as AddEventListenerOptions)

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const { gx, gy } = toGame(e.clientX, e.clientY)
      btnBg.setFillStyle(Math.abs(gx - width / 2) <= 90 && Math.abs(gy - btnY) <= 19 ? 0x4488bb : 0x336699)
    }, { signal: ac.signal })
  }

  private clearDealObjects() {
    this.dealObjects.forEach(o => (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy())
    this.dealObjects = []
    this.dealCardContainer?.destroy()
    this.dealCardContainer = undefined
    this.dealProgressText = undefined
    this.dealNextBtnLabel = undefined
    this.dealButtons = []
  }

  private enterPlacementPhase() {
    this.phase = 'placement'
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'placement'
    this.renderBoard()
    this.renderPieces()
    this.renderHand()
    this.showPhaseAnnounce('⚔  Placement')
    this.statusText.setText(`Place ton Roi et tes pièces — rangées 1–4  (${this.placementBudget} slots)`)
    this.setConfirmVisible(true, 'Confirmer')
    this.updateHpText()
  }

  // ─── PLACEMENT ───────────────────────────────────────────────────────────────

  private placeEnemyCards(cards: CardInstance[]) {
    const rank8 = shuffle(['a8', 'b8', 'c8', 'd8', 'f8', 'g8', 'h8'])
    const rank7 = shuffle(['a7', 'b7', 'c7', 'd7', 'f7', 'g7', 'h7'])

    const pawns = cards.filter(c => c.definition.pieceType === 'pawn')
    const others = cards.filter(c => c.definition.pieceType !== 'pawn')

    let r8i = 0
    let r7i = 0

    this.enemyPlaced = [
      ...others.map(c => ({
        type: c.definition.pieceType,
        color: 'black' as const,
        square: rank8[r8i++] ?? rank7[r7i++],
        cardInstanceId: c.instanceId,
        ability: c.definition.ability,
      })),
      ...pawns.map(c => ({
        type: c.definition.pieceType,
        color: 'black' as const,
        square: rank7[r7i++],
        cardInstanceId: c.instanceId,
        ability: c.definition.ability,
      })),
    ]

    if (!this.enemyPlaced.find(p => p.type === 'king')) {
      this.enemyPlaced.push({ type: 'king', color: 'black', square: 'e8', cardInstanceId: null })
    }
  }

  private handlePlacementClick(col: number, row: number) {
    const sq = colRowToSquare(col, row)

    const existingIdx = this.playerPlaced.findIndex(p => p.square === sq)
    if (existingIdx >= 0) {
      const existing = this.playerPlaced[existingIdx]
      const card = existing.cardInstanceId ? this.placedCardMap.get(existing.cardInstanceId) : undefined
      if (card) {
        this.playerPlaced.splice(existingIdx, 1)
        this.placedCardMap.delete(existing.cardInstanceId!)
        this.playerHand.push(card)
        this.selectedCard = card
        this.statusText.setText(`${card.definition.name} sélectionné — clique sur les rangées 1-4.`)
        this.stopConfirmShimmer()
        this.renderBoard()
        this.renderPieces()
        this.renderHand()
        const cardIdx = this.playerHand.indexOf(card)
        this.animateCardSelection(cardIdx)
      }
      return
    }

    if (!this.selectedCard) return
    if (row < 4) return
    if (this.playerPlaced.length >= this.placementBudget) return

    const piece: BoardPiece = {
      type: this.selectedCard.definition.pieceType,
      color: 'white',
      square: sq,
      cardInstanceId: this.selectedCard.instanceId,
      ability: this.selectedCard.definition.ability,
      upgraded: this.selectedCard.upgraded,
      upgradeBonus: this.selectedCard.upgraded ? this.selectedCard.definition.upgradeBonus : undefined,
    }
    this.placedCardMap.set(this.selectedCard.instanceId, this.selectedCard)
    this.playerPlaced.push(piece)
    this.playerHand = this.playerHand.filter(c => c.instanceId !== this.selectedCard!.instanceId)
    this.selectedCard = null
    this.clearCardPreview()
    this.renderBoard()
    this.renderPieces()
    this.renderHand()
    this.animatePieceLanding(sq)
    if (this.playerHand.length === 0) this.startConfirmShimmer()
  }

  private confirmPlacement() {
    if (!this.playerPlaced.find(p => p.type === 'king')) {
      this.statusText.setText('⚠ Tu dois placer ton Roi avant de confirmer !')
      return
    }
    this.stopConfirmShimmer()
    this.engine.setupFromPlacement([...this.enemyPlaced, ...this.playerPlaced])
    this.phase = 'chess'
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'chess'
    this.isPlayerTurn = true
    this.selectedSquare = null
    this.legalTargets = []
    this.clearCardObjects()
    this.clearCardPreview()
    this.setConfirmVisible(false)
    this.abandonBtnBg.setVisible(true)
    this.abandonBtnLabel.setVisible(true)
    this.showPhaseAnnounce('♟  Combat !')
    this.statusText.setFontSize('16px')
    this.statusText.setText('À toi de jouer.')
    this.renderBoard()
    this.renderPieces()

    // Expand the board: tween the container to a larger scale/position so the
    // board fills more of the screen once the hand and confirm button are gone.
    this.tweens.add({
      targets: this.boardContainer,
      x: CHESS_BOARD_X,
      y: CHESS_BOARD_Y,
      scaleX: CHESS_SCALE,
      scaleY: CHESS_SCALE,
      duration: 520,
      ease: 'Quad.InOut',
    })
  }

  // ─── CHESS ───────────────────────────────────────────────────────────────────

  private handleChessClick(col: number, row: number) {
    if (!this.isPlayerTurn || this.aiThinking) return

    const sq = colRowToSquare(col, row)
    const pieces = this.engine.getBoardPieces()

    if (this.selectedSquare) {
      if (this.legalTargets.includes(sq)) {
        this.doPlayerMove(this.selectedSquare, sq)
        this.selectedSquare = null
        this.legalTargets = []
        this.clearCardPreview()
        return
      }
      const p = pieces.get(sq)
      if (p && p.color === 'white') {
        this.selectedSquare = sq
        this.legalTargets = this.engine.getLegalMoves(sq)
        this.showChessPiecePreview(sq)
      } else {
        this.selectedSquare = null
        this.legalTargets = []
        this.clearCardPreview()
      }
    } else {
      const p = pieces.get(sq)
      if (p && p.color === 'white') {
        this.selectedSquare = sq
        this.legalTargets = this.engine.getLegalMoves(sq)
        this.showChessPiecePreview(sq)
      }
    }
    this.renderBoard()
    this.renderPieces()
  }

  private showChessPiecePreview(sq: Square) {
    const piece = this.engine.getBoardPieces().get(sq)
    if (!piece?.cardInstanceId) return
    const card = this.placedCardMap.get(piece.cardInstanceId)
    if (!card) return
    this.showCardPreview(card, this.scale.height - 100)
  }

  private doPlayerMove(from: Square, to: Square) {
    const result = this.engine.applyMove(from, to, this.runState)
    if (!result) return

    if (result.promoted) {
      this.showFloatingText('♛ Promotion !', 0xffd700)
    }

    if (result.upgradeHpGain > 0) {
      this.runState = { ...this.runState, currentHp: this.runState.currentHp }
      this.showFloatingText(`✦ +${result.upgradeHpGain} PV`, 0xffd700)
      this.updateHpText()
    }

    if (result.captured && hasRelic(this.runState, 'blood_chalice')) {
      this.runState = { ...this.runState, currentHp: Math.min(this.runState.maxHp, this.runState.currentHp + 2) }
      this.showFloatingText('+2 PV', 0x44ff88)
      this.updateHpText()
    }

    const { over, winner } = this.engine.isGameOver()
    if (over) {
      if (winner === 'black' && hasRelic(this.runState, 'death_mask') && this.engine.tryUndying()) {
        this.showFloatingText('Masque de la Mort !', 0xff8800)
        this.isPlayerTurn = true
        this.renderBoard()
        this.renderPieces()
        return
      }
      this.endCombat(winner === 'white')
      return
    }

    if (result.bonusTurn) {
      this.statusText.setText('Coup bonus ! (Cavalier Fantôme)')
      this.renderBoard()
      this.renderPieces()
      return
    }

    this.isPlayerTurn = false
    this.renderBoard()
    this.renderPieces()
    this.statusText.setText("L'ennemi réfléchit…")
    this.aiThinking = true
    this.time.delayedCall(700, () => this.doEnemyMove())
  }

  private doEnemyMove() {
    const best = this.engine.getBestMoveForEnemy()
    if (best) this.engine.applyMove(best.from, best.to, this.runState)
    this.aiThinking = false

    const { over, winner } = this.engine.isGameOver()
    if (over) { this.endCombat(winner === 'white'); return }

    this.isPlayerTurn = true
    this.statusText.setText('À toi de jouer.')
    this.renderBoard()
    this.renderPieces()
  }

  private handleBoardClick(col: number, row: number) {
    if (this.phase === 'placement') this.handlePlacementClick(col, row)
    else if (this.phase === 'chess') this.handleChessClick(col, row)
  }

  // ─── RESULT & REWARD ─────────────────────────────────────────────────────────

  private endCombat(playerWon: boolean) {
    this.phase = 'result'
    this.abandonBtnBg.setVisible(false)
    this.abandonBtnLabel.setVisible(false)
    this.clearCardPreview()

    if (!playerWon) {
      this.scene.start('DefeatScene')
      return
    }

    this.runState = rewardCombat(this.runState)
    this.scene.start('VictoryScene', { runState: this.runState })
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  private renderBoard() {
    const g = this.boardGraphics
    g.clear()

    // All coordinates are local to boardContainer (origin = board top-left)
    const fx = -10, fy = -10
    const fw = CELL * COLS + 20, fh = CELL * ROWS + 20
    g.fillStyle(0x1c0e08, 1)
    g.fillRect(fx - 3, fy - 3, fw + 6, fh + 6)
    g.fillStyle(0x3a2016, 1)
    g.fillRect(fx, fy, fw, fh)
    g.lineStyle(1, 0x6a4030, 0.8)
    g.strokeRect(fx + 3, fy + 3, fw - 6, fh - 6)
    const cs = 12
    const corners: [number, number][] = [
      [fx, fy], [fx + fw - cs, fy], [fx, fy + fh - cs], [fx + fw - cs, fy + fh - cs],
    ]
    for (const [cx, cy] of corners) {
      g.fillStyle(0x140a04, 1)
      g.fillRect(cx, cy, cs, cs)
      g.lineStyle(1, 0x5a3820, 1)
      g.strokeRect(cx, cy, cs, cs)
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const sq = colRowToSquare(c, r)
        const isLight = (r + c) % 2 === 0
        let color = isLight ? 0xc8aa88 : 0x6e4c34

        if (this.phase === 'placement' && r >= 4) color = blendColor(color, 0x0044ff, 0.14)
        if (this.selectedSquare === sq) color = 0x9ec44a
        if (this.legalTargets.includes(sq)) color = blendColor(color, 0xffff00, 0.45)

        g.fillStyle(color)
        g.fillRect(c * CELL, r * CELL, CELL, CELL)
        g.lineStyle(1, 0x00000033)
        g.strokeRect(c * CELL, r * CELL, CELL, CELL)
      }
    }

    g.lineStyle(1, 0x000000, 0.15)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const sx = c * CELL, sy = r * CELL
        const seed = r * 17 + c * 11
        for (let n = 0; n < 2; n++) {
          const rng = (i: number) => Math.abs(Math.sin(seed * 127.1 + n * 311 + i * 53.7) % 1)
          const x1 = sx + rng(0) * CELL, y1 = sy + rng(1) * CELL
          const x2 = sx + rng(2) * CELL, y2 = sy + rng(3) * CELL
          const xm = (x1 + x2) / 2 + (rng(4) - 0.5) * CELL * 0.28
          const ym = (y1 + y2) / 2 + (rng(5) - 0.5) * CELL * 0.28
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(xm, ym); g.lineTo(x2, y2); g.strokePath()
        }
      }
    }

    this.updateHpText()
  }

  private renderPieces() {
    this.pieceTexts.forEach(t => t.destroy())
    this.pieceTexts.clear()
    this.upgradeMarkers.forEach(t => t.destroy())
    this.upgradeMarkers.clear()

    const pieces = this.phase === 'placement'
      ? [...this.enemyPlaced, ...this.playerPlaced]
      : [...this.engine.getBoardPieces().values()]

    for (const piece of pieces) {
      const { col, row } = squareToColRow(piece.square)
      // Local coords within boardContainer
      const cx = col * CELL + CELL / 2
      const cy = row * CELL + CELL / 2

      const emoji = piece.color === 'white' ? PIECE_EMOJI_WHITE[piece.type] : PIECE_EMOJI[piece.type]
      const t = this.add.text(cx, cy, emoji, {
        fontFamily: FONT, fontSize: '50px',
        color: piece.color === 'white' ? '#f5f0e0' : '#1a0a04',
        stroke: piece.color === 'white' ? '#4a2a10' : '#c0a080',
        strokeThickness: 3,
      }).setOrigin(0.5)
      this.boardContainer.add(t)
      this.pieceTexts.set(piece.square, t)

      if (piece.upgraded) {
        const marker = this.add.text(
          col * CELL + CELL - 6,
          row * CELL + 4,
          '✦',
          { fontFamily: FONT, fontSize: '12px', color: '#ffd700' },
        ).setOrigin(1, 0)
        this.boardContainer.add(marker)
        this.upgradeMarkers.set(piece.square, marker)
      }
    }
  }

  private renderRelicHud() {
    this.relicHudObjects.forEach(o => (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy())
    this.relicHudObjects = []

    if (this.runState.relics.length === 0) return

    const y = this.scale.height - 36
    let x = this.scale.width - 12

    for (let i = this.runState.relics.length - 1; i >= 0; i--) {
      const relic = this.runState.relics[i]
      const bg = this.add.circle(x - 16, y, 14, 0x3a2a1a).setStrokeStyle(1, 0xff8800)
      const icon = this.add.text(x - 16, y, this.relicIcon(relic.id), {
        fontFamily: FONT, fontSize: '14px',
      }).setOrigin(0.5)

      const zone = this.add.zone(x - 30, y - 14, 30, 28).setOrigin(0).setInteractive()
      zone.on('pointerover', () => this.showRelicTooltip(relic.name, relic.description, x - 16, y - 20))
      zone.on('pointerout', () => this.hideRelicTooltip())

      this.relicHudObjects.push(bg, icon, zone)
      x -= 34
    }
  }

  private _tooltip?: Phaser.GameObjects.Container

  private showRelicTooltip(name: string, desc: string, x: number, y: number) {
    this._tooltip?.destroy()
    const w = 180
    const c = this.add.container(Math.min(x, this.scale.width - w - 4), y - 48)
    const bg = this.add.rectangle(0, 0, w, 44, 0x1a1a1a).setOrigin(0).setStrokeStyle(1, 0xff8800)
    const title = this.add.text(w / 2, 6, name, { fontFamily: FONT, fontSize: '10px', color: '#ff8800', fontStyle: 'bold' }).setOrigin(0.5, 0)
    const body = this.add.text(w / 2, 20, desc, { fontFamily: FONT, fontSize: '11px', color: '#dddddd', wordWrap: { width: w - 12 }, align: 'center' }).setOrigin(0.5, 0)
    c.add([bg, title, body])
    this._tooltip = c
  }

  private hideRelicTooltip() {
    this._tooltip?.destroy()
    this._tooltip = undefined
  }

  private relicIcon(id: string): string {
    const ICONS: Record<string, string> = {
      iron_crown: '👑', gold_coin: '🪙', extra_card: '🃏',
      blood_chalice: '🏆', gamblers_dice: '🎲',
      philosophers_stone: '💎', death_mask: '💀',
    }
    return ICONS[id] ?? '✦'
  }

  private renderHand() {
    this.clearCardObjects()
    const gap = 8
    const totalW = this.playerHand.length * (CARD_W + gap) - gap
    const startX = (this.scale.width - totalW) / 2

    this.playerHand.forEach((card, i) => {
      const x = startX + i * (CARD_W + gap)
      const container = this.add.container(x, HAND_Y_BASE)
      const isSelected = this.selectedCard?.instanceId === card.instanceId

      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, isSelected ? 0x5555aa : 0x2a2a4a).setOrigin(0)
      const frame = this.add.graphics()
      drawCardBorder(frame, 0, 0, CARD_W, CARD_H, RARITY_COLOR[card.definition.rarity])

      const emoji = this.add.text(CARD_W / 2, 24, PIECE_EMOJI[card.definition.pieceType], {
        fontFamily: FONT, fontSize: '30px',
      }).setOrigin(0.5)

      const name = this.add.text(CARD_W / 2, 56, card.definition.name, {
        fontFamily: FONT, fontSize: '11px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: CARD_W - 8 }, align: 'center',
      }).setOrigin(0.5, 0)

      const children: Phaser.GameObjects.GameObject[] = [bg, frame, emoji, name]

      // if (card.definition.ability) {
      //   children.push(
      //     this.add.text(CARD_W / 2, 74, card.definition.ability.description, {
      //       fontFamily: FONT, fontSize: '12px', color: '#aaccff', wordWrap: { width: CARD_W - 8 }, align: 'center',
      //     }).setOrigin(0.5, 0),
      //   )
      // }

      container.add(children)
      this.cardBounds.push({ card, x, y: HAND_Y_BASE, bg })
      this.cardObjects.push(container)
    })
  }

  private clearCardObjects() {
    this.cardObjects.forEach(c => c.destroy())
    this.cardObjects = []
    this.cardBounds = []
  }

  private buildConfirmButton() {
    const cx = this.scale.width / 2
    const cy = this.scale.height - 28
    this.confirmBtnBg = this.add.rectangle(cx, cy, 200, 42, 0x336699)
      .setInteractive(
        new Phaser.Geom.Rectangle(-100, -21, 200, 42),
        Phaser.Geom.Rectangle.Contains,
      )
    this.confirmBtnLabel = this.add.text(cx, cy, 'Confirmer', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5)
    this.confirmBtnBg.setVisible(false)
    this.confirmBtnLabel.setVisible(false)

    this.confirmBtnBg.on('pointerdown', () => {
      if (this.phase === 'placement') this.confirmPlacement()
    })
    this.confirmBtnBg.on('pointerover', () => {
      this.confirmBtnBg.setFillStyle(0x4488bb)
      if (this.confirmShimmerTween) {
        this.confirmShimmerTween.pause()
        this.confirmBtnBg.setAlpha(1)
        this.confirmBtnLabel.setAlpha(1)
      }
    })
    this.confirmBtnBg.on('pointerout', () => {
      this.confirmBtnBg.setFillStyle(0x336699)
      this.confirmShimmerTween?.resume()
    })
  }

  private buildAbandonButton() {
    const cx = 55
    const cy = this.scale.height - 28
    this.abandonBtnBg = this.add.rectangle(cx, cy, 96, 34, 0x661111)
      .setInteractive(new Phaser.Geom.Rectangle(-48, -17, 96, 34), Phaser.Geom.Rectangle.Contains)
    this.abandonBtnLabel = this.add.text(cx, cy, 'Abandonner', { fontFamily: FONT, fontSize: '12px', color: '#ffaaaa', fontStyle: 'bold' }).setOrigin(0.5)
    this.abandonBtnBg.setVisible(false)
    this.abandonBtnLabel.setVisible(false)

    this.abandonBtnBg.on('pointerdown', () => this.endCombat(false))
    this.abandonBtnBg.on('pointerover', () => this.abandonBtnBg.setFillStyle(0x992222))
    this.abandonBtnBg.on('pointerout', () => this.abandonBtnBg.setFillStyle(0x661111))
  }

  // Transform a screen click into board col/row, accounting for container transform.
  private screenToBoard(gx: number, gy: number): { col: number; row: number } | null {
    const lx = (gx - this.boardContainer.x) / this.boardContainer.scaleX
    const ly = (gy - this.boardContainer.y) / this.boardContainer.scaleY
    if (lx < 0 || lx >= CELL * COLS || ly < 0 || ly >= CELL * ROWS) return null
    return { col: Math.floor(lx / CELL), row: Math.floor(ly / CELL) }
  }

  private setupNativeInput(signal: AbortSignal) {
    const canvas = this.game.canvas
    const confirmCx = this.scale.width / 2
    const confirmCy = this.scale.height - 28
    const DRAG_THRESHOLD = 10

    const toGame = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      return {
        gx: (clientX - rect.left) * (this.scale.width / rect.width),
        gy: (clientY - rect.top) * (this.scale.height / rect.height),
      }
    }

    const cardAt = (gx: number, gy: number) => {
      for (const b of this.cardBounds) {
        if (gx >= b.x && gx < b.x + CARD_W && gy >= b.y && gy < b.y + CARD_H) {
          return { card: b.card, idx: this.playerHand.findIndex(c => c.instanceId === b.card.instanceId) }
        }
      }
      return null
    }

    const spawnGhost = (card: CardInstance, gx: number, gy: number) => {
      this.dragGhost?.destroy()
      this.dragGhost = this.add.text(gx, gy, PIECE_EMOJI_WHITE[card.definition.pieceType], {
        fontFamily: FONT, fontSize: '56px',
        color: '#f5f0e0', stroke: '#4a2a10', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0.85).setDepth(100)
    }

    const updateDropHighlight = (gx: number, gy: number) => {
      this.dragHighlight?.destroy()
      this.dragHighlight = undefined
      if (!this.selectedCard) return
      const coords = this.screenToBoard(gx, gy)
      if (!coords || coords.row < 4) return
      const sq = colRowToSquare(coords.col, coords.row)
      const occupied = [...this.playerPlaced, ...this.enemyPlaced].some(p => p.square === sq)
      if (occupied || this.playerPlaced.length >= this.placementBudget) return
      const wx = this.boardContainer.x + coords.col * CELL * this.boardContainer.scaleX
      const wy = this.boardContainer.y + coords.row * CELL * this.boardContainer.scaleY
      this.dragHighlight = this.add.rectangle(
        wx, wy,
        CELL * this.boardContainer.scaleX, CELL * this.boardContainer.scaleY,
        0x44ff88, 0.38,
      ).setOrigin(0).setDepth(50)
    }

    const endDrag = (gx: number, gy: number) => {
      this.dragGhost?.destroy()
      this.dragGhost = undefined
      this.dragHighlight?.destroy()
      this.dragHighlight = undefined
      this.pendingDrag = null
      const coords = this.screenToBoard(gx, gy)
      if (coords) this.handlePlacementClick(coords.col, coords.row)
    }

    const handleDown = (gx: number, gy: number) => {
      if (this.phase === 'deal') {
        for (const btn of this.dealButtons) {
          if (gx >= btn.x && gx < btn.x + btn.w && gy >= btn.y && gy < btn.y + btn.h) btn.action()
        }
        return
      }

      if (
        this.phase === 'placement' &&
        this.confirmBtnBg?.visible &&
        Math.abs(gx - confirmCx) <= 100 &&
        Math.abs(gy - confirmCy) <= 25
      ) {
        this.confirmPlacement()
        return
      }

      // Card touched → select it and arm the pending drag
      if (this.phase === 'placement') {
        const hit = cardAt(gx, gy)
        if (hit) {
          this.selectedCard = hit.card
          this.statusText.setText(`${hit.card.definition.name} sélectionné — clique ou glisse sur les rangées 1-4.`)
          this.renderHand()
          this.animateCardSelection(hit.idx)
          this.pendingDrag = { card: hit.card, startGx: gx, startGy: gy }
          return
        }
      }

      // Board or chess click
      const coords = this.screenToBoard(gx, gy)
      if (coords) this.handleBoardClick(coords.col, coords.row)
    }

    const handleMove = (gx: number, gy: number) => {
      // Active drag: move ghost + highlight drop target
      if (this.dragGhost) {
        this.dragGhost.setPosition(gx, gy)
        updateDropHighlight(gx, gy)
        return
      }

      // Pending drag: promote to active once threshold crossed
      if (this.pendingDrag) {
        const dx = gx - this.pendingDrag.startGx
        const dy = gy - this.pendingDrag.startGy
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          spawnGhost(this.pendingDrag.card, gx, gy)
          updateDropHighlight(gx, gy)
        }
        return
      }

      // Hover tint on cards
      if (this.phase === 'placement') {
        for (const b of this.cardBounds) {
          const isSelected = this.selectedCard?.instanceId === b.card.instanceId
          const over = gx >= b.x && gx < b.x + CARD_W && gy >= b.y && gy < b.y + CARD_H
          b.bg.setFillStyle(isSelected ? 0x5555aa : over ? 0x3a3a6a : 0x2a2a4a)
        }
      }
    }

    const handleUp = (gx: number, gy: number) => {
      if (this.dragGhost) {
        endDrag(gx, gy)        // drop after real drag
      } else if (this.pendingDrag) {
        this.pendingDrag = null // tap on card: card already selected, no placement
      }
    }

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const { gx, gy } = toGame(e.clientX, e.clientY); handleDown(gx, gy)
    }, { signal })
    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      const { gx, gy } = toGame(e.clientX, e.clientY); handleUp(gx, gy)
    }, { signal })
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const { gx, gy } = toGame(e.clientX, e.clientY); handleMove(gx, gy)
    }, { signal })

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]; if (t) { const { gx, gy } = toGame(t.clientX, t.clientY); handleDown(gx, gy) }
    }, { signal, passive: false } as AddEventListenerOptions)
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]; if (t) { const { gx, gy } = toGame(t.clientX, t.clientY); handleMove(gx, gy) }
    }, { signal, passive: false } as AddEventListenerOptions)
    canvas.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault()
      const t = e.changedTouches[0]; if (t) { const { gx, gy } = toGame(t.clientX, t.clientY); handleUp(gx, gy) }
    }, { signal, passive: false } as AddEventListenerOptions)
  }

  // ─── PLACEMENT ANIMATIONS ────────────────────────────────────────────────────

  private animateCardSelection(idx: number) {
    if (idx < 0 || idx >= this.cardObjects.length) return
    this.cardObjects.forEach((container, i) => {
      this.tweens.killTweensOf(container)
      if (i === idx) {
        this.tweens.add({
          targets: container,
          scaleX: 1.18, scaleY: 1.18,
          y: HAND_Y_BASE - 18,
          duration: 220,
          ease: 'Back.Out',
        })
      } else {
        this.tweens.add({
          targets: container,
          scaleX: 0.88, scaleY: 0.88,
          alpha: 0.5,
          duration: 180,
          ease: 'Quad.Out',
        })
      }
    })
    if (this.selectedCard) this.showCardPreview(this.selectedCard)
  }

  private showCardPreview(card: CardInstance, yOverride?: number) {
    this.clearCardPreview()
    const { width } = this.scale
    const def = card.definition

    const stripY = yOverride ?? HAND_Y_BASE + CARD_H + 34
    const stripW = width - 60
    const stripH = 56

    this.cardPreviewOverlay = this.add.rectangle(width / 2, stripY, stripW, stripH, 0x0a0a1e, 0.95)
      .setStrokeStyle(1, RARITY_COLOR[def.rarity])

    const container = this.add.container(width / 2, stripY)
    const hw = stripW / 2

    const emoji = this.add.text(-hw + 22, 0, PIECE_EMOJI[def.pieceType], {
      fontFamily: FONT, fontSize: '30px',
    }).setOrigin(0.5)

    const name = this.add.text(-hw + 46, -10, `${def.name}  ·  ${rarityLabel(def.rarity)}`, {
      fontFamily: FONT, fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    const bodyText = def.ability?.description ?? def.flavorText ?? ''
    const body = this.add.text(-hw + 46, 9, bodyText, {
      fontFamily: FONT, fontSize: '11px',
      color: COLOR_DESCRIPTION_CARD,
      fontStyle: def.ability ? 'bold' : 'bold italic',
      wordWrap: { width: stripW - 100 },
    }).setOrigin(0, 0.5)

    const children: Phaser.GameObjects.GameObject[] = [emoji, name, body]
    if (card.upgraded && def.upgradeBonus) {
      children.push(
        this.add.text(hw - 8, 0, `✦ ${def.upgradeBonus.description}`, {
          fontFamily: FONT, fontSize: '10px', color: '#ffd700', align: 'right', wordWrap: { width: 130 },
        }).setOrigin(1, 0.5),
      )
    }
    container.add(children)
    container.setAlpha(0)
    this.tweens.add({ targets: container, alpha: 1, duration: 200, ease: 'Quad.Out' })

    this.cardPreviewContainer = container
  }

  private clearCardPreview() {
    if (this.cardPreviewContainer) {
      this.tweens.killTweensOf(this.cardPreviewContainer)
      this.cardPreviewContainer.destroy()
      this.cardPreviewContainer = undefined
    }
    this.cardPreviewOverlay?.destroy()
    this.cardPreviewOverlay = undefined
  }

  private animatePieceLanding(square: Square) {
    const { col, row } = squareToColRow(square)
    // Local coords within boardContainer
    const cx = col * CELL + CELL / 2
    const cy = row * CELL + CELL / 2

    const pieceText = this.pieceTexts.get(square)
    if (!pieceText) return

    pieceText.setY(cy - 100).setScale(1.8).setAlpha(0)
    this.tweens.add({
      targets: pieceText,
      y: cy,
      scaleX: 1, scaleY: 1,
      alpha: 1,
      duration: 450,
      ease: 'Bounce.Out',
    })

    const ring = this.add.circle(cx, cy, 8, 0xffffff, 0.8)
    this.boardContainer.add(ring)
    this.tweens.add({
      targets: ring,
      scaleX: 5, scaleY: 5,
      alpha: 0,
      duration: 380,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    })

    const highlight = this.add.rectangle(col * CELL, row * CELL, CELL, CELL, 0xffffff, 0.22).setOrigin(0)
    this.boardContainer.add(highlight)
    this.tweens.add({
      targets: highlight,
      alpha: 0,
      duration: 550,
      ease: 'Quad.Out',
      onComplete: () => highlight.destroy(),
    })
  }

  private setConfirmVisible(v: boolean, label?: string) {
    this.confirmBtnBg.setVisible(v)
    this.confirmBtnLabel.setVisible(v)
    if (label) this.confirmBtnLabel.setText(label)
  }

  private startConfirmShimmer() {
    if (this.confirmShimmerTween) return
    this.confirmShimmerTween = this.tweens.add({
      targets: [this.confirmBtnBg, this.confirmBtnLabel],
      alpha: { from: 1, to: 0.4 },
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private stopConfirmShimmer() {
    if (!this.confirmShimmerTween) return
    this.confirmShimmerTween.stop()
    this.confirmShimmerTween = null
    this.confirmBtnBg.setAlpha(1)
    this.confirmBtnLabel.setAlpha(1)
  }

  private createBoardLabels() {
    const labelStyle = { fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }
    // Local coords — added to boardContainer so they scale with the board
    for (let c = 0; c < COLS; c++) {
      const label = this.add.text(c * CELL + CELL / 2, ROWS * CELL + 12, String.fromCharCode(97 + c), labelStyle).setOrigin(0.5, 0)
      this.boardContainer.add(label)
    }
    for (let r = 0; r < ROWS; r++) {
      const label = this.add.text(-18, r * CELL + CELL / 2, String(8 - r), labelStyle).setOrigin(0.5, 0.5)
      this.boardContainer.add(label)
    }
  }

  private updateHpText() {
    this.hpText.setText(`❤️  ${this.runState.currentHp} / ${this.runState.maxHp}`)
    this.goldText.setText(`${this.runState.gold} 💰`)
    this.renderRelicHud()
  }

  private showPhaseAnnounce(label: string) {
    const { width } = this.scale
    // Fixed position at board centre (before any container tween)
    const cy = BOARD_Y + (CELL * ROWS) / 2
    const bg = this.add.rectangle(width / 2, cy, 340, 68, 0x000000, 0.82).setOrigin(0.5).setAlpha(0)
    const t = this.add.text(width / 2, cy, label, {
      fontFamily: FONT, fontSize: '30px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0)
    this.tweens.add({
      targets: [bg, t], alpha: 1, duration: 280, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(2750, () => {
          this.tweens.add({
            targets: [bg, t], alpha: 0, duration: 380, ease: 'Quad.In',
            onComplete: () => { bg.destroy(); t.destroy() },
          })
        })
      },
    })
  }

  private showFloatingText(msg: string, color: number) {
    const hex = `#${color.toString(16).padStart(6, '0')}`
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 80, msg, {
      fontFamily: FONT, fontSize: '20px', color: hex, fontStyle: 'bold',
    }).setOrigin(0.5)
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1000, onComplete: () => t.destroy() })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colRowToSquare(col: number, row: number): Square {
  return `${String.fromCharCode(97 + col)}${8 - row}`
}

function squareToColRow(sq: Square): { col: number; row: number } {
  return { col: sq.charCodeAt(0) - 97, row: 8 - parseInt(sq[1]) }
}

function blendColor(base: number, overlay: number, alpha: number): number {
  const r = Math.round(((base >> 16) & 0xff) + (((overlay >> 16) & 0xff) - ((base >> 16) & 0xff)) * alpha)
  const g = Math.round(((base >> 8) & 0xff) + (((overlay >> 8) & 0xff) - ((base >> 8) & 0xff)) * alpha)
  const b = Math.round((base & 0xff) + ((overlay & 0xff) - (base & 0xff)) * alpha)
  return (r << 16) | (g << 8) | b
}
