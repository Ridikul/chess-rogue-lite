// ─── Chess primitives ───────────────────────────────────────────────────────

export type PieceColor = 'white' | 'black'
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king'
export type Square = string // e.g. "e4"

// ─── Ability system ─────────────────────────────────────────────────────────

export type AbilityTrigger =
  | 'on_move'       // après chaque déplacement de cette pièce
  | 'on_capture'    // quand cette pièce capture
  | 'on_captured'   // quand cette pièce est capturée
  | 'passive'       // modifie les règles en permanence
  | 'on_turn_start' // début de tour du joueur

export interface AbilityContext {
  from: Square
  to: Square
  capturedPiece?: PieceType
  board: BoardState
}

export interface Ability {
  id: string
  name: string
  description: string
  trigger: AbilityTrigger
  effect: (ctx: AbilityContext, runState: RunState) => void
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export interface UpgradeBonus {
  description: string         // affiché dans l'UI
  hpOnCapture?: number        // PV récupérés quand cette pièce capture
  extraPlacementSlot?: boolean // donne +1 slot de placement au déploiement
  doubleMove?: boolean        // peut se déplacer deux fois par tour (non implémenté en chess phase, géré via bonusTurn)
}

export interface CardDefinition {
  id: string
  name: string
  pieceType: PieceType
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  ability?: Ability
  upgradeBonus?: UpgradeBonus // bonus octroyé quand la carte est améliorée
  flavorText?: string
}

export interface CardInstance {
  instanceId: string
  definition: CardDefinition
  upgraded: boolean
}

// ─── Board ──────────────────────────────────────────────────────────────────

export interface BoardPiece {
  type: PieceType
  color: PieceColor
  square: Square
  cardInstanceId: string | null
  ability?: Ability
  upgradeBonus?: UpgradeBonus
  upgraded?: boolean
  rarity?: CardDefinition['rarity']
}

export type BoardState = Map<Square, BoardPiece>

// ─── Relic ──────────────────────────────────────────────────────────────────

export interface Relic {
  id: string
  name: string
  description: string
  onAcquire?: (runState: RunState) => void
  passive?: (runState: RunState) => void
}

// ─── Run & Map ───────────────────────────────────────────────────────────────

export type NodeType = 'combat' | 'elite' | 'boss' | 'shop' | 'rest' | 'event'

export interface MapNode {
  id: string
  type: NodeType
  depth: number
  cleared: boolean
  connections: string[] // ids des nœuds suivants
}

export interface RunState {
  deck: CardInstance[]
  relics: Relic[]
  gold: number
  maxHp: number
  currentHp: number
  map: MapNode[]
  currentNodeId: string
  floor: number
}

// ─── Combat ──────────────────────────────────────────────────────────────────

export type CombatPhase = 'draw' | 'placement' | 'chess' | 'resolution'

export interface CombatState {
  phase: CombatPhase
  playerHand: CardInstance[]
  playerDeck: CardInstance[]
  playerDiscard: CardInstance[]
  enemyHand: CardInstance[]
  enemyDeck: CardInstance[]
  board: BoardState
  turn: PieceColor
  moveCount: number
  maxHandSize: number
  placementBudget: number // nb de cartes posables cette rencontre
}
