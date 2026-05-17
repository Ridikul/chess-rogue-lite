import Phaser from 'phaser'
import type { PieceType } from '../types/index'

export const RARITY_COLOR: Record<string, number> = {
  common: 0x888888, uncommon: 0x4caf50, rare: 0x2196f3, legendary: 0xffc107,
}

export const PIECE_EMOJI: Record<PieceType, string> = {
  pawn: '♟', rook: '♜', knight: '♞', bishop: '♝', queen: '♛', king: '♚',
}

export function drawCardBorder(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
) {
  const arm = 14
  g.fillStyle(color, 0.07)
  g.fillRect(x + 2, y + 2, w - 4, h - 4)
  g.lineStyle(2, color, 0.9)
  g.strokeRect(x, y, w, h)
  g.lineStyle(1, color, 0.5)
  g.strokeRect(x + 5, y + 5, w - 10, h - 10)
  g.lineStyle(3, color, 1)
  const brackets: [number, number, number, number][] = [
    [x,     y,      1,  1],
    [x + w, y,     -1,  1],
    [x,     y + h,  1, -1],
    [x + w, y + h, -1, -1],
  ]
  for (const [bx, by, dx, dy] of brackets) {
    g.beginPath()
    g.moveTo(bx + dx * arm, by)
    g.lineTo(bx, by)
    g.lineTo(bx, by + dy * arm)
    g.strokePath()
  }
}
