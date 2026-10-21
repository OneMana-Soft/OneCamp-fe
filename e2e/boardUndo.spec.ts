import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server shared by both people's browsers, so two people draw
// on the same board live. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Undo on a shared board (whiteboard programme W-0, row miro-01): a person's
// undo takes back their own steps, never a teammate's, and never what the
// board opened with. Excalidraw folds any scene change it isn't told to keep
// out of history into the next local step, so a remote change merged without
// `captureUpdate: NEVER` was undone with that step, and saved for everyone.
// On a computer with a mouse, and on a phone by touch (390 wide).

const BOARD = "b0a4d000-0000-4000-8000-000000000001"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit" }
// Ann's note, already on the board when it opens.
const NOTE = "ann-plan"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES

// Where each step draws, from the canvas's top left: clear of the board's
// chrome on each device (a phone's tools run along the top, its actions low).
const SPOTS = {
  computer: { sam1: [420, 260], ann1: [720, 260], sam2: [420, 520], noteMove: [160, 220] },
  phone: { sam1: [30, 400], ann1: [220, 400], sam2: [30, 520], noteMove: [0, 60] },
} as const

function theBoard() {
  const seed = ordered(note(NOTE, 100, 150, "Ann's plan"))
  return { uuid: BOARD, title: "Launch retro", levels: LEVELS, update: boardDoc(seed) }
}

interface Person {
  context: import("@playwright/test").BrowserContext
  page: Page
  touch: boolean
}

async function person(browser: Browser, who: "sam" | "ann", device: Device, board: ReturnType<typeof theBoard>, collab: ReturnType<typeof collabFor>): Promise<Person> {
  const context = await browser.newContext(DEVICES[device])
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
  await expect(page.locator('[data-testid="toolbar-rectangle"]')).toBeAttached({ timeout: 30_000 })
  // The canvas marks itself once the server's drawing is on it.
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 15_000 })
  return { context, page, touch: device === "phone" }
}

/** A point on the canvas, from its top left, in page pixels. */
async function at(page: Page, x: number, y: number) {
  const box = await page.locator(".excalidraw").first().boundingBox()
  if (!box) throw new Error("the canvas isn't on the page")
  return { x: box.x + x, y: box.y + y }
}

/** A press: a click with a mouse, a tap on a touch screen. */
async function press(who: Person, target: Locator) {
  if (who.touch) await target.tap()
  else await target.click()
}

/** A drag: the mouse's, or one finger's (Chromium's own touch input, so the page sees touch pointers). */
async function drag(who: Person, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!who.touch) {
    await who.page.mouse.move(from.x, from.y)
    await who.page.mouse.down()
    await who.page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
    await who.page.mouse.move(to.x, to.y, { steps: 4 })
    await who.page.mouse.up()
    return
  }
  // One finger, as a phone sends it (e2e/boardPhone.spec.ts): down, moved a
  // frame at a time, up.
  const cdp = await who.context.newCDPSession(who.page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) })
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t) })
    await who.page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

async function drawRectangle(who: Person, x: number, y: number) {
  // The tool's radio is hidden under its label, which takes the press.
  await press(who, who.page.locator('label:has([data-testid="toolbar-rectangle"])').first())
  await expect(who.page.locator('[data-testid="toolbar-rectangle"]').first()).toBeChecked()
  await drag(who, await at(who.page, x, y), await at(who.page, x + 120, y + 80))
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
  for (const device of ["computer", "phone"] as const) {
    const title = "takes back only your own steps: never a teammate's, never what the board opened with"
    test(device === "computer" ? title : `${title} (a phone, by touch)`, async ({ browser }) => {
      // Two people's production pages, each opening the app and the board.
      test.setTimeout(120_000)
      const spot = SPOTS[device]
      const annSpot = SPOTS.computer
      const board = theBoard()
      const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
      // On the phone run Sam, whose undo is under test, is on a phone and
      // Ann at a computer, as a team mixes them.
      const sam = await person(browser, "sam", device, board, collab)
      const ann = await person(browser, "ann", "computer", board, collab)

      // Sam draws, then Ann moves her note and draws, then Sam draws again.
      const sam1 = await added(collab, () => drawRectangle(sam, spot.sam1[0], spot.sam1[1]))
      const noteBefore = byId(collab, NOTE)!
      await drag(ann, await at(ann.page, 190, 240), await at(ann.page, 190 + annSpot.noteMove[0], 240 + annSpot.noteMove[1]))
      await expect.poll(() => [byId(collab, NOTE)!.x, byId(collab, NOTE)!.y], { timeout: 5_000 }).not.toEqual([noteBefore.x, noteBefore.y])
      const moved = byId(collab, NOTE)!
      // Both of Ann's changes reach Sam's screen before he draws again: the
      // canvas counts what the shared document changed on it.
      const merges = async () => Number((await sam.page.locator("[data-board-canvas]").getAttribute("data-board-remote")) ?? 0)
      const before = await merges()
      const ann1 = await added(collab, () => drawRectangle(ann, annSpot.ann1[0], annSpot.ann1[1]))
      await expect.poll(merges, { timeout: 5_000 }).toBeGreaterThan(before)
      await sam.page.waitForTimeout(200)
      const sam2 = await added(collab, () => drawRectangle(sam, spot.sam2[0], spot.sam2[1]))

      // Sam undoes until both his rectangles are gone.
      const undo = sam.page.locator('[data-testid="button-undo"]').first()
      for (let i = 0; i < 6 && (liveIds(collab).has(sam1) || liveIds(collab).has(sam2)); i++) {
        await press(sam, undo)
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
  }
})
