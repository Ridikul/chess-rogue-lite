import Phaser from 'phaser'
import type { RunState, MapNode, NodeType } from '../types/index'
import { advanceToNode, getCurrentNode } from '../systems/RunState'
import { FONT } from '../utils/style'

interface NodeStyle {
  radius: number
  icon: string
  iconSize: string
  label: string
  description: string
  accent: number | null // optional inner-ring colour for elite/boss
}

// Single parchment palette — the icon does the work of differentiating types.
const NODE_BG = 0x3a2c1c
const NODE_BG_CLEARED = 0x261d12

const NODE_STYLE: Record<NodeType, NodeStyle> = {
  combat: {
    radius: 28, icon: '⚔️', iconSize: '22px',
    label: 'Combat', accent: null,
    description: 'Combat — affronte un adversaire standard.\nRécompense : or + 1 carte.',
  },
  elite: {
    radius: 34, icon: '💀', iconSize: '30px',
    label: 'ÉLITE', accent: 0xa04030,
    description: 'Combat d\'Élite — adversaire renforcé.\nRécompense supérieure + relique possible.',
  },
  boss: {
    radius: 42, icon: '👑', iconSize: '36px',
    label: 'BOSS', accent: 0xd4a850,
    description: 'BOSS — le gardien de l\'étage.\nVictoire ou mort.',
  },
  shop: {
    radius: 28, icon: '🛒', iconSize: '22px',
    label: 'Boutique', accent: null,
    description: 'Boutique — achète cartes, reliques et soins.',
  },
  rest: {
    radius: 28, icon: '🔥', iconSize: '22px',
    label: 'Repos', accent: null,
    description: 'Repos — soigne 30% des PV max\nou améliore une carte.',
  },
  event: {
    radius: 28, icon: '❓', iconSize: '22px',
    label: 'Événement', accent: null,
    description: 'Événement — choix narratif aux\nconséquences variables.',
  },
}

const INTRO_MSG =
  'Tu ne sais plus qui tu es,\ntu es perdu dans un donjon humide...\n\nIl va bien falloir faire quelque chose.'

export class MapScene extends Phaser.Scene {
  private runState!: RunState

  // Map layout
  private readonly BOTTOM_MARGIN = 60
  private readonly SPACING_Y = 130
  private readonly MIN_SCALE = 0.65
  private readonly MAX_SCALE = 1.5
  private readonly DRAG_THRESHOLD = 6

  private mapContainer!: Phaser.GameObjects.Container
  private mapScale = 1
  private mapMinY = -1000
  private mapMaxY = 0
  private nodePositions = new Map<string, { x: number; y: number; node: MapNode }>()
  private nodeRadii = new Map<string, number>()

  // Hover & input
  private hoveredId: string | null = null
  private tooltip?: Phaser.GameObjects.Container
  private dragging = false
  private candidateNodeId: string | null = null
  private downX = 0
  private downY = 0
  private lastY = 0
  private pinchPrevDist: number | null = null
  private wheelHandler?: (e: WheelEvent) => void

  // HUD
  private hudHpText!: Phaser.GameObjects.Text
  private hudGoldText!: Phaser.GameObjects.Text
  private hudFloorText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'MapScene' })
  }

  init(data: { runState: RunState }) {
    this.runState = data.runState
    // Reset transient state on scene restart
    this.nodePositions = new Map()
    this.nodeRadii = new Map()
    this.hoveredId = null
    this.tooltip = undefined
    this.dragging = false
    this.candidateNodeId = null
    this.pinchPrevDist = null
  }

  create() {
    // Warm parchment-dark background, like the chess board's frame palette
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x14100c).setOrigin(0).setDepth(0)
    const ambient = this.add.graphics().setDepth(1)
    for (let i = 0; i < 8; i++) {
      ambient.fillStyle(0x2a1e10, 0.12)
      ambient.fillRect(0, i * 8, this.scale.width, 8)
    }
    // Enable a second touch pointer for pinch-to-zoom on touch screens
    this.input.addPointer(1)
    // Clean up any leftover wheel listener from prior scene instances
    if (this.wheelHandler) {
      this.game.canvas.removeEventListener('wheel', this.wheelHandler)
      this.wheelHandler = undefined
    }

    if (this.runState.currentNodeId === 'start') {
      this.showIntroPopup(() => {
        ;(window as unknown as Record<string, unknown>).__gamePhase = 'map'
        this.setupMap()
      })
    } else {
      ;(window as unknown as Record<string, unknown>).__gamePhase = 'map'
      this.setupMap()
    }
  }

  // ─── Map setup ─────────────────────────────────────────────────────────────

  private setupMap() {
    this.computeLayout()
    this.mapContainer = this.add.container(0, 0).setDepth(10)
    this.drawPaths()
    this.drawNodes()
    this.computePanLimits()
    this.centerOnCurrentNode()
    this.renderTitle()
    this.renderHud()
    this.renderZoomControls()
    this.setupInput()
  }

  private computeLayout() {
    const map = this.runState.map
    const maxDepth = Math.max(...map.map(n => n.depth))
    const depthGroups = new Map<number, MapNode[]>()
    for (const node of map) {
      const arr = depthGroups.get(node.depth) ?? []
      arr.push(node)
      depthGroups.set(node.depth, arr)
    }
    const w = this.scale.width
    for (const [depth, nodes] of depthGroups) {
      const y = this.BOTTOM_MARGIN + (maxDepth - depth) * this.SPACING_Y
      nodes.forEach((node, i) => {
        const x = (w / (nodes.length + 1)) * (i + 1)
        this.nodePositions.set(node.id, { x, y, node })
      })
    }
  }

  private computePanLimits() {
    const map = this.runState.map
    const maxDepth = Math.max(...map.map(n => n.depth))
    const startLocalY = this.BOTTOM_MARGIN + maxDepth * this.SPACING_Y
    const bossLocalY = this.BOTTOM_MARGIN
    const h = this.scale.height
    // At min: start anchored near bottom of canvas
    this.mapMinY = (h - 60) - startLocalY * this.mapScale
    // At max: boss anchored near top of canvas (below HUD)
    this.mapMaxY = 60 - bossLocalY * this.mapScale
  }

  private centerOnCurrentNode() {
    const cur = getCurrentNode(this.runState)
    const pos = this.nodePositions.get(cur.id)
    if (!pos) return
    // Place current node 80% down the canvas so the player sees upcoming nodes above it
    const targetWorldY = this.scale.height - 80
    this.mapContainer.y = targetWorldY - pos.y * this.mapScale
    this.clampPan()
  }

  // ─── Paths ─────────────────────────────────────────────────────────────────

  private drawPaths() {
    const g = this.add.graphics()
    this.mapContainer.add(g)
    for (const node of this.runState.map) {
      const from = this.nodePositions.get(node.id)
      if (!from) continue
      for (const connId of node.connections) {
        const to = this.nodePositions.get(connId)
        if (!to) continue
        if (node.id === 'start') {
          // Short stub leading into the first-row nodes
          g.lineStyle(2, 0x6a4a30, 0.30)
          this.drawDashedSegment(g, to.x, to.y + 72, to.x, to.y + 18)
          continue
        }
        const cleared = node.cleared
        const color = cleared ? 0x4a3a26 : 0x7a5a3a
        const alpha = cleared ? 0.22 : 0.42
        this.drawCurvedPath(g, from.x, from.y, to.x, to.y, color, alpha)
      }
    }
  }

  private drawCurvedPath(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    color: number, alpha: number,
  ) {
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    const sway = (x2 - x1) * 0.22
    const ctrlX = midX + sway
    const ctrlY = midY

    const segments = 22
    const points: Array<[number, number]> = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2
      const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2
      points.push([px, py])
    }

    // Always dashed, thin, low alpha — paths recede behind the nodes.
    g.lineStyle(2, color, alpha)
    for (let i = 0; i < points.length - 1; i += 2) {
      g.beginPath()
      g.moveTo(points[i][0], points[i][1])
      g.lineTo(points[i + 1][0], points[i + 1][1])
      g.strokePath()
    }
  }

  private drawDashedSegment(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number) {
    const dashLen = 6
    const gapLen = 4
    const total = Math.hypot(x2 - x1, y2 - y1)
    const dx = (x2 - x1) / total
    const dy = (y2 - y1) / total
    let traveled = 0
    while (traveled < total) {
      const segEnd = Math.min(traveled + dashLen, total)
      g.beginPath()
      g.moveTo(x1 + dx * traveled, y1 + dy * traveled)
      g.lineTo(x1 + dx * segEnd, y1 + dy * segEnd)
      g.strokePath()
      traveled = segEnd + gapLen
    }
  }

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  private drawNodes() {
    const cur = getCurrentNode(this.runState)
    const reachable = new Set(cur.connections)

    for (const node of this.runState.map) {
      if (node.id === 'start') continue
      const pos = this.nodePositions.get(node.id)!
      const style = NODE_STYLE[node.type]
      const isCurrent = node.id === this.runState.currentNodeId
      const isReachable = reachable.has(node.id)
      const isCleared = node.cleared

      this.nodeRadii.set(node.id, style.radius)

      // Pulsing outer ring only for reachable and elite/boss
      if (isReachable || node.type === 'elite' || node.type === 'boss') {
        const ringColor = node.type === 'elite' ? 0xa04030
                       : node.type === 'boss'  ? 0xd4a850
                       : 0xc8a458
        const ring = this.add.circle(pos.x, pos.y, style.radius + 6, ringColor, 0.30)
        this.mapContainer.add(ring)
        this.tweens.add({
          targets: ring,
          scaleX: 1.55, scaleY: 1.55, alpha: 0,
          duration: 1500, repeat: -1, ease: 'Quad.Out',
        })
      }

      // Main circle — uniform parchment bg for every type, state-based border only
      const baseColor = isCleared ? NODE_BG_CLEARED : NODE_BG
      const borderColor = isCurrent ? 0xf4ddaa
                       : isReachable ? 0xd4a850
                       : isCleared ? 0x4a3a2c
                       : 0x7a6a4a
      const circle = this.add.circle(pos.x, pos.y, style.radius, baseColor)
        .setStrokeStyle(isReachable || isCurrent ? 3 : 2, borderColor, 1)
      this.mapContainer.add(circle)

      // Subtle warm accent ring on elite/boss only (helps spot them without screaming)
      if (style.accent !== null && !isCleared) {
        const inner = this.add.circle(pos.x, pos.y, style.radius - 4, 0, 0)
          .setStrokeStyle(1, style.accent, 0.55)
        this.mapContainer.add(inner)
      }

      // Icon
      const icon = this.add.text(pos.x, pos.y, style.icon, {
        fontFamily: FONT, fontSize: style.iconSize,
      }).setOrigin(0.5).setAlpha(isCleared ? 0.4 : 1)
      this.mapContainer.add(icon)

      // Label below — warm cream, slight accent only on elite/boss
      const labelColor = isCleared ? '#4a3a2c'
                      : node.type === 'elite' ? '#e89090'
                      : node.type === 'boss' ? '#f4dd80'
                      : isReachable ? '#f4dd80'
                      : '#a89878'
      const label = this.add.text(pos.x, pos.y + style.radius + 8, style.label, {
        fontFamily: FONT,
        fontSize: node.type === 'elite' || node.type === 'boss' ? '13px' : '11px',
        color: labelColor,
        fontStyle: isReachable || node.type === 'elite' || node.type === 'boss' ? 'bold' : 'normal',
        stroke: '#0a0805', strokeThickness: 2,
      }).setOrigin(0.5, 0)
      this.mapContainer.add(label)

      // "You are here" marker
      if (isCurrent) {
        const youAre = this.add.text(pos.x, pos.y - style.radius - 14, '▼ Vous êtes ici', {
          fontFamily: FONT, fontSize: '10px', color: '#f4ddaa', fontStyle: 'bold',
          stroke: '#0a0805', strokeThickness: 2,
        }).setOrigin(0.5, 1)
        this.mapContainer.add(youAre)
        this.tweens.add({
          targets: youAre, y: youAre.y - 4,
          duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
        })
      }
    }
  }

  // ─── Title & HUD ───────────────────────────────────────────────────────────

  private renderTitle() {
    this.add.rectangle(0, 0, this.scale.width, 50, 0x1c1208, 0.94).setOrigin(0).setDepth(900)
    this.add.rectangle(0, 50, this.scale.width, 1, 0x6a4030, 1).setOrigin(0).setDepth(901)
    this.add.text(this.scale.width / 2, 12, 'Carte du Donjon', {
      fontFamily: FONT, fontSize: '20px', color: '#e8d6a4', fontStyle: 'bold',
      stroke: '#0a0805', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(901)
  }

  private renderHud() {
    const w = this.scale.width
    const h = this.scale.height
    const barHeight = 44
    this.add.rectangle(0, h - barHeight, w, barHeight, 0x1c1208, 0.94).setOrigin(0).setDepth(900)
    this.add.rectangle(0, h - barHeight, w, 1, 0x6a4030, 1).setOrigin(0).setDepth(901)

    this.hudHpText = this.add.text(12, h - barHeight + 12, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ff7777', fontStyle: 'bold',
    }).setDepth(901)

    this.hudGoldText = this.add.text(w - 12, h - barHeight + 12, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(901)

    this.hudFloorText = this.add.text(w / 2, h - barHeight + 14, '', {
      fontFamily: FONT, fontSize: '14px', color: '#aab0c8', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(901)

    this.updateHud()
    this.renderRelicRow()
  }

  private updateHud() {
    this.hudHpText.setText(`❤️  ${this.runState.currentHp} / ${this.runState.maxHp}`)
    this.hudGoldText.setText(`${this.runState.gold} 🪙`)
    const totalDepth = Math.max(...this.runState.map.map(n => n.depth))
    const floorLabel = this.runState.floor === 0 ? '—' : `${this.runState.floor}`
    this.hudFloorText.setText(`Étage ${floorLabel} / ${totalDepth}`)
  }

  private renderRelicRow() {
    if (this.runState.relics.length === 0) return
    const ICONS: Record<string, string> = {
      iron_crown: '👑', gold_coin: '🪙', extra_card: '🃏',
      blood_chalice: '🏆', gamblers_dice: '🎲',
      philosophers_stone: '💎', death_mask: '💀',
    }
    const w = this.scale.width
    let rx = w - 100
    const ry = this.scale.height - 26
    for (let i = this.runState.relics.length - 1; i >= 0; i--) {
      const relic = this.runState.relics[i]
      this.add.circle(rx, ry, 13, 0x3a2a1a).setStrokeStyle(1, 0xff8800).setDepth(901)
      this.add.text(rx, ry, ICONS[relic.id] ?? '✦', {
        fontFamily: FONT, fontSize: '13px',
      }).setOrigin(0.5).setDepth(901)
      rx -= 32
    }
  }

  // ─── Zoom controls ─────────────────────────────────────────────────────────

  private renderZoomControls() {
    const w = this.scale.width
    const h = this.scale.height
    const bx = w - 36
    const by1 = h - 96
    const by2 = h - 60

    const make = (cx: number, cy: number, label: string, fn: () => void) => {
      const bg = this.add.circle(cx, cy, 16, 0x2c1d10).setStrokeStyle(1, 0x8a6a4a).setInteractive().setDepth(950)
      const txt = this.add.text(cx, cy, label, {
        fontFamily: FONT, fontSize: '20px', color: '#e8d6a4', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(951)
      bg.on('pointerover', () => bg.setFillStyle(0x3e2a18))
      bg.on('pointerout', () => bg.setFillStyle(0x2c1d10))
      bg.on('pointerup', fn)
      return [bg, txt]
    }
    make(bx, by1, '+', () => this.zoomBy(1.18))
    make(bx, by2, '−', () => this.zoomBy(1 / 1.18))
  }

  private zoomBy(factor: number, anchorY?: number) {
    const newScale = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, this.mapScale * factor))
    if (newScale === this.mapScale) return
    // Keep `anchorY` (cursor or canvas centre) at the same world position during zoom
    const focusY = anchorY ?? this.scale.height / 2
    const localY = (focusY - this.mapContainer.y) / this.mapScale
    this.mapScale = newScale
    this.mapContainer.setScale(newScale)
    this.mapContainer.y = focusY - localY * newScale
    this.computePanLimits()
    this.clampPan()
    if (this.hoveredId) this.refreshTooltip()
  }

  private clampPan() {
    if (this.mapMinY > this.mapMaxY) {
      // The map is shorter than the viewport — just centre it
      this.mapContainer.y = (this.mapMinY + this.mapMaxY) / 2
      return
    }
    if (this.mapContainer.y < this.mapMinY) this.mapContainer.y = this.mapMinY
    if (this.mapContainer.y > this.mapMaxY) this.mapContainer.y = this.mapMaxY
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput() {
    // A backing zone behind the nodes ensures pointermove fires consistently.
    const zone = this.add.zone(0, 0, this.scale.width, this.scale.height).setOrigin(0).setInteractive().setDepth(5)

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downX = p.x
      this.downY = p.y
      this.lastY = p.y
      this.dragging = false
      this.candidateNodeId = this.nodeAt(p.x, p.y)
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Two-finger pinch zoom on touch: takes precedence over pan
      const p1 = this.input.pointer1
      const p2 = this.input.pointer2
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
        if (this.pinchPrevDist !== null && Math.abs(d - this.pinchPrevDist) >= 1) {
          const factor = d / this.pinchPrevDist
          const cy = (p1.y + p2.y) / 2
          this.zoomBy(factor, cy)
        }
        this.pinchPrevDist = d
        this.dragging = true // suppress any tap-as-click
        this.hideTooltip()
        return
      }
      this.pinchPrevDist = null

      if (p.isDown) {
        const dx = p.x - this.downX
        const dy = p.y - this.downY
        if (!this.dragging && Math.hypot(dx, dy) >= this.DRAG_THRESHOLD) {
          this.dragging = true
          this.hideTooltip()
          this.hoveredId = null
        }
        if (this.dragging) {
          this.mapContainer.y += (p.y - this.lastY)
          this.clampPan()
          this.lastY = p.y
        }
      } else {
        this.updateHover(p.x, p.y)
      }
    })

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging && this.candidateNodeId) {
        const upId = this.nodeAt(p.x, p.y)
        if (upId === this.candidateNodeId) this.tryTravel(this.candidateNodeId)
      }
      this.candidateNodeId = null
      this.dragging = false
    })

    this.input.on('wheel', (
      p: Phaser.Input.Pointer,
      _go: Phaser.GameObjects.GameObject[],
      _dx: number,
      dy: number,
    ) => {
      // Mouse wheel = zoom centred on cursor
      const factor = dy < 0 ? 1.12 : 1 / 1.12
      this.zoomBy(factor, p.y)
    })

    // Suppress browser default scroll on canvas wheel — tracked for cleanup on scene restart
    this.wheelHandler = (e: WheelEvent) => e.preventDefault()
    this.game.canvas.addEventListener('wheel', this.wheelHandler, { passive: false })
    this.events.once('shutdown', () => {
      if (this.wheelHandler) {
        this.game.canvas.removeEventListener('wheel', this.wheelHandler)
        this.wheelHandler = undefined
      }
    })

    void zone
  }

  private nodeAt(screenX: number, screenY: number): string | null {
    // Convert to local coords inside mapContainer
    const lx = (screenX - this.mapContainer.x) / this.mapScale
    const ly = (screenY - this.mapContainer.y) / this.mapScale
    for (const [id, pos] of this.nodePositions) {
      if (id === 'start') continue
      const r = this.nodeRadii.get(id) ?? 28
      // Ensure at least 36px hit area on screen regardless of zoom level
      const hitR = Math.max(r + 4, 36 / this.mapScale)
      const dx = lx - pos.x
      const dy = ly - pos.y
      if (dx * dx + dy * dy <= hitR * hitR) return id
    }
    return null
  }

  private tryTravel(nodeId: string) {
    const cur = getCurrentNode(this.runState)
    if (!cur.connections.includes(nodeId)) return
    this.hideTooltip()
    this.travelTo(nodeId)
  }

  // ─── Hover / tooltip ───────────────────────────────────────────────────────

  private updateHover(x: number, y: number) {
    const id = this.nodeAt(x, y)
    if (id === this.hoveredId) {
      if (id) this.positionTooltip(x, y)
      return
    }
    this.hoveredId = id
    this.hideTooltip()
    if (id) this.showTooltip(id, x, y)
  }

  private showTooltip(nodeId: string, anchorX: number, anchorY: number) {
    const node = this.runState.map.find(n => n.id === nodeId)
    if (!node) return
    const style = NODE_STYLE[node.type]
    const titleColor = node.type === 'elite' ? '#e89090'
                    : node.type === 'boss' ? '#f4dd80'
                    : '#e8c89a'
    const borderColor = style.accent ?? 0x8a6a4a

    const padding = 10
    const titleStyle = { fontFamily: FONT, fontSize: '14px', color: titleColor, fontStyle: 'bold' as const }
    const bodyStyle = { fontFamily: FONT, fontSize: '12px', color: '#dec9a8' }

    const title = this.add.text(0, 0, style.label, titleStyle).setOrigin(0)
    const body = this.add.text(0, title.height + 4, style.description, bodyStyle).setOrigin(0)
    const w = Math.max(title.width, body.width) + padding * 2
    const h = title.height + body.height + 4 + padding * 2

    const bg = this.add.rectangle(0, 0, w, h, 0x1c1610, 0.97).setOrigin(0).setStrokeStyle(1, borderColor, 0.85)
    title.setPosition(padding, padding)
    body.setPosition(padding, padding + title.height + 4)

    this.tooltip = this.add.container(0, 0, [bg, title, body]).setDepth(2000).setAlpha(0)
    this.tweens.add({ targets: this.tooltip, alpha: 1, duration: 150 })
    this.positionTooltip(anchorX, anchorY)
  }

  private positionTooltip(anchorX: number, anchorY: number) {
    if (!this.tooltip) return
    const bg = this.tooltip.list[0] as Phaser.GameObjects.Rectangle
    const w = bg.width
    const h = bg.height
    let x = anchorX + 18
    let y = anchorY - h - 14
    if (x + w > this.scale.width - 4) x = anchorX - w - 18
    if (y < 56) y = anchorY + 18
    if (y + h > this.scale.height - 50) y = this.scale.height - 50 - h
    this.tooltip.setPosition(x, y)
  }

  private refreshTooltip() {
    if (!this.hoveredId) return
    const pos = this.nodePositions.get(this.hoveredId)
    if (!pos) return
    const sx = this.mapContainer.x + pos.x * this.mapScale
    const sy = this.mapContainer.y + pos.y * this.mapScale
    this.positionTooltip(sx, sy)
  }

  private hideTooltip() {
    this.tooltip?.destroy()
    this.tooltip = undefined
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

  // ─── Intro typewriter popup (kept from before) ─────────────────────────────

  private showIntroPopup(onDone: () => void) {
    ;(window as unknown as Record<string, unknown>).__gamePhase = 'intro'
    const { width, height } = this.scale
    const container = this.add.container(0, 0).setDepth(1000)
    let dismissing = false

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0)
    container.add(overlay)

    const torchGfx = this.add.graphics()
    torchGfx.fillStyle(0x4a2008, 0.18)
    torchGfx.fillRect(0, height - 220, width, 220)
    torchGfx.fillStyle(0x4a2008, 0.10)
    torchGfx.fillRect(0, height - 360, width, 140)
    container.add(torchGfx)

    const SILHOUETTES = [
      { x: 60,         y: 140,           piece: '♜', size: 180 },
      { x: width - 70, y: 200,           piece: '♞', size: 200 },
      { x: 80,         y: height - 200,  piece: '♟', size: 170 },
      { x: width - 80, y: height - 130,  piece: '♛', size: 220 },
    ]
    for (const s of SILHOUETTES) {
      const t = this.add.text(s.x, s.y, s.piece, {
        fontFamily: FONT, fontSize: `${s.size}px`, color: '#382c5e',
      }).setOrigin(0.5).setAlpha(0)
      container.add(t)
      this.tweens.add({ targets: t, alpha: 0.55, duration: 1800, delay: 200 + Math.random() * 600, ease: 'Sine.InOut' })
      this.tweens.add({
        targets: t, scaleX: 1.04, scaleY: 1.04,
        duration: 2800 + Math.random() * 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
    }

    const scanlinesGfx = this.add.graphics()
    scanlinesGfx.lineStyle(1, 0x202238, 0.55)
    for (let y = 0; y < height; y += 4) {
      scanlinesGfx.beginPath(); scanlinesGfx.moveTo(0, y); scanlinesGfx.lineTo(width, y); scanlinesGfx.strokePath()
    }
    container.add(scanlinesGfx)

    const scanline = this.add.rectangle(0, -20, width, 8, 0x4a7aa0, 0.22).setOrigin(0)
    container.add(scanline)
    const runScan = () => {
      if (dismissing) return
      scanline.y = -20
      this.tweens.add({
        targets: scanline, y: height + 20, duration: 5000, ease: 'Sine.In',
        onComplete: () => this.time.delayedCall(2200 + Math.random() * 2400, runScan),
      })
    }
    this.time.delayedCall(900, runScan)

    const vignette = this.add.graphics()
    vignette.fillStyle(0x000000, 0.55)
    vignette.fillRect(0, 0, width, 70)
    vignette.fillRect(0, height - 70, width, 70)
    vignette.fillRect(0, 0, 70, height)
    vignette.fillRect(width - 70, 0, 70, height)
    container.add(vignette)

    const drip = () => {
      if (dismissing) return
      const x = 40 + Math.random() * (width - 80)
      const fallY = height * (0.30 + Math.random() * 0.45)
      const drop = this.add.text(x, -10, '•', {
        fontFamily: FONT, fontSize: '20px', color: '#7aa8d8',
      }).setOrigin(0.5, 0).setAlpha(0.9)
      container.add(drop)
      this.tweens.add({
        targets: drop, y: fallY, scaleY: { from: 1, to: 3.0 }, alpha: { from: 0.9, to: 0 },
        duration: 950 + Math.random() * 350, ease: 'Quad.In',
        onComplete: () => {
          drop.destroy()
          if (dismissing) return
          const ring = this.add.circle(x, fallY, 3, 0x7aa8d8, 0).setStrokeStyle(2, 0x7aa8d8, 0.85)
          container.add(ring)
          this.tweens.add({
            targets: ring, scaleX: 5, scaleY: 2.5, alpha: 0, duration: 800, ease: 'Quad.Out',
            onComplete: () => ring.destroy(),
          })
        },
      })
      this.time.delayedCall(700 + Math.random() * 1600, drip)
    }
    this.time.delayedCall(500, drip)

    const textObj = this.add.text(width / 2, height * 0.40, '', {
      fontFamily: FONT, fontSize: '24px',
      color: '#e8e4c4',
      fontStyle: 'italic',
      align: 'center',
      wordWrap: { width: width - 100 },
      lineSpacing: 18,
      stroke: '#1a0d22', strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 0, color: '#5a78aa', blur: 12, stroke: true, fill: true },
    }).setOrigin(0.5)
    container.add(textObj)

    const hint = this.add.text(width / 2, height * 0.74, '', {
      fontFamily: FONT, fontSize: '14px', color: '#9a8a72', fontStyle: 'italic',
    }).setOrigin(0.5).setAlpha(0)
    container.add(hint)

    let charIdx = 0
    let done = false

    const showHint = () => {
      hint.setText('[ Toucher pour continuer ]').setAlpha(0)
      this.tweens.add({ targets: hint, alpha: 1, duration: 700 })
      this.tweens.add({
        targets: hint, alpha: { from: 1, to: 0.4 },
        duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 700,
      })
    }

    const finishText = () => {
      timer.remove(false)
      charIdx = INTRO_MSG.length
      textObj.setText(INTRO_MSG)
      if (!done) {
        done = true
        showHint()
      }
    }

    const dismiss = () => {
      dismissing = true
      this.tweens.add({
        targets: container, alpha: 0, duration: 600, ease: 'Quad.In',
        onComplete: () => {
          container.destroy()
          onDone()
        },
      })
    }

    const timer = this.time.addEvent({
      delay: 55,
      repeat: INTRO_MSG.length,
      callback: () => {
        if (charIdx <= INTRO_MSG.length) {
          textObj.setText(INTRO_MSG.slice(0, charIdx))
          charIdx++
        }
        if (charIdx > INTRO_MSG.length && !done) {
          done = true
          showHint()
        }
      },
    })

    const zone = this.add.zone(0, 0, width, height).setOrigin(0).setInteractive()
    container.add(zone)
    zone.on('pointerdown', () => {
      if (!done) {
        finishText()
      } else {
        zone.destroy()
        dismiss()
      }
    })
  }
}
