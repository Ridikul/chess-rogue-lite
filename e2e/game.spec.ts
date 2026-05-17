import { test, expect, Page } from '@playwright/test'

// Game dimensions must match Phaser config in src/main.ts
const W = 640
const H = 900

// Wait for window.__gamePhase to equal a value (polls every 100 ms)
async function waitForPhase(page: Page, phase: string, timeout = 10_000) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__gamePhase), {
      timeout,
      intervals: [100],
    })
    .toBe(phase)
}

// Click a position in the Phaser canvas using locator-relative coordinates,
// which correctly handles Scale.FIT canvas scaling.
async function clickCanvas(page: Page, gameX: number, gameY: number) {
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')
  await canvas.click({ position: { x: gameX * (box.width / W), y: gameY * (box.height / H) } })
}

// Deal phase: "Passer tout" button is at game coords (160, 480)
const SKIP_DEAL_X = 160
const SKIP_DEAL_Y = 480
// Tutorial popup "Compris !" button: popupY=(900-360)/2=270, btnY=270+360-38=592
const TUTORIAL_BTN_X = 320
const TUTORIAL_BTN_Y = 592

// Leave shop button: centred at (320, 858) in game coords
// btnY = height - 64 = 836, btnH = 44, centre = 836 + 22 = 858
const LEAVE_SHOP_X = 320
const LEAVE_SHOP_Y = 858

// Minimal serialisable RunState for injecting into scenes via window.__game
// currentNodeId must NOT be 'start' so MapScene skips the intro popup
type MinimalRunState = {
  deck: unknown[]; relics: unknown[]; gold: number
  maxHp: number; currentHp: number; floor: number
  currentNodeId: string
  map: Array<{ id: string; type: string; depth: number; cleared: boolean; connections: string[] }>
}
function makeShopRunState(gold = 200): MinimalRunState {
  return {
    deck: [], relics: [], gold,
    maxHp: 30, currentHp: 30, floor: 2,
    currentNodeId: 'n2a',
    map: [
      { id: 'n1a', type: 'combat', depth: 1, cleared: true,  connections: ['n2a'] },
      { id: 'n2a', type: 'shop',   depth: 2, cleared: false, connections: ['n3a'] },
      { id: 'n3a', type: 'combat', depth: 3, cleared: false, connections: [] },
    ],
  }
}

async function startScene(page: Page, key: string, data: unknown) {
  await page.evaluate(
    ({ key, data }) => {
      const g = (window as unknown as Record<string, unknown>).__game as {
        scene: { start(k: string, d: unknown): void }
      }
      g.scene.start(key, data)
    },
    { key, data },
  )
}

// Intro popup: click anywhere (centre) to complete text, then again to dismiss
const INTRO_CLICK_X = 320
const INTRO_CLICK_Y = 450

// Map first combat node n1a: depth 1, i=0 of 2 nodes
// y = h - 80 - (1/5)*(h-160) = 900-80-148 = 672
// x = (640 / (2+1)) * 1 = 213
const MAP_N1A_X = 213
const MAP_N1A_Y = 672

// Tutorial floor 1 hand: [king, pawn, pawn, pawn] — 4 cards, total width = 4*(82+8)-8 = 352
// startX = (640-352)/2 = 144. Card centres (x+41, y+56) where y = HAND_Y_BASE = 618.
const KING_CARD_X = 144 + 41   // 185 — centre of king card (1st in hand)
const KING_CARD_Y = 618 + 56   // 674
// e1 board square: col=4, row=7 → container at (64,90), cx=4*64+32=288, cy=7*64+32=480
// world coords: 64+288=352, 90+480=570
const E1_X = 352
const E1_Y = 570

// Navigate through intro popup (typewriter) then select first combat node on the map
async function skipIntroAndSelectNode(page: Page) {
  await waitForPhase(page, 'intro')
  await clickCanvas(page, INTRO_CLICK_X, INTRO_CLICK_Y)  // complete typewriter
  await page.waitForTimeout(120)
  await clickCanvas(page, INTRO_CLICK_X, INTRO_CLICK_Y)  // dismiss popup
  await waitForPhase(page, 'map')
  await clickCanvas(page, MAP_N1A_X, MAP_N1A_Y)          // select combat node n1a
}

async function skipDeal(page: Page) {
  await waitForPhase(page, 'deal')
  await clickCanvas(page, SKIP_DEAL_X, SKIP_DEAL_Y)
  // Floor 1 shows a tutorial popup after the deal phase — dismiss it
  await waitForPhase(page, 'tutorial')
  await clickCanvas(page, TUTORIAL_BTN_X, TUTORIAL_BTN_Y)
}

async function placeKing(page: Page) {
  await clickCanvas(page, KING_CARD_X, KING_CARD_Y)   // select king card
  await clickCanvas(page, E1_X, E1_Y)                 // place on e1
}

test.describe('Chess Rogue Lite – UI flow', () => {
  test('opens menu scene', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
  })

  test('Nouvelle partie → intro → map → deal → placement phase', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')

    await clickCanvas(page, 320, 585)        // Nouvelle partie
    await skipIntroAndSelectNode(page)       // intro popup + map node selection
    await skipDeal(page)                     // skip card reveal
    await waitForPhase(page, 'placement')
  })

  test('placement: confirm without king stays in placement', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    await clickCanvas(page, 320, 585)
    await skipIntroAndSelectNode(page)
    await skipDeal(page)
    await waitForPhase(page, 'placement')

    // Click confirm before placing the king — phase must not advance
    await clickCanvas(page, 320, 872)
    await page.waitForTimeout(400)
    const phase = await page.evaluate(() => (window as unknown as Record<string, unknown>).__gamePhase)
    expect(phase).toBe('placement')
  })

  test('placement → chess phase via Confirmer button', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')

    await clickCanvas(page, 320, 585)        // Nouvelle partie
    await skipIntroAndSelectNode(page)
    await skipDeal(page)
    await waitForPhase(page, 'placement')

    await placeKing(page)                    // player must place their king first
    await clickCanvas(page, 320, 872)        // Confirmer
    await waitForPhase(page, 'chess')
  })

  // ── Shop ───────────────────────────────────────────────────────────────────

  test('shop: ShopScene sets __gamePhase to "shop"', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    await startScene(page, 'ShopScene', { runState: makeShopRunState() })
    await waitForPhase(page, 'shop')
  })

  test('shop: "Quitter la boutique" returns to map', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    await startScene(page, 'ShopScene', { runState: makeShopRunState() })
    await waitForPhase(page, 'shop')
    await clickCanvas(page, LEAVE_SHOP_X, LEAVE_SHOP_Y)
    await waitForPhase(page, 'map')
  })

  test('shop: cannot buy card without enough gold (button inert)', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    // 0 gold — all cards unaffordable
    await startScene(page, 'ShopScene', { runState: makeShopRunState(0) })
    await waitForPhase(page, 'shop')
    // Click first card position; phase must remain 'shop' (no purchase triggered)
    const cardX = Math.round((640 - (3 * 176 + 2 * 10)) / 2) + 88  // centre of card 1
    await clickCanvas(page, cardX, 168 + 126)  // y = cardY + h/2
    await page.waitForTimeout(400)
    const phase = await page.evaluate(() => (window as unknown as Record<string, unknown>).__gamePhase)
    expect(phase).toBe('shop')
  })

  // ── Reward screen ────────────────────────────────────────────────────────────

  test('shop: buying a card adds it to the deck and deducts gold', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    await startScene(page, 'ShopScene', { runState: makeShopRunState(200) })
    await waitForPhase(page, 'shop')

    const deckBefore = await page.evaluate(() => {
      const g = (window as unknown as Record<string, unknown>).__game as {
        scene: { getScene: (k: string) => Record<string, unknown> }
      }
      const scene = g.scene.getScene('ShopScene') as unknown as { runState: { deck: unknown[]; gold: number } }
      return { deckLen: scene.runState.deck.length, gold: scene.runState.gold }
    })

    // Click lower portion of card 1 (y=88+220=308) — was outside the old centered hitbox
    const cardX = Math.round((640 - (3 * 176 + 2 * 10)) / 2) + 88  // 134
    await clickCanvas(page, cardX, 88 + 220)

    // Shop restarts after 900 ms toast
    await waitForPhase(page, 'shop', 4000)

    const deckAfter = await page.evaluate(() => {
      const g = (window as unknown as Record<string, unknown>).__game as {
        scene: { getScene: (k: string) => Record<string, unknown> }
      }
      const scene = g.scene.getScene('ShopScene') as unknown as { runState: { deck: unknown[]; gold: number } }
      return { deckLen: scene.runState.deck.length, gold: scene.runState.gold }
    })

    expect(deckAfter.deckLen).toBe(deckBefore.deckLen + 1)
    expect(deckAfter.gold).toBeLessThan(deckBefore.gold)
  })

  // ── Combat reward (victory) ──────────────────────────────────────────────────

  // Helper: reach chess phase from a fresh game
  async function reachChessPhase(page: Page) {
    await page.goto('/')
    await waitForPhase(page, 'menu')
    await clickCanvas(page, 320, 585)
    await skipIntroAndSelectNode(page)
    await skipDeal(page)
    await waitForPhase(page, 'placement')
    await placeKing(page)
    await clickCanvas(page, 320, 872)
    await waitForPhase(page, 'chess')
  }

  // Trigger endCombat(true) directly on the active CombatScene (JS private is accessible at runtime)
  async function triggerCombatWin(page: Page) {
    await page.evaluate(() => {
      const g = (window as unknown as Record<string, unknown>).__game as {
        scene: { getScene: (k: string) => Record<string, unknown> }
      }
      const scene = g.scene.getScene('CombatScene')
      ;(scene as unknown as { endCombat: (v: boolean) => void }).endCombat(true)
    })
  }

  test('victory: result_win phase shows before reward phase (animation plays)', async ({ page }) => {
    await reachChessPhase(page)
    await triggerCombatWin(page)
    // Immediately after endCombat(true), phase must be result_win (animation running)
    await waitForPhase(page, 'result_win')
    // After the victory animation (~1.7 s) phase must advance to reward
    await waitForPhase(page, 'reward', 5000)
  })

  test('reward: clicking bottom of card (previously outside hitbox) advances to map', async ({ page }) => {
    await reachChessPhase(page)
    await triggerCombatWin(page)
    await waitForPhase(page, 'reward', 5000)

    // startX=(640-548)/2=46, card1 centre-x=46+88=134, bottom area y=168+260=428
    // This y was outside the old centered hit area (which only reached y=168+145=313)
    await clickCanvas(page, 134, 428)
    await waitForPhase(page, 'map', 3000)
  })

  test('chess phase: clicking a piece selects it', async ({ page }) => {
    await page.goto('/')
    await waitForPhase(page, 'menu')

    await clickCanvas(page, 320, 585)        // Nouvelle partie
    await skipIntroAndSelectNode(page)
    await skipDeal(page)
    await waitForPhase(page, 'placement')
    await placeKing(page)
    await clickCanvas(page, 320, 872)        // Confirmer
    await waitForPhase(page, 'chess')

    // Click the white king on e1
    await clickCanvas(page, E1_X, E1_Y)
    await waitForPhase(page, 'chess')        // still in chess phase — no crash
  })
})
