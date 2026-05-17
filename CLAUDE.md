# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:3000 (Vite + HMR)
npm test           # run all tests once (Vitest)
npm run test:watch # watch mode
npm run build      # tsc + vite build
```

Run a single test file:
```bash
npx vitest run src/systems/ChessEngine.test.ts
```

Run tests matching a name pattern:
```bash
npx vitest run -t "upgradeBonus"
```

E2e tests (Playwright — requires dev server running):
```bash
npx playwright test
```

## Architecture

### Game loop

```
MenuScene → CombatScene → (victory) MapScene → CombatScene / ShopScene / RestScene → … → boss
                        → (defeat)  MenuScene
```

All scene transitions pass the full `RunState` object as `data`. Scenes never hold persistent state between runs — everything lives in `RunState`.

### Layer separation

| Layer | Location | Rule |
|---|---|---|
| Types & definitions | `src/types/` | Pure data, no Phaser, no side effects |
| Game logic | `src/systems/` | Pure functions or classes, no Phaser, fully unit-testable |
| Rendering & input | `src/scenes/` | Phaser scenes, no business logic |

**Never import Phaser in `src/types/` or `src/systems/`.** Tests only cover `src/systems/` and `src/types/`.

### Core data flow

`RunState` is the single source of truth for a run. It is **immutable by convention** — every system function returns a new object (`advanceToNode`, `healHp`, `rewardCombat`, etc.). The one exception is `ChessEngine.applyMove`, which mutates `runState.currentHp` in-place for `upgradeBonus.hpOnCapture` — intentional for simplicity.

### Deck system

The starter deck is `['basic_king', 'basic_pawn', 'basic_pawn', 'basic_pawn']` (defined in `STARTER_DECK_IDS`). It is **never shuffled** — cards are drawn in order. Each combat draws from the full deck (fresh draw, no carry-over of draw position between combats). Reward/shop cards are appended with `addCardToDeck` and will appear in subsequent combats.

### CombatScene phases

`Phase = 'draw' | 'deal' | 'placement' | 'chess' | 'result'`

| Phase | Description |
|---|---|
| `draw` | Internal setup — builds hand from deck, places enemy pieces |
| `deal` | Shows each card in hand one by one (animated) |
| `placement` | Player drags or clicks cards onto ranks 1–4 |
| `chess` | Standard chess with abilities; board tweens to fill screen |
| `result` | Victory (reward screen) or defeat (return to menu) |

`window.__gamePhase` is set at each transition for Playwright e2e tests.

### Board container & coordinates

The board lives in a Phaser `Container` (`boardContainer`) so the whole board (graphics + pieces + labels) can be tweened as a unit.

- **Placement phase**: container at `(BOARD_X=64, BOARD_Y=90)`, `scale=1`, cell=64px, board 512×512
- **Chess phase**: container tweens to `(CHESS_BOARD_X=16, CHESS_BOARD_Y=70)`, `scale=1.1875`, cell≈76px, board 608×608

All board rendering uses **local coordinates** (origin = board top-left). Click detection goes through `screenToBoard(gx, gy)` which accounts for the container transform.

### Input — placement phase

Two interaction modes coexist:
- **Tap**: mousedown on card selects it; next mousedown on a valid board square places it.
- **Drag & drop**: moving 10px+ after mousedown spawns a ghost piece emoji that follows the cursor. Releasing over a valid rank 1–4 square places the piece with the `animatePieceLanding` effect (bounce + impact ring).

Both touch and mouse are handled via native DOM events (not Phaser input) to support mobile/PWA.

### ChessEngine

Wraps `chess.js` and adds the ability/upgrade layer on top. Key points:

- `setupFromPlacement(pieces)` builds a FEN from `BoardPiece[]` and forces white to move first.
- `applyMove(from, to, runState)` returns a `MoveResult` with flags (`bonusTurn`, `penaltyApplied`, `thornsKill`, `upgradeHpGain`). Returns `null` on illegal moves.
- `getLegalMoves(square)` filters out `queen_of_thorns` squares for the king (capturing her would kill the king and break game state).
- The engine maintains `boardPieces: Map<Square, BoardPiece>` in sync with chess.js to store card metadata.
- `getBestMoveForEnemy()` runs negamax depth-2. `CombatScene` delays it 700ms to fake "thinking".

### Ability system

Abilities are defined on `CardDefinition` and copied onto `BoardPiece` during placement. `ChessEngine.applyMove` checks triggers inline:

- `on_capture` → fires on the moving piece after a capture (`ghost_knight` → `bonusTurn = true`)
- `on_captured` → fires on the captured piece (`martyr_pawn` → `penaltyApplied`, `queen_of_thorns` → `thornsKill`)
- `passive` / `on_turn_start` → declared but not yet dispatched; implement in `applyMove` or a new `startTurn()` method.

`Ability.effect()` is a no-op for all cards — real logic is the flag check by id. New abilities follow the same pattern.

### Card upgrade system

`CardInstance.upgraded = true` is set in `RestScene`. During placement, `CombatScene` copies `upgraded` and `upgradeBonus` onto `BoardPiece`. `ChessEngine` reads `piece.upgraded && piece.upgradeBonus?.hpOnCapture` to apply healing.

`UpgradeBonus.extraPlacementSlot` and `doubleMove` are defined in the type but not yet wired.

### Relic system

Relics live in `RunState.relics[]`. Effects are checked at call sites via `hasRelic(run, id)` — no central dispatcher. When adding a new relic effect:
1. Define in `src/types/relics.ts`
2. Check with `hasRelic()` at the relevant call site (`CombatScene.doPlayerMove` or `startDrawPhase`)
3. Add `onAcquire` if it modifies `RunState` at purchase time

Current relics: `iron_crown`, `gold_coin`, `extra_card`, `blood_chalice`, `gamblers_dice`, `philosophers_stone`, `death_mask`.

### Adding a new card

1. Add the definition to `CARD_DEFINITIONS` in `src/types/cards.ts` — include `upgradeBonus`
2. If the card has a new ability trigger id, add the flag check in `ChessEngine.applyMove`
3. Add the card id to `buildEnemyDeck` if it should appear in enemy decks

Current cards: `basic_king`, `basic_pawn`, `basic_rook`, `basic_knight`, `basic_bishop`, `ghost_knight`, `martyr_pawn`, `queen_of_thorns`, `lich_king`.

### Rarity labels (French)

Rarity values in code are `common | uncommon | rare | legendary`. Display via `rarityLabel()` from `src/utils/style.ts` → COMMUN / SPÉCIAL / RARE / LÉGENDAIRE.

### UI layout (640×900)

- HUD bar: `y=0–68` (HP left, gold right, status text centred)
- Board placement: `(64, 90)` → `(576, 602)`
- Hand: `y=HAND_Y_BASE` (≈642), cards `82×112px`
- Confirm button: centred, `y=900-28=872`
- Board labels: column letters below board, rank numbers at local `x=-5` in container

### Test coverage policy

Tests live next to the code they test (`*.test.ts`). Only `src/systems/` and `src/types/` are tested — Phaser scenes are excluded. The PostToolUse hook runs `npm test` automatically when any file in `src/systems/` or `src/types/` is edited.

When adding a new system feature, add tests for: the happy path, the non-triggering path, and any boundary (e.g. HP cap).
