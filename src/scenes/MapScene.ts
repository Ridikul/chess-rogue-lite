import Phaser from 'phaser'
import type { RunState, MapNode } from '../types/index'
import { advanceToNode, getCurrentNode } from '../systems/RunState'
import { FONT } from '../utils/style'

const NODE_ICONS: Record<string, string> = {
  combat: '⚔️',
  elite: '💀',
  boss: '👑',
  shop: '🛒',
  rest: '🔥',
  event: '❓',
}

const NODE_COLORS: Record<string, number> = {
  combat: 0xcc4444,
  elite: 0xaa2222,
  boss: 0xff8800,
  shop: 0x44aacc,
  rest: 0x44cc88,
  event: 0xccaa44,
}

const NODE_LABELS: Record<string, string> = {
  combat: 'Combat',
  elite: 'Élite',
  boss: 'Boss',
  shop: 'Boutique',
  rest: 'Repos',
  event: 'Événement',
}

const INTRO_MSG =
  'Tu ne sais plus qui tu es,\ntu es perdu dans un donjon humide...\n\nIl va bien falloir faire quelque chose.'

export class MapScene extends Phaser.Scene {
  private runState!: RunState

  constructor() {
    super({ key: 'MapScene' })
  }

  init(data: { runState: RunState }) {
    this.runState = data.runState
  }

  create() {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1a2e).setOrigin(0)

    if (this.runState.currentNodeId === 'start') {
      this.showIntroPopup(() => {
        ;(window as unknown as Record<string, unknown>).__gamePhase = 'map'
        this.renderMapTitle()
        this.renderMap()
      })
    } else {
      ;(window as unknown as Record<string, unknown>).__gamePhase = 'map'
      this.renderMapTitle()
      this.renderMap()
    }
  }

  private renderMapTitle() {
    this.add.text(this.scale.width / 2, 20, 'Carte du Donjon', {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0)
  }

  // ─── Intro typewriter popup ────────────────────────────────────────────────

  private showIntroPopup(onDone: () => void) {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'intro'
    const { width, height } = this.scale

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.97).setOrigin(0)

    // Atmospheric scanlines
    const vfx = this.add.graphics()
    vfx.lineStyle(1, 0x222244, 0.5)
    for (let y = 0; y < height; y += 18) {
      vfx.beginPath(); vfx.moveTo(0, y); vfx.lineTo(width, y); vfx.strokePath()
    }

    const textObj = this.add.text(width / 2, height * 0.38, '', {
      fontFamily: FONT, fontSize: '20px',
      color: '#c8c89a',
      fontStyle: 'italic',
      align: 'center',
      wordWrap: { width: width - 100 },
      lineSpacing: 14,
    }).setOrigin(0.5)

    const hint = this.add.text(width / 2, height * 0.72, '', {
      fontFamily: FONT, fontSize: '13px', color: '#44443a',
    }).setOrigin(0.5).setAlpha(0)

    let charIdx = 0
    let done = false

    const finishText = () => {
      timer.remove(false)
      charIdx = INTRO_MSG.length
      textObj.setText(INTRO_MSG)
      done = true
      hint.setAlpha(0).setText('[ Toucher pour continuer ]')
      this.tweens.add({ targets: hint, alpha: 1, duration: 700 })
    }

    const dismiss = () => {
      this.tweens.add({
        targets: [overlay, vfx, textObj, hint],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          overlay.destroy(); vfx.destroy(); textObj.destroy(); hint.destroy()
          onDone()
        },
      })
    }

    const timer = this.time.addEvent({
      delay: 42,
      repeat: INTRO_MSG.length,
      callback: () => {
        if (charIdx <= INTRO_MSG.length) {
          textObj.setText(INTRO_MSG.slice(0, charIdx))
          charIdx++
        }
        if (charIdx > INTRO_MSG.length && !done) {
          done = true
          hint.setAlpha(0).setText('[ Toucher pour continuer ]')
          this.tweens.add({ targets: hint, alpha: 1, duration: 700 })
        }
      },
    })

    const zone = this.add.zone(0, 0, width, height).setOrigin(0).setInteractive()
    zone.on('pointerdown', () => {
      if (!done) {
        finishText()
      } else {
        zone.destroy()
        dismiss()
      }
    })
  }

  // ─── Map rendering ─────────────────────────────────────────────────────────

  private renderMap() {
    const { map, currentNodeId } = this.runState

    const depthGroups = new Map<number, MapNode[]>()
    for (const node of map) {
      const arr = depthGroups.get(node.depth) ?? []
      arr.push(node)
      depthGroups.set(node.depth, arr)
    }

    const maxDepth = Math.max(...depthGroups.keys())
    const w = this.scale.width
    const h = this.scale.height

    const nodePositions = new Map<string, { x: number; y: number }>()

    for (const [depth, nodes] of depthGroups) {
      const y = h - 80 - (depth / maxDepth) * (h - 160)
      nodes.forEach((node, i) => {
        const x = (w / (nodes.length + 1)) * (i + 1)
        nodePositions.set(node.id, { x, y })
      })
    }

    // Draw connections (skip 'start' node — virtual spawn point)
    const g = this.add.graphics()
    for (const node of map) {
      if (node.id === 'start') continue
      const from = nodePositions.get(node.id)!
      for (const connId of node.connections) {
        const to = nodePositions.get(connId)!
        g.lineStyle(2, node.cleared ? 0x333355 : 0x555577, 1)
        g.beginPath()
        g.moveTo(from.x, from.y)
        g.lineTo(to.x, to.y)
        g.strokePath()
      }
    }

    const current = getCurrentNode(this.runState)
    const reachable = new Set(current.connections)

    for (const node of map) {
      if (node.id === 'start') continue

      const { x, y } = nodePositions.get(node.id)!
      const isCurrent = node.id === currentNodeId
      const isReachable = reachable.has(node.id)
      const isCleared = node.cleared

      const color = isCleared ? 0x333344 : NODE_COLORS[node.type] ?? 0x888888
      const radius = isReachable ? 32 : 26

      if (isReachable) {
        // Pulsing outer glow ring
        const glow = this.add.circle(x, y, 52, color, 0.28)
        this.tweens.add({
          targets: glow,
          scaleX: 1.55, scaleY: 1.55,
          alpha: 0,
          duration: 1200,
          repeat: -1,
          ease: 'Quad.Out',
        })
        // Static bright ring
        this.add.circle(x, y, radius + 6, 0x000000, 0).setStrokeStyle(2, 0xffdd00)
      }

      const circle = this.add.circle(x, y, radius, color)

      if (isCurrent) {
        circle.setStrokeStyle(3, 0xffffff)
      } else if (isReachable) {
        circle.setStrokeStyle(3, 0xffdd00)
        circle.setInteractive()
        circle.on('pointerover', () => circle.setFillStyle(blendColor(color, 0xffffff, 0.25)))
        circle.on('pointerout', () => circle.setFillStyle(color))
        circle.on('pointerdown', () => this.travelTo(node.id))
      }

      this.add.text(x, y, NODE_ICONS[node.type] ?? '?', {
        fontFamily: FONT, fontSize: isReachable ? '22px' : '18px',
      }).setOrigin(0.5)

      const labelColor = isReachable ? '#ffee55' : isCleared ? '#444455' : '#777788'
      this.add.text(x, y + radius + 8, NODE_LABELS[node.type] ?? node.type.toUpperCase(), {
        fontFamily: FONT, fontSize: '11px', color: labelColor, align: 'center',
        fontStyle: isReachable ? 'bold' : 'normal',
      }).setOrigin(0.5, 0)

      if (isReachable) {
        this.add.text(x, y + radius + 24, '▶ Sélectionner', {
          fontFamily: FONT, fontSize: '13px', color: '#ffaa00', align: 'center',
        }).setOrigin(0.5, 0)
      }
    }

    // HUD
    const floorLabel = this.runState.floor === 0 ? '—' : String(this.runState.floor)
    this.add.text(10, h - 24, `PV: ${this.runState.currentHp}/${this.runState.maxHp}  Or: ${this.runState.gold}  Étage: ${floorLabel}`, {
      fontFamily: FONT, fontSize: '13px', color: '#aaaaaa',
    })

    if (this.runState.relics.length > 0) {
      const ICONS: Record<string, string> = {
        iron_crown: '👑', gold_coin: '🪙', extra_card: '🃏',
        blood_chalice: '🏆', gamblers_dice: '🎲',
        philosophers_stone: '💎', death_mask: '💀',
      }
      let rx = w - 12
      for (let i = this.runState.relics.length - 1; i >= 0; i--) {
        const relic = this.runState.relics[i]
        this.add.circle(rx - 16, h - 22, 13, 0x3a2a1a).setStrokeStyle(1, 0xff8800)
        this.add.text(rx - 16, h - 22, ICONS[relic.id] ?? '✦', { fontFamily: FONT, fontSize: '13px' }).setOrigin(0.5)
        rx -= 32
      }
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  private travelTo(nodeId: string) {
    const newRun = advanceToNode(this.runState, nodeId)
    const node = newRun.map.find(n => n.id === nodeId)!

    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      this.scene.start('CombatScene', { runState: newRun })
    } else if (node.type === 'rest') {
      this.scene.start('RestScene', { runState: newRun })
    } else if (node.type === 'shop') {
      this.scene.start('ShopScene', { runState: newRun })
    } else {
      this.runState = newRun
      this.scene.restart({ runState: newRun })
    }
  }
}

function blendColor(base: number, overlay: number, alpha: number): number {
  const br = (base >> 16) & 0xff
  const bg = (base >> 8) & 0xff
  const bb = base & 0xff
  const or = (overlay >> 16) & 0xff
  const og = (overlay >> 8) & 0xff
  const ob = overlay & 0xff
  return (
    (Math.round(br + (or - br) * alpha) << 16) |
    (Math.round(bg + (og - bg) * alpha) << 8) |
    Math.round(bb + (ob - bb) * alpha)
  )
}
