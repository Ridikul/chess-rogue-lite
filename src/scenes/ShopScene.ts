import Phaser from 'phaser'
import type { RunState } from '../types/index'
import { FONT, rarityLabel } from '../utils/style'
import { CARD_DEFINITIONS } from '../types/cards'
import { RELIC_DEFINITIONS, ALL_RELIC_IDS } from '../types/relics'
import { addCardToDeck, shuffle } from '../systems/CardSystem'

const CARD_PRICE: Record<string, number> = { common: 40, uncommon: 75, rare: 130, legendary: 200 }
const RELIC_PRICE = 120

const RARITY_COLOR: Record<string, number> = {
  common: 0x888888, uncommon: 0x4caf50, rare: 0x2196f3, legendary: 0xffc107,
}

const PIECE_EMOJI: Record<string, string> = {
  pawn: '♟', rook: '♜', knight: '♞', bishop: '♝', queen: '♛', king: '♚',
}

export class ShopScene extends Phaser.Scene {
  private runState!: RunState

  constructor() { super({ key: 'ShopScene' }) }

  init(data: { runState: RunState }) {
    this.runState = { ...data.runState }
  }

  create() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'shop'
    const { width, height } = this.scale
    this.add.rectangle(0, 0, width, height, 0x0e0e1e).setOrigin(0)
    this.renderShop()
    this.setupInput()
  }

  private renderShop() {
    const { width, height } = this.scale

    // ── Header ──────────────────────────────────────────────
    this.add.text(width / 2, 20, '🛒  Boutique', {
      fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    this.add.text(width - 14, 24, `Or : ${this.runState.gold}`, {
      fontFamily: FONT, fontSize: '16px', color: '#ffd700',
    }).setOrigin(1, 0)

    // ── Cards ────────────────────────────────────────────────
    this.add.text(width / 2, 66, 'Cartes', {
      fontFamily: FONT, fontSize: '13px', color: '#8888aa', fontStyle: 'italic',
    }).setOrigin(0.5, 0)

    const cardW = 176
    const cardH = 252
    const gap = 10
    const totalW = 3 * cardW + 2 * gap
    const startX = (width - totalW) / 2
    const cardY = 88

    const allCardIds = Object.keys(CARD_DEFINITIONS)
    const pickedCards = shuffle(allCardIds).slice(0, 3)

    pickedCards.forEach((id, i) => {
      const price = CARD_PRICE[CARD_DEFINITIONS[id]!.rarity]
      this.buildCardItem(startX + i * (cardW + gap), cardY, cardW, cardH, id, price)
    })

    // ── Relic ────────────────────────────────────────────────
    const relicY = cardY + cardH + 28
    this.add.text(width / 2, relicY, 'Relique', {
      fontFamily: FONT, fontSize: '13px', color: '#8888aa', fontStyle: 'italic',
    }).setOrigin(0.5, 0)

    const ownedIds = new Set(this.runState.relics.map(r => r.id))
    const available = ALL_RELIC_IDS.filter(id => !ownedIds.has(id))
    const relicId = shuffle(available)[0]

    if (relicId) {
      const relicW = 420
      const relicH = 88
      this.buildRelicItem((width - relicW) / 2, relicY + 24, relicW, relicH, relicId)
    } else {
      this.add.text(width / 2, relicY + 24, 'Aucune relique disponible', {
        fontFamily: FONT, fontSize: '13px', color: '#555566',
      }).setOrigin(0.5, 0)
    }

    // ── Leave button ─────────────────────────────────────────
    const btnW = 220
    const btnH = 44
    const btnX = width / 2 - btnW / 2
    const btnY = height - 64
    const leaveBg = this.add.rectangle(width / 2, btnY + btnH / 2, btnW, btnH, 0x2a4a2a)
      .setInteractive()
      .setStrokeStyle(1, 0x44aa66)
    this.add.text(width / 2, btnY + btnH / 2, 'Quitter la boutique', {
      fontFamily: FONT, fontSize: '15px', color: '#88ff88',
    }).setOrigin(0.5)

    leaveBg.on('pointerover', () => leaveBg.setFillStyle(0x3a6a3a))
    leaveBg.on('pointerout', () => leaveBg.setFillStyle(0x2a4a2a))
    leaveBg.on('pointerdown', () => this.leave())

    // Store bounds for touch fallback
    this._leaveBounds = { x: btnX, y: btnY, w: btnW, h: btnH }
  }

  private _leaveBounds?: { x: number; y: number; w: number; h: number }

  private buildCardItem(x: number, y: number, w: number, h: number, cardId: string, price: number) {
    const def = CARD_DEFINITIONS[cardId]!
    const canAfford = this.runState.gold >= price
    const rarityColor = RARITY_COLOR[def.rarity]
    const rarityHex = `#${rarityColor.toString(16).padStart(6, '0')}`
    const container = this.add.container(x, y)

    const bgColor = canAfford ? 0x18183a : 0x16162e
    const bg = this.add.rectangle(0, 0, w, h, bgColor).setOrigin(0)

    // Border
    const border = this.add.graphics()
    border.lineStyle(2, rarityColor, canAfford ? 0.9 : 0.5)
    border.strokeRect(0, 0, w, h)
    border.lineStyle(1, rarityColor, canAfford ? 0.4 : 0.2)
    border.strokeRect(4, 4, w - 8, h - 8)

    const emoji = this.add.text(w / 2, 46, PIECE_EMOJI[def.pieceType] ?? '?', {
      fontFamily: FONT, fontSize: '48px',
    }).setOrigin(0.5).setAlpha(canAfford ? 1 : 0.65)

    const name = this.add.text(w / 2, 112, def.name, {
      fontFamily: FONT, fontSize: '15px', color: canAfford ? '#ffffff' : '#aaaacc',
      fontStyle: 'bold', align: 'center', wordWrap: { width: w - 20 },
    }).setOrigin(0.5, 0)

    const rarity = this.add.text(w / 2, 138, rarityLabel(def.rarity), {
      fontFamily: FONT, fontSize: '11px', color: canAfford ? rarityHex : '#7788aa', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    const bodyText = def.ability?.description ?? def.flavorText ?? '—'
    const body = this.add.text(w / 2, 158, bodyText, {
      fontFamily: FONT, fontSize: '11px',
      color: canAfford ? (def.ability ? '#aaccff' : '#666677') : '#8899bb',
      align: 'center', wordWrap: { width: w - 20 },
      fontStyle: def.ability ? 'normal' : 'italic',
    }).setOrigin(0.5, 0)

    // Price badge at bottom
    const priceBg = this.add.rectangle(w / 2, h - 20, 90, 26, canAfford ? 0x4a3a00 : 0x2a2a3a).setOrigin(0.5)
    const priceLabel = this.add.text(w / 2, h - 20, `${price} Or`, {
      fontFamily: FONT, fontSize: '13px', color: canAfford ? '#ffd700' : '#8888aa', fontStyle: 'bold',
    }).setOrigin(0.5)

    container.add([bg, border, emoji, name, rarity, body, priceBg, priceLabel])
    container.setSize(w, h).setInteractive()

    if (canAfford) {
      container.on('pointerover', () => {
        bg.setFillStyle(0x28285a)
        this.tweens.killTweensOf(container)
        this.tweens.add({ targets: container, scaleX: 1.04, scaleY: 1.04, y: y - 6, duration: 140, ease: 'Back.Out' })
      })
      container.on('pointerout', () => {
        bg.setFillStyle(bgColor)
        this.tweens.killTweensOf(container)
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, y, duration: 160, ease: 'Quad.Out' })
      })
      container.on('pointerdown', () => this.buyCard(cardId, price))
    }
  }

  private buildRelicItem(x: number, y: number, w: number, h: number, relicId: string) {
    const relic = RELIC_DEFINITIONS[relicId]!
    const canAfford = this.runState.gold >= RELIC_PRICE
    const container = this.add.container(x, y)

    const bgColor = canAfford ? 0x2a1a08 : 0x1a1208
    const bg = this.add.rectangle(0, 0, w, h, bgColor).setOrigin(0)

    const border = this.add.graphics()
    border.lineStyle(2, 0xff8800, canAfford ? 0.9 : 0.5)
    border.strokeRect(0, 0, w, h)
    border.lineStyle(1, 0xff8800, canAfford ? 0.35 : 0.2)
    border.strokeRect(4, 4, w - 8, h - 8)

    const name = this.add.text(w / 2, 14, relic.name, {
      fontFamily: FONT, fontSize: '15px', color: canAfford ? '#ff9922' : '#cc7733', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    const desc = this.add.text(w / 2, 38, relic.description, {
      fontFamily: FONT, fontSize: '12px', color: canAfford ? '#dddddd' : '#aaaaaa',
      align: 'center', wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0)

    const priceBg = this.add.rectangle(w / 2, h - 16, 90, 24, canAfford ? 0x4a3a00 : 0x2a2010).setOrigin(0.5)
    const priceLabel = this.add.text(w / 2, h - 16, `${RELIC_PRICE} Or`, {
      fontFamily: FONT, fontSize: '13px', color: canAfford ? '#ffd700' : '#aa8844', fontStyle: 'bold',
    }).setOrigin(0.5)

    container.add([bg, border, name, desc, priceBg, priceLabel])
    container.setSize(w, h).setInteractive()

    if (canAfford) {
      container.on('pointerover', () => {
        bg.setFillStyle(0x4a2a0a)
        this.tweens.killTweensOf(container)
        this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, y: y - 4, duration: 140, ease: 'Back.Out' })
      })
      container.on('pointerout', () => {
        bg.setFillStyle(bgColor)
        this.tweens.killTweensOf(container)
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, y, duration: 160, ease: 'Quad.Out' })
      })
      container.on('pointerdown', () => this.buyRelic(relicId))
    }
  }

  private setupInput() {
    const canvas = this.game.canvas
    const { width, height } = this.scale

    const toGame = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      return {
        gx: (clientX - rect.left) * (width / rect.width),
        gy: (clientY - rect.top) * (height / rect.height),
      }
    }

    const handleTap = (clientX: number, clientY: number) => {
      const { gx, gy } = toGame(clientX, clientY)
      const b = this._leaveBounds
      if (b && gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) {
        this.leave()
      }
    }

    const ac = new AbortController()
    this.events.once('shutdown', () => ac.abort())
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches[0]) handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { signal: ac.signal, passive: false } as AddEventListenerOptions)
  }

  private buyCard(cardId: string, price: number) {
    this.runState = {
      ...this.runState,
      gold: this.runState.gold - price,
      deck: addCardToDeck(this.runState.deck, cardId),
    }
    this.showToast('Carte ajoutée au deck !')
    this.time.delayedCall(900, () => this.scene.restart({ runState: this.runState }))
  }

  private buyRelic(relicId: string) {
    const relic = RELIC_DEFINITIONS[relicId]!
    const newRun = {
      ...this.runState,
      gold: this.runState.gold - RELIC_PRICE,
      relics: [...this.runState.relics, relic],
    }
    if (relic.onAcquire) relic.onAcquire(newRun)
    this.runState = newRun
    this.showToast(`Relique obtenue : ${relic.name}`)
    this.time.delayedCall(900, () => this.scene.restart({ runState: this.runState }))
  }

  private showToast(msg: string) {
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 40, msg, {
      fontFamily: FONT, fontSize: '20px', color: '#44ff88', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1100, onComplete: () => t.destroy() })
  }

  private leave() {
    this.scene.start('MapScene', { runState: this.runState })
  }
}
