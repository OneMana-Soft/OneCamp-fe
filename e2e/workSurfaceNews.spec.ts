import { expect, test, type Page } from "@playwright/test"

// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, shape } from "../scripts/fluidity/fakeBoard.mjs"

// NEWS NOBODY ASKED FOR NEVER COVERS A WORK SURFACE (V-385). OneCamp AI's daily
// note (components/ai/AgentNoteOnOpen) comes as a toast the first time someone
// opens OneCamp on a day. On a phone it sat over a board's lower canvas, where
// a finger meets the shapes, and took the taps meant for them (DESIGN-BUILD-96,
// miro-40 H1's LIVE look); on a computer it sat on the canvas's corner. A
// board's page and a call's stage mark themselves work surfaces
// (data-work-surface), and news waits while one is up (lib/ui/news): it shows
// on the next ordinary page. A toast that answers the person's own action
// never goes through it. Here a fresh session opens a board by its link, as
// the demo's visitor does, on a phone with touch and on a computer.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const NOTE = "OneCamp AI left you a note"

/** A fresh session (no note asked for today) opens the board; resolves once today's note is left. */
async function openBoard(page: Page) {
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The demo's corner card waits ninety seconds; turned down, as other walks seed it.
      localStorage.setItem("onecamp:demo-lead-dismissed", "1")
    } catch {
      /* the note is what this checks */
    }
  })
  const board = { uuid: BOARD, title: "Plans", levels: LEVELS, update: boardDoc([shape("box", "rectangle", 60, 160, 160, 100)]) }
  await fakeApp(page.context(), {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]),
    // The note's answer comes once the board is up, so a toast shown for it
    // (six seconds, with its action) is still up when the board is checked.
    delays: { "/ai/agent-note$": 4000 },
    fixtures: [
      ...boardFixtures([board], USERS.sam, USERS.sam),
      // OneCamp AI is on, and today's note is left: four things need Sam.
      [/\/config\/client$/, { msg: "ok", data: { features: { ai: true } } }],
      [/\/ai\/agent-note$/, { msg: "ok", data: { posted: true, bot_uuid: "b0a4d000-0000-4000-8000-0000000000a1", items: 4 } }],
    ],
  })
  const left = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/ai/agent-note"), { timeout: 60_000 })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await left
  // Shown, the note would be up within a frame or two of its answer.
  await page.waitForTimeout(800)
}

/** Where the toasts sit: the toaster's list, empty or not, keeps their floor. */
async function toastFloor(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector(".toast-viewport")!.getBoundingClientRect()
    return { left: list.left, right: list.right, bottom: list.bottom }
  })
}

/**
 * Leaves the board for the boards' list, inside the app (the note is held in
 * this tab): go() presses the device's way back. A phone has its back arrow,
 * which takes a board opened by its link up to the list (lib/navigation/back);
 * a computer has the board's "All boards".
 */
async function leaveTheBoard(page: Page, go: () => Promise<void>) {
  await go()
  await expect(page).toHaveURL(/\/app\/board\/?$/)
}

/**
 * The note as a toast: Radix also copies a new toast's words into a hidden
 * announcement for screen readers, so the words alone can match twice.
 */
const shownNote = (page: Page) => page.locator("[data-news]").getByText(NOTE)

test.describe("on a phone with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

  test("a fresh session opens a board: a tap on the lower canvas reaches the canvas, and the daily note waits for the next page", async ({ page }) => {
    await openBoard(page)
    // The middle of the spot a phone's toast takes: centred, just above its floor.
    const floor = await toastFloor(page)
    const at = { x: Math.round((floor.left + floor.right) / 2), y: Math.round(floor.bottom - 28) }
    await page.evaluate(() => {
      const w = window as unknown as { __canvasTapped?: boolean }
      w.__canvasTapped = false
      document.querySelector("canvas.interactive")!.addEventListener("pointerdown", () => (w.__canvasTapped = true), { once: true })
    })
    const met = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches("canvas.interactive") ?? false, at)
    await page.touchscreen.tap(at.x, at.y)
    const tapped = await page.evaluate(() => (window as unknown as { __canvasTapped?: boolean }).__canvasTapped === true)
    expect({ met, tapped }, `a tap on the lower canvas at (${at.x}, ${at.y}) reaches the canvas`).toEqual({ met: true, tapped: true })
    await expect(page.getByText(NOTE), "the note waits off the board").toHaveCount(0)

    await leaveTheBoard(page, () => page.getByRole("button", { name: "Back" }).tap())
    await expect(shownNote(page), "the note shows on the next page").toBeVisible({ timeout: 10_000 })
    await expect(page.locator("[data-news]").getByRole("button", { name: "Open" }), "with its way to the note").toBeVisible()
  })
})

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("a fresh session opens a board: the daily note waits off the canvas's corner, and shows on the next page", async ({ page }) => {
    await openBoard(page)
    await expect(page.getByText(NOTE), "the note waits off the board").toHaveCount(0)

    await leaveTheBoard(page, () => page.getByRole("link", { name: "All boards" }).click())
    await expect(shownNote(page), "the note shows on the next page").toBeVisible({ timeout: 10_000 })
  })
})
