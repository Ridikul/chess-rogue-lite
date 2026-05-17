import Phaser from 'phaser'
import { createRunState } from '../systems/RunState'
import { FONT } from '../utils/style'

const PIECES = ['♚', '♛', '♜', '♝', '♞', '♟']

export class MenuScene extends Phaser.Scene {
  private driftPieces: Phaser.GameObjects.Text[] = []

  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'menu'
    const { width, height } = this.scale

    // ── Background : deep velvet with corner vignette ──
    this.add.rectangle(0, 0, width, height, 0x0d0a1a).setOrigin(0)
    const vignette = this.add.graphics()
    for (let i = 0; i < 6; i++) {
      vignette.fillStyle(0x000000, 0.08)
      vignette.fillRect(-i * 6, -i * 6, width + i * 12, i * 12)
      vignette.fillRect(-i * 6, height - i * 12, width + i * 12, i * 12)
    }
    // Warm glow behind title
    const haloGfx = this.add.graphics()
    for (let i = 8; i >= 1; i--) {
      haloGfx.fillStyle(0xffb44a, 0.025)
      haloGfx.fillCircle(width / 2, height * 0.30, 40 + i * 28)
    }

    // ── Drifting chess pieces in the background ──
    this.spawnDriftPieces(width, height, 11)

    // ── Title block ──
    const titleY = height * 0.28
    const title = this.add.text(width / 2, titleY, 'CHESS', {
      fontFamily: FONT, fontSize: '88px', color: '#f0c463', fontStyle: 'bold',
      stroke: '#2a1a06', strokeThickness: 7,
      shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 12, fill: true },
    }).setOrigin(0.5).setAlpha(0)

    const subtitle = this.add.text(width / 2, titleY + 64, 'R O G U E   L I T E', {
      fontFamily: FONT, fontSize: '24px', color: '#d8b878', fontStyle: 'bold',
      stroke: '#1a1006', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0)

    // Ornamental divider with diamond center
    const dividerY = titleY + 102
    const divGfx = this.add.graphics().setAlpha(0)
    divGfx.lineStyle(1, 0xc8a458, 0.7)
    divGfx.lineBetween(width / 2 - 140, dividerY, width / 2 - 14, dividerY)
    divGfx.lineBetween(width / 2 + 14, dividerY, width / 2 + 140, dividerY)
    divGfx.fillStyle(0xf0c463, 0.85)
    divGfx.beginPath()
    divGfx.moveTo(width / 2, dividerY - 5)
    divGfx.lineTo(width / 2 + 5, dividerY)
    divGfx.lineTo(width / 2, dividerY + 5)
    divGfx.lineTo(width / 2 - 5, dividerY)
    divGfx.closePath()
    divGfx.fillPath()

    // Tagline
    const tagline = this.add.text(width / 2, dividerY + 30, 'Une partie. Une vie. Aucune retraite.', {
      fontFamily: FONT, fontSize: '15px', color: '#9b8fb0', fontStyle: 'italic',
    }).setOrigin(0.5).setAlpha(0)

    // ── Entrance animations ──
    this.tweens.add({ targets: title, alpha: 1, scale: { from: 1.08, to: 1 }, duration: 720, ease: 'Quad.Out' })
    this.tweens.add({ targets: subtitle, alpha: 1, y: { from: titleY + 80, to: titleY + 64 }, duration: 700, ease: 'Quad.Out', delay: 220 })
    this.tweens.add({ targets: divGfx, alpha: 1, duration: 600, delay: 460 })
    this.tweens.add({ targets: tagline, alpha: 1, duration: 600, delay: 620 })

    // Title flicker
    this.tweens.add({
      targets: title, alpha: { from: 1, to: 0.88 },
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 1000,
    })

    // ── New game button ──
    const btnY = height * 0.66
    const btnW = 280
    const btnH = 64
    const btnCx = width / 2

    const btnGlow = this.add.graphics().setAlpha(0)
    btnGlow.fillStyle(0xf0c463, 0.18)
    btnGlow.fillRoundedRect(btnCx - btnW / 2 - 10, btnY - btnH / 2 - 10, btnW + 20, btnH + 20, 14)

    const btnBgGfx = this.add.graphics()
    const drawButton = (fill: number, border: number, alpha = 1) => {
      btnBgGfx.clear()
      btnBgGfx.fillStyle(fill, 1)
      btnBgGfx.fillRoundedRect(btnCx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      btnBgGfx.lineStyle(2, border, alpha)
      btnBgGfx.strokeRoundedRect(btnCx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      btnBgGfx.lineStyle(1, 0xffffff, 0.08)
      btnBgGfx.strokeRoundedRect(btnCx - btnW / 2 + 4, btnY - btnH / 2 + 4, btnW - 8, btnH - 8, 8)
    }
    drawButton(0x2a1f44, 0xc8a458)

    const crown = this.add.text(btnCx - btnW / 2 + 28, btnY, '♚', {
      fontFamily: FONT, fontSize: '32px', color: '#f0c463',
    }).setOrigin(0.5)
    const btnLabel = this.add.text(btnCx + 14, btnY, 'NOUVELLE PARTIE', {
      fontFamily: FONT, fontSize: '20px', color: '#f5e6c0', fontStyle: 'bold',
    }).setOrigin(0.5)

    // Idle subtle pulse on the glow
    this.tweens.add({
      targets: btnGlow, alpha: { from: 0.55, to: 0.95 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Native input hit zone (Phaser interactive system not used elsewhere in this proto for the menu — keep simple)
    const hit = this.add.rectangle(btnCx, btnY, btnW + 20, btnH + 20, 0x000000, 0).setInteractive()
    let started = false
    const launch = () => {
      if (started) return
      started = true
      this.tweens.add({
        targets: [title, subtitle, divGfx, tagline, crown, btnLabel, btnGlow, btnBgGfx],
        alpha: 0, duration: 220, ease: 'Quad.In',
      })
      this.tweens.add({
        targets: this.driftPieces, alpha: 0, duration: 220, ease: 'Quad.In',
      })
      this.time.delayedCall(240, () => {
        const runState = createRunState()
        this.scene.start('MapScene', { runState })
      })
    }
    hit.on('pointerover', () => {
      drawButton(0x3a2a5e, 0xf0c463)
      this.tweens.add({ targets: [crown, btnLabel], scale: 1.06, duration: 120, ease: 'Quad.Out' })
    })
    hit.on('pointerout', () => {
      drawButton(0x2a1f44, 0xc8a458)
      this.tweens.add({ targets: [crown, btnLabel], scale: 1, duration: 120, ease: 'Quad.Out' })
    })
    hit.on('pointerdown', launch)

    // ── Footer ──
    this.add.text(width / 2, height - 28, 'Proto v0.1 — ♟ inspired by Slay the Spire & FIDE', {
      fontFamily: FONT, fontSize: '11px', color: '#544870', fontStyle: 'italic',
    }).setOrigin(0.5)
  }

  private spawnDriftPieces(width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const piece = PIECES[Math.floor(Math.random() * PIECES.length)]
      const size = 80 + Math.random() * 110
      const x = Math.random() * width
      const y = Math.random() * height
      const t = this.add.text(x, y, piece, {
        fontFamily: FONT, fontSize: `${size}px`,
        color: Math.random() < 0.5 ? '#3a2f6a' : '#523c1a',
      }).setOrigin(0.5)
      t.setAlpha(0.10 + Math.random() * 0.06)
      t.setRotation((Math.random() - 0.5) * 0.5)
      t.setDepth(-1)
      this.driftPieces.push(t)
      this.driftPiece(t, width, height)
    }
  }

  private driftPiece(t: Phaser.GameObjects.Text, width: number, height: number) {
    const dx = (Math.random() - 0.5) * 160
    const dy = -60 - Math.random() * 220 // drift upward
    const duration = 14000 + Math.random() * 12000
    this.tweens.add({
      targets: t,
      x: t.x + dx,
      y: t.y + dy,
      rotation: t.rotation + (Math.random() - 0.5) * 0.6,
      duration,
      ease: 'Sine.InOut',
      onComplete: () => {
        // Wrap to bottom and continue drifting
        t.y = height + 60 + Math.random() * 80
        t.x = Math.random() * width
        t.setRotation((Math.random() - 0.5) * 0.5)
        this.driftPiece(t, width, height)
      },
    })
  }
}
