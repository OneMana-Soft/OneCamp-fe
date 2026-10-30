import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server shared by both people's browsers, so two people draw
// on the same board live. Nothing leaves the machine.
import { USERS, collabFor, dropCollabSocket, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { settled } from "./sheetLayout"
import { boxOf, overlap, statusesUnder } from "./boxes"

// Undo on a shared board (whiteboard programme W-0, row miro-01): a person's
// undo takes back their own steps, never a teammate's, and never what the
// board opened with. Excalidraw folds any scene change it isn't told to keep
// out of history into the next local step, so a remote change merged without
// `captureUpdate: NEVER` was undone with that step, and saved for everyone.

const BOARD = "b0a4d000-0000-4000-8000-000000000001"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit" }
// Ann's note, already on the board when it opens.
const NOTE = "ann-plan"

function theBoard() {
  const seed = ordered(note(NOTE, 100, 150, "Ann's plan"))
  return { uuid: BOARD, title: "Launch retro", levels: LEVELS, update: boardDoc(seed) }
}

const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 860 } }
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

async function person(browser: Browser, who: "sam" | "ann", board: ReturnType<typeof theBoard>, collab: ReturnType<typeof collabFor>, use = COMPUTER) {
  const context = await browser.newContext(use)
  // Everyone opens on the same camera: the scene's origin at the canvas's top left, at 100%.
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      // The first-run tip about keys sits over the canvas's corner.
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the test then fails on positions, saying so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS[who],
    docs: [],
    collab,
    fixtures: boardFixtures([board], USERS[who], USERS.sam),
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  if (!use.isMobile) await expect(page.locator('[data-testid="toolbar-rectangle"]')).toBeVisible({ timeout: 30_000 })
  // A phone's board chrome draws no save dot: its board is ready once synced.
  if (use.isMobile) await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  else await expect(page.locator('[data-board-page] [data-save-state="saved"]').first()).toBeVisible({ timeout: 15_000 })
  return { context, page }
}

/** A point on the canvas, from its top left, in page pixels. */
async function at(page: Page, x: number, y: number) {
  const box = await page.locator(".excalidraw").first().boundingBox()
  if (!box) throw new Error("the canvas isn't on the page")
  return { x: box.x + x, y: box.y + y }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

async function drawRectangle(page: Page, x: number, y: number) {
  // The tool's radio is hidden under its label, which takes the click.
  await page.locator('label:has([data-testid="toolbar-rectangle"])').click()
  await expect(page.locator('[data-testid="toolbar-rectangle"]')).toBeChecked()
  await drag(page, await at(page, x, y), await at(page, x + 120, y + 80))
}

type Shared = { id: string; type: string; x: number; y: number; isDeleted?: boolean; version: number }
const elements = (collab: ReturnType<typeof collabFor>) => Array.from(collab.doc(NAME).getMap("elements").values()) as Shared[]
const liveIds = (collab: ReturnType<typeof collabFor>) => new Set(elements(collab).filter((e) => !e.isDeleted).map((e) => e.id))
const byId = (collab: ReturnType<typeof collabFor>, id: string) => elements(collab).find((e) => e.id === id)

/** Runs a step and returns the one element it added to the shared board. */
async function added(collab: ReturnType<typeof collabFor>, step: () => Promise<void>) {
  const before = liveIds(collab)
  await step()
  let id = ""
  await expect
    .poll(() => {
      id = [...liveIds(collab)].find((x) => !before.has(x)) ?? ""
      return id
    }, { timeout: 5_000 })
    .not.toBe("")
  return id
}

test.describe("undo on a shared board", () => {
  test("takes back only your own steps: never a teammate's, never what the board opened with", async ({ browser }) => {
    // Two people's production pages, each opening the app and the board.
    test.setTimeout(120_000)
    const board = theBoard()
    const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
    const sam = await person(browser, "sam", board, collab)
    const ann = await person(browser, "ann", board, collab)

    // Sam draws, then Ann moves her note and draws, then Sam draws again.
    const sam1 = await added(collab, () => drawRectangle(sam.page, 420, 260))
    const noteBefore = byId(collab, NOTE)!
    await drag(ann.page, await at(ann.page, 190, 240), await at(ann.page, 190 + 160, 240 + 220))
    await expect.poll(() => byId(collab, NOTE)!.x, { timeout: 5_000 }).not.toBe(noteBefore.x)
    const moved = byId(collab, NOTE)!
    const ann1 = await added(collab, () => drawRectangle(ann.page, 720, 260))
    // Both of Ann's changes have reached Sam's screen before he draws again.
    await sam.page.waitForTimeout(500)
    const sam2 = await added(collab, () => drawRectangle(sam.page, 420, 520))

    // Sam undoes until both his rectangles are gone.
    const undo = sam.page.locator('[data-testid="button-undo"]')
    for (let i = 0; i < 6 && (liveIds(collab).has(sam1) || liveIds(collab).has(sam2)); i++) {
      await undo.click()
      await sam.page.waitForTimeout(300)
    }
    expect(liveIds(collab).has(sam2), "Sam's last rectangle is undone").toBe(false)
    expect(liveIds(collab).has(sam1), "Sam's first rectangle is undone").toBe(false)
    // Settle: anything the undo wrote has reached the server.
    await sam.page.waitForTimeout(800)

    // Ann's work is untouched, for everyone: her rectangle, and her note where she left it.
    // Soft, so a failure lists everything the undo took.
    const live = liveIds(collab)
    expect.soft(live.has(ann1), "Ann's rectangle survives Sam's undo").toBe(true)
    expect.soft(live.has(NOTE), "the note the board opened with survives Sam's undo").toBe(true)
    expect.soft(live.has(`${NOTE}-label`), "the note's words survive Sam's undo").toBe(true)
    const now = byId(collab, NOTE)!
    expect.soft({ x: now.x, y: now.y }, "Ann's note stays where she moved it").toEqual({ x: moved.x, y: moved.y })
    // And on Ann's own screen: her board isn't empty.
    await expect.soft(ann.page.locator("[data-empty-canvas]"), "Ann's board still has her work on it").toHaveCount(0)

    await sam.context.close()
    await ann.context.close()
  })
})

// The save dot, as a doc's (V-21): the board's live connection dropping while the device is online reads
// "reconnecting"; the device going offline reads "offline", whatever the socket does after it; each says saved
// again once it's back.
// At 1280 only: the phone's board chrome shows no save dot (asked of DESIGN-BUILD-28, 28 Oct).
for (const [device, use] of [["computer", COMPUTER]] as const) {
  test(`a board's save dot says reconnecting while only its live connection is down, then saved (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const board = theBoard()
    const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
    const sam = await person(browser, "sam", board, collab, use)
    const state = sam.page.locator("[data-board-page] [data-save-state]").first()
    dropCollabSocket(sam.context, true)
    await expect(state).toHaveAttribute("data-save-state", "reconnecting", { timeout: 15_000 })
    dropCollabSocket(sam.context, false)
    await expect(state).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 })
    await sam.context.close()
  })

  test(`a board's save dot says offline while the device is, then saved (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const board = theBoard()
    const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
    const sam = await person(browser, "sam", board, collab, use)
    const state = sam.page.locator("[data-board-page] [data-save-state]").first()
    // The network goes, and the live connection with it: offline, never reconnecting.
    await sam.context.setOffline(true)
    dropCollabSocket(sam.context, true)
    await expect(state).toHaveAttribute("data-save-state", "offline", { timeout: 15_000 })
    // The offline chip says the app's shared words (CHANGES_KEPT), as a doc's pill does (V-55).
    await expect(sam.page.locator("[data-board-page]").getByRole("status").getByText("Offline. Changes are kept and will sync", { exact: true })).toBeVisible({ timeout: 15_000 })
    // Held while the network is down, whatever the socket tries.
    await sam.page.waitForTimeout(3_000)
    await expect(state).toHaveAttribute("data-save-state", "offline")
    await sam.context.setOffline(false)
    dropCollabSocket(sam.context, false)
    await expect(state).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 })
    await sam.context.close()
  })
}

// On a phone the board draws no save dot, so the app's notice says what it would, as a doc's does (V-45, V-21's
// DocSaveNotice): a change made offline waits, and once the board is back it is saved to the live board.
test("on a phone, a board's change made offline is said to wait, then to be saved (phone)", async ({ browser }) => {
  test.setTimeout(120_000)
  const board = theBoard()
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const sam = await person(browser, "sam", board, collab, PHONE)
  await sam.context.setOffline(true)
  dropCollabSocket(sam.context, true)
  await sam.page.getByRole("toolbar", { name: "Board tools" }).getByRole("button", { name: "Add a note" }).tap()
  // Each reading is checked once the notice has come to rest, so its shot shows it whole.
  const notice = sam.page.locator(".toast-root")
  const waits = notice.getByText("Offline. Changes are kept and will sync", { exact: true })
  await waits.waitFor({ timeout: 15_000 })
  await settled(waits)
  await expect(waits).toBeVisible()
  // Above the board's foot: its footer (undo, redo, the palette, delete) and every bar docked over it, never on them.
  const clearOfFoot = async () => {
    const card = await boxOf(notice.locator(".toast-card").first())
    const foot = [sam.page.locator(".App-bottom-bar > .Island"), ...(await sam.page.locator("[data-phone-foot]").all())]
    for (const b of await Promise.all(foot.map(boxOf))) expect(overlap(card, b), JSON.stringify(b)).toBeNull()
  }
  await clearOfFoot()
  // The notice says what the app's connection pill would, in its place: offline, the pill is there and steps
  // aside while the notice shows, so no second status sits under it (DESIGN-BUILD-29 M1).
  const pill = sam.page.locator('[data-connection-pill="offline"]')
  await expect(pill).toBeAttached()
  await expect(pill).toBeHidden()
  expect(await statusesUnder(notice.locator(".toast-card").first())).toEqual([])
  await sam.context.setOffline(false)
  dropCollabSocket(sam.context, false)
  const saved = notice.getByText("Saved to the live board")
  await saved.waitFor({ timeout: 30_000 })
  await settled(saved)
  await expect(saved).toBeVisible()
  await clearOfFoot()
  // The note reached everyone's board.
  await expect.poll(() => [...collab.doc(NAME).getMap("elements").values()].length, { timeout: 10_000 }).toBeGreaterThan(2)
  await sam.context.close()
})
