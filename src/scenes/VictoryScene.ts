import Phaser from 'phaser'
import type { RunState } from '../types/index'
import { FONT, rarityLabel } from '../utils/style'
import { RARITY_COLOR, PIECE_EMOJI, drawCardBorder } from '../utils/cardBorder'
import { CARD_DEFINITIONS } from '../types/cards'
import { shuffle, addCardToDeck } from '../systems/CardSystem'
import { combatGoldReward } from '../systems/RunState'

export class VictoryScene extends Phaser.Scene {
  private runState!: RunState

  constructor() { super({ key: 'VictoryScene' }) }

  init(data: { runState: RunState }) {
    this.runState = data.runState
  }

  create() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'result_win'
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x060614).setOrigin(0)
    this.playVictoryAnimation(() => this.showRewardScreen())
  }

  private playVictoryAnimation(onComplete: () => void) {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    const flash = this.add.rectangle(0, 0, width, height, 0xffd700).setOrigin(0).setAlpha(0)
    this.tweens.add({ targets: flash, alpha: { from: 0, to: 0.5 }, duration: 180, yoyo: true, ease: 'Quad.Out' })

    const text = this.add.text(cx, cy, 'Victoire !', {
      fontFamily: FONT, fontSize: '72px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0.2)
    this.tweens.add({ targets: text, alpha: 1, scale: 1, duration: 380, delay: 80, ease: 'Back.Out' })

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const color = i % 2 === 0 ? 0xffd700 : 0xffffff
      const spark = this.add.circle(cx, cy, 7, color)
      const dist = 140 + (i * 17 % 80)
      this.tweens.add({
        targets: spark,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.1 },
        duration: 700 + (i * 37 % 300),
        delay: 80,
        ease: 'Quad.Out',
      })
    }

    const curtain = this.add.rectangle(0, 0, width, height, 0x060614).setOrigin(0).setAlpha(0)
    this.tweens.add({
      targets: curtain,
      alpha: 1,
      duration: 380,
      delay: 1300,
      ease: 'Quad.In',
      onComplete: () => onComplete(),
    })
  }

  private showRewardScreen() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'reward'
    const { width, height } = this.scale

    this.add.rectangle(0, 0, width, height, 0x060614).setOrigin(0)
    this.add.text(width / 2, 48, 'Victoire !', {
      fontFamily: FONT, fontSize: '46px', color: '#44ff88', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.add.text(width / 2, 106, `+${combatGoldReward(this.runState)} Or  ·  Total : ${this.runState.gold} Or`, {
      fontFamily: FONT, fontSize: '16px', color: '#ffd700',
    }).setOrigin(0.5)
    this.add.text(width / 2, 140, 'Choisis une carte à ajouter à ton deck', {
      fontFamily: FONT, fontSize: '13px', color: '#8888aa', fontStyle: 'italic',
    }).setOrigin(0.5)

    const cardW = 176, cardH = 290, gap = 10
    const startX = (width - (3 * cardW + 2 * gap)) / 2

    const allIds = Object.keys(CARD_DEFINITIONS).filter(id => id !== 'basic_king')
    shuffle(allIds).slice(0, 3).forEach((id, i) => {
      this.buildRewardCard(startX + i * (cardW + gap), 168, cardW, cardH, id)
    })

    const skip = this.add.rectangle(width / 2, height - 44, 180, 40, 0x2a2a2a).setInteractive()
    this.add.text(width / 2, height - 44, 'Passer', {
      fontFamily: FONT, fontSize: '14px', color: '#666677',
    }).setOrigin(0.5)
    skip.on('pointerover', () => skip.setFillStyle(0x444455))
    skip.on('pointerout', () => skip.setFillStyle(0x2a2a2a))
    skip.on('pointerdown', () => this.scene.start('MapScene', { runState: this.runState }))
  }

  private buildRewardCard(x: number, y: number, w: number, h: number, cardId: string) {
    const def = CARD_DEFINITIONS[cardId]!
    const rarityColor = RARITY_COLOR[def.rarity]
    const rarityHex = `#${rarityColor.toString(16).padStart(6, '0')}`
    const container = this.add.container(x, y)

    const bg = this.add.rectangle(0, 0, w, h, 0x12122e).setOrigin(0)
    const frame = this.add.graphics()
    drawCardBorder(frame, 0, 0, w, h, rarityColor)

    const emoji = this.add.text(w / 2, 54, PIECE_EMOJI[def.pieceType], { fontFamily: FONT, fontSize: '52px' }).setOrigin(0.5)
    const name = this.add.text(w / 2, 120, def.name, {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      align: 'center', wordWrap: { width: w - 20 },
    }).setOrigin(0.5, 0)
    const rarity = this.add.text(w / 2, 148, rarityLabel(def.rarity), {
      fontFamily: FONT, fontSize: '11px', color: rarityHex, fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    const sep = this.add.graphics()
    sep.lineStyle(1, rarityColor, 0.3)
    sep.beginPath(); sep.moveTo(16, 168); sep.lineTo(w - 16, 168); sep.strokePath()

    const bodyText = def.ability?.description ?? def.flavorText ?? ''
    const body = this.add.text(w / 2, 178, bodyText, {
      fontFamily: FONT, fontSize: '12px',
      color: def.ability ? '#aaccff' : '#777788',
      fontStyle: def.ability ? 'normal' : 'italic',
      align: 'center', wordWrap: { width: w - 24 },
    }).setOrigin(0.5, 0)

    container.add([bg, frame, emoji, name, rarity, sep, body])
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)

    container.on('pointerover', () => {
      bg.setFillStyle(0x22224a)
      this.tweens.killTweensOf(container)
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, y: y - 10, duration: 160, ease: 'Back.Out' })
    })
    container.on('pointerout', () => {
      bg.setFillStyle(0x12122e)
      this.tweens.killTweensOf(container)
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, y, duration: 180, ease: 'Quad.Out' })
    })
    container.on('pointerdown', () => {
      this.runState = { ...this.runState, deck: addCardToDeck(this.runState.deck, cardId) }
      this.scene.start('MapScene', { runState: this.runState })
    })
  }
}
