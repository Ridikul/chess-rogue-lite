import Phaser from 'phaser'
import { FONT } from '../utils/style'

export class DefeatScene extends Phaser.Scene {
  constructor() { super({ key: 'DefeatScene' }) }

  create() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'result_lose'
    const { width, height } = this.scale

    this.add.rectangle(0, 0, width, height, 0x0a0008).setOrigin(0)
    const text = this.add.text(width / 2, height / 2, 'Défaite…', {
      fontFamily: FONT, fontSize: '52px', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({ targets: text, alpha: 1, duration: 600, ease: 'Quad.Out' })
    this.time.delayedCall(2200, () => this.scene.start('MenuScene'))
  }
}
