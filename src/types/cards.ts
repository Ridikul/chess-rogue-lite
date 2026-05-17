import type { CardDefinition } from './index'

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  // ── Communs ─────────────────────────────────────────────────────────────
  basic_pawn: {
    id: 'basic_pawn',
    name: 'Pion',
    pieceType: 'pawn',
    rarity: 'common',
    upgradeBonus: {
      description: '+2 PV à chaque capture',
      hpOnCapture: 2,
    },
    flavorText: 'Avance, sans jamais reculer.',
  },
  basic_rook: {
    id: 'basic_rook',
    name: 'Tour',
    pieceType: 'rook',
    rarity: 'common',
    upgradeBonus: {
      description: '+3 PV à chaque capture',
      hpOnCapture: 3,
    },
    flavorText: 'Les lignes droites sont les plus courtes.',
  },
  basic_knight: {
    id: 'basic_knight',
    name: 'Cavalier',
    pieceType: 'knight',
    rarity: 'common',
    upgradeBonus: {
      description: '+2 PV à chaque capture',
      hpOnCapture: 2,
    },
    flavorText: "Il saute là où personne ne l'attend.",
  },
  basic_bishop: {
    id: 'basic_bishop',
    name: 'Fou',
    pieceType: 'bishop',
    rarity: 'common',
    upgradeBonus: {
      description: '+2 PV à chaque capture',
      hpOnCapture: 2,
    },
    flavorText: 'Toujours sur la même couleur.',
  },

  // ── Uncommons ────────────────────────────────────────────────────────────
  ghost_knight: {
    id: 'ghost_knight',
    name: 'Cavalier Fantôme',
    pieceType: 'knight',
    rarity: 'uncommon',
    ability: {
      id: 'phase_through',
      name: 'Traversée',
      description: 'Après une capture, rejoue immédiatement.',
      trigger: 'on_capture',
      effect: (_ctx, _run) => {},
    },
    upgradeBonus: {
      description: '+3 PV à chaque capture en plus du coup bonus',
      hpOnCapture: 3,
    },
    flavorText: 'Sa monture ne touche jamais le sol.',
  },
  martyr_pawn: {
    id: 'martyr_pawn',
    name: 'Pion Martyr',
    pieceType: 'pawn',
    rarity: 'uncommon',
    ability: {
      id: 'martyrdom',
      name: 'Martyr',
      description: 'Quand ce pion est capturé, blesse la pièce adverse (-1 mouvement ce tour).',
      trigger: 'on_captured',
      effect: (_ctx, _run) => {},
    },
    upgradeBonus: {
      description: '+2 PV quand ce pion capture avant de mourir',
      hpOnCapture: 2,
    },
    flavorText: "Sa mort n'est jamais gratuite.",
  },

  // ── Rares ───────────────────────────────────────────────────────────────
  queen_of_thorns: {
    id: 'queen_of_thorns',
    name: 'Reine des Épines',
    pieceType: 'queen',
    rarity: 'rare',
    ability: {
      id: 'thorns',
      name: 'Épines',
      description: 'Toute pièce ennemie qui capture la Reine est immédiatement retirée du jeu.',
      trigger: 'on_captured',
      effect: (_ctx, _run) => {},
    },
    upgradeBonus: {
      description: '+4 PV à chaque capture',
      hpOnCapture: 4,
    },
    flavorText: 'La toucher, c\'est mourir.',
  },

  // ── Roi (pièce obligatoire, hors deck) ──────────────────────────────────
  basic_king: {
    id: 'basic_king',
    name: 'Roi',
    pieceType: 'king',
    rarity: 'common',
    upgradeBonus: {
      description: '+1 slot de placement',
      extraPlacementSlot: true,
    },
    flavorText: 'Sa survie est votre victoire.',
  },

  // ── Légendaire ───────────────────────────────────────────────────────────
  lich_king: {
    id: 'lich_king',
    name: 'Roi Liche',
    pieceType: 'king',
    rarity: 'legendary',
    ability: {
      id: 'undying',
      name: 'Immortel',
      description: 'Une fois par combat, si le Roi est mis en échec et mat, survive avec 1 PV.',
      trigger: 'passive',
      effect: (_ctx, _run) => {},
    },
    upgradeBonus: {
      description: "L'Immortalité s'active deux fois par run au lieu d'une",
    },
    flavorText: "La mort est un concept qu'il a depuis longtemps dépassé.",
  },
}

export const STARTER_DECK_IDS: string[] = [
  'basic_king',
  'basic_pawn',
  'basic_pawn',
  'basic_pawn',
]
