import Phaser from 'phaser'
import type { RunState, CardInstance } from '../types/index'
import { FONT } from '../utils/style'
import { healHp } from '../systems/RunState'

const RARITY_COLOR: Record<string, number> = {
  common: 0x888888, uncommon: 0x4caf50, rare: 0x2196f3, legendary: 0xffc107,
}

export class RestScene extends Phaser.Scene {
  private runState!: RunState

  constructor() { super({ key: 'RestScene' }) }

  init(data: { runState: RunState }) {
    this.runState = { ...data.runState }
  }

  create() {
    const { width, height } = this.scale
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0)
    this.add.text(width / 2, 18, '🔥 Feu de Camp', { fontFamily: FONT, fontSize: '22px', color: '#ff8844', fontStyle: 'bold' }).setOrigin(0.5, 0)
    this.add.text(width / 2, 52, 'Que veux-tu faire ?', { fontFamily: FONT, fontSize: '14px', color: '#aaaaaa' }).setOrigin(0.5, 0)

    this.buildHealButton()
    this.buildUpgradeButton()
    this.buildLeaveButton()
  }

  private buildHealButton() {
    const healAmt = Math.floor(this.runState.maxHp * 0.3)
    const isFull = this.runState.currentHp === this.runState.maxHp
    const x = this.scale.width / 2
    const y = 130

    const btn = this.add.rectangle(x, y, 280, 60, isFull ? 0x333333 : 0x3a5c3a).setInteractive()
    this.add.text(x, y - 10, 'Se soigner', { fontFamily: FONT, fontSize: '16px', color: isFull ? '#666666' : '#88ff88' }).setOrigin(0.5)
    this.add.text(x, y + 12, `+${healAmt} PV  (${this.runState.currentHp}/${this.runState.maxHp})`, {
      fontFamily: FONT, fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5, 0)

    if (!isFull) {
      btn.on('pointerover', () => btn.setFillStyle(0x4a7c4a))
      btn.on('pointerout', () => btn.setFillStyle(0x3a5c3a))
      btn.on('pointerdown', () => {
        this.runState = healHp(this.runState, healAmt)
        this.showToast(`+${healAmt} PV restaurés`)
        this.time.delayedCall(1000, () => this.leave())
      })
    }
  }

  private buildUpgradeButton() {
    const x = this.scale.width / 2
    const y = 220

    const btn = this.add.rectangle(x, y, 280, 60, 0x3a3a6a).setInteractive()
    this.add.text(x, y - 10, 'Améliorer une carte', { fontFamily: FONT, fontSize: '16px', color: '#aaaaff' }).setOrigin(0.5)
    this.add.text(x, y + 12, 'Choisir une carte du deck', { fontFamily: FONT, fontSize: '11px', color: '#aaaaaa' }).setOrigin(0.5, 0)

    btn.on('pointerover', () => btn.setFillStyle(0x4a4a8a))
    btn.on('pointerout', () => btn.setFillStyle(0x3a3a6a))
    btn.on('pointerdown', () => {
      btn.setFillStyle(0x5555aa)
      this.showDeckPicker()
    })
  }

  private buildLeaveButton() {
    const { width, height } = this.scale
    const btn = this.add.rectangle(width / 2, height - 40, 180, 40, 0x444444).setInteractive()
    this.add.text(width / 2, height - 40, 'Continuer', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }).setOrigin(0.5)
    btn.on('pointerover', () => btn.setFillStyle(0x666666))
    btn.on('pointerout', () => btn.setFillStyle(0x444444))
    btn.on('pointerdown', () => this.leave())
  }

  private showDeckPicker() {
    // Nettoie l'affichage précédent si besoin
    const existing = this.children.getByName('deckpicker')
    if (existing) existing.destroy()

    const container = this.add.container(0, 310).setName('deckpicker')
    const upgradeable = this.runState.deck.filter(c => !c.upgraded)

    this.add.text(this.scale.width / 2, 310, 'Sélectionne une carte à améliorer :', {
      fontFamily: FONT, fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5, 0)

    const cardW = 90
    const gap = 8
    const perRow = Math.floor((this.scale.width - 20) / (cardW + gap))

    upgradeable.forEach((card, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = 10 + col * (cardW + gap)
      const y = 335 + row * 70

      const bg = this.add.rectangle(x, y, cardW, 60, 0x2a2a4a).setOrigin(0).setInteractive()
      this.add.rectangle(x, y, cardW, 60, 0).setOrigin(0).setStrokeStyle(1, RARITY_COLOR[card.definition.rarity])
      const name = this.add.text(x + cardW / 2, y + 12, card.definition.name, {
        fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0)
      const plus = this.add.text(x + cardW / 2, y + 28, '+Pouvoir', {
        fontFamily: FONT, fontSize: '11px', color: '#aaaaff',
      }).setOrigin(0.5, 0)

      bg.on('pointerover', () => bg.setFillStyle(0x4444aa))
      bg.on('pointerout', () => bg.setFillStyle(0x2a2a4a))
      bg.on('pointerdown', () => this.upgradeCard(card))

      container.add([bg, name, plus])
    })

    if (upgradeable.length === 0) {
      this.add.text(this.scale.width / 2, 340, 'Toutes les cartes sont déjà améliorées !', {
        fontFamily: FONT, fontSize: '12px', color: '#888888',
      }).setOrigin(0.5, 0)
    }
  }

  private upgradeCard(card: CardInstance) {
    const newDeck = this.runState.deck.map(c =>
      c.instanceId === card.instanceId
        ? { ...c, upgraded: true }
        : c,
    )
    this.runState = { ...this.runState, deck: newDeck }
    this.showToast(`${card.definition.name} améliorée !`)
    this.time.delayedCall(1000, () => this.leave())
  }

  private showToast(msg: string) {
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 60, msg, {
      fontFamily: FONT, fontSize: '18px', color: '#ffdd44', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1400, onComplete: () => t.destroy() })
  }

  private leave() {
    this.scene.start('MapScene', { runState: this.runState })
  }
}
