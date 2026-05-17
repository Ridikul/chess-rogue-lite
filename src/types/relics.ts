import type { Relic } from './index'

export const RELIC_DEFINITIONS: Record<string, Relic> = {
  // ── Communs ──────────────────────────────────────────────────────────────
  iron_crown: {
    id: 'iron_crown',
    name: 'Couronne de Fer',
    description: '+5 PV max au début de chaque combat.',
    onAcquire: run => { run.maxHp += 5; run.currentHp = Math.min(run.currentHp + 5, run.maxHp) },
  },
  gold_coin: {
    id: 'gold_coin',
    name: 'Pièce Dorée',
    description: '+3 Or après chaque victoire.',
    // appliqué dans RunState.rewardCombat
  },
  extra_card: {
    id: 'extra_card',
    name: 'Main Généreuse',
    description: 'Obtiens 1 slot de placement supplémentaire.',
    // lu dans CombatScene : placementBudget
  },

  // ── Uncommons ─────────────────────────────────────────────────────────────
  blood_chalice: {
    id: 'blood_chalice',
    name: 'Calice de Sang',
    description: 'Récupère 2 PV chaque fois qu\'une de tes pièces capture.',
    // appliqué dans CombatScene via onCapture hook
  },
  gamblers_dice: {
    id: 'gamblers_dice',
    name: 'Dé du Joueur',
    description: '50% de chance de poser 1 pièce de plus en placement.',
    // lu dans CombatScene : placementBudget
  },

  // ── Rares ─────────────────────────────────────────────────────────────────
  philosophers_stone: {
    id: 'philosophers_stone',
    name: 'Pierre Philosophale',
    description: 'Toutes tes pièces valent +1 en évaluation (IA moins agressive contre elles).',
    // symbolique pour le proto
  },
  death_mask: {
    id: 'death_mask',
    name: 'Masque de la Mort',
    description: 'Le premier échec et mat du run est annulé (une seule fois).',
    // géré dans ChessEngine.tryUndying() si la relique est présente
  },
}

export const ALL_RELIC_IDS = Object.keys(RELIC_DEFINITIONS)
