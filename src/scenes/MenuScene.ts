import Phaser from 'phaser'
import { createRunState } from '../systems/RunState'
import { FONT } from '../utils/style'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'menu'
    const { width, height } = this.scale

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0)

    this.add.text(width / 2, height * 0.25, 'Chess\nRogue Lite', {
      fontFamily: FONT, fontSize: '42px', color: '#ffffff', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.45, '♟ ♜ ♞ ♝ ♛ ♚', {
      fontFamily: FONT, fontSize: '28px', color: '#aaaaff',
    }).setOrigin(0.5)

    const btn = this.add.rectangle(width / 2, height * 0.65, 200, 50, 0x4444aa)
      .setInteractive()
    this.add.text(width / 2, height * 0.65, 'Nouvelle partie', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5)

    btn.on('pointerover', () => btn.setFillStyle(0x6666cc))
    btn.on('pointerout', () => btn.setFillStyle(0x4444aa))
    btn.on('pointerdown', () => {
      const runState = createRunState()
      this.scene.start('MapScene', { runState })
    })

    this.add.text(width / 2, height * 0.85, 'Proto v0.1', {
      fontFamily: FONT, fontSize: '11px', color: '#555577',
    }).setOrigin(0.5)
  }
}
