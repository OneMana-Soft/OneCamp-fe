import { expect, test, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { boxOf, overlap, type Box } from "./boxes"
import { finger } from "./finger"

// On a phone the board's own chrome keeps off Excalidraw's: its tool row along
// the top, its column of buttons down the right, and its footer. The board's
// cluster, the facilitation bar and a selection's bar (the notes bar, a frame's
// bar) sit low, above the footer, each clear of the others, as drawn at 390
// with touch. This was a test of the source's class names, which broke when
// the docks moved to one constant while the layout held (28 Oct).

const BOARD = "b0a4d000-0000-4000-8000-0000000000c4"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

/** Sam, an editor, opens a board with a note and a frame of one note, its camera at the board's origin. */
async function open(page: Page) {
  const inFrame = note("prompt", 60, 420, "Who does what?", { size: 120 })
  const actions = frame("actions", "Actions", inFrame.filter((e) => e.type === "rectangle"))
  for (const e of inFrame) e.frameId = "actions"
  const board = { uuid: BOARD, title: "Sprint retro", levels: LEVELS, update: boardDoc(ordered([...note("venue", 40, 140, "Book the venue"), actions, ...inFrame])) }
  await page.context().addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the note and the frame are then elsewhere, and the taps say so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(page.context(), {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]),
    fixtures: [...boardFixtures([board], USERS.sam, USERS.sam)],
  })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return canvas
}

/** No two of `boxes` share ground, each named in the failure. */
function expectApart(boxes: Record<string, Box>) {
  const names = Object.keys(boxes)
  for (const [i, a] of names.entries()) {
    for (const b of names.slice(i + 1)) expect(overlap(boxes[a], boxes[b]), `${a} covers ${b}: ${JSON.stringify(boxes)}`).toBeNull()
  }
}

test("on a phone the board's own bars keep off Excalidraw's tool row, its buttons and its footer, and off each other", async ({ page }) => {
  test.setTimeout(90_000)
  const canvas = await open(page)
  const theirs = {
    "tool row": await boxOf(page.locator(".App-toolbar--mobile")),
    "button column": await boxOf(page.locator(".mobile-misc-tools-container")),
  }
  const footer = await boxOf(page.locator(".App-bottom-bar > .Island"))
  const cluster = page.getByRole("toolbar", { name: "Board tools" })
  const ours = { cluster: await boxOf(cluster), facilitation: await boxOf(page.getByRole("toolbar", { name: "Facilitation" })) }
  // The cluster is 44px tall and each of its buttons a 36px target.
  expect(ours.cluster.height).toBeCloseTo(44, 0)
  for (const b of await cluster.getByRole("button").all()) expect(await boxOf(b)).toMatchObject({ width: 36, height: 36 })
  await page.screenshot({ path: test.info().outputPath("390-nothing-selected.png") })
  expectApart({ ...theirs, ...ours, footer })
  // The foot the board publishes for the app's toasts and notices (--mobile-drawer-h): the top of its highest bar.
  const H = page.viewportSize()!.height
  const published = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h")))
  const isFoot = async (top: number) => Math.abs((await published()) - (H - top)) <= 1
  await expect.poll(() => isFoot(Math.min(footer.y, ours.cluster.y, ours.facilitation.y))).toBe(true)

  // A note selected: the notes bar, one bar above the facilitation bar.
  await page.touchscreen.tap(canvas.x + 130, canvas.y + 230)
  const notesBar = await boxOf(page.locator("[data-notes-bar] [data-board-chrome]"))
  await page.screenshot({ path: test.info().outputPath("390-note-selected.png") })
  await expect.poll(() => isFoot(notesBar.y)).toBe(true)
  expectApart({ ...theirs, ...ours, footer, "notes bar": notesBar })

  // A frame selected, by its name: the frame's bar in the same place.
  await page.touchscreen.tap(canvas.x + 300, canvas.y + 230)
  await expect(page.locator("[data-notes-bar]")).toHaveCount(0)
  await page.touchscreen.tap(canvas.x + 70, canvas.y + 400)
  const frameBar = await boxOf(page.locator("[data-frame-bar] [data-board-chrome]"))
  await page.screenshot({ path: test.info().outputPath("390-frame-selected.png") })
  expectApart({ ...theirs, ...ours, footer, "frame bar": frameBar })
  // Every one of the board's bars sits above the footer.
  for (const [name, b] of Object.entries({ ...ours, "notes bar": notesBar, "frame bar": frameBar })) {
    expect(b.y + b.height, `${name} reaches into the footer`).toBeLessThanOrEqual(footer.y)
  }
})

test("on a phone the board's own bars fade while a finger draws on a board just opened, and come back when it lifts", async ({ page }) => {
  test.setTimeout(90_000)
  // The board's page draws a loading state first, so its wrapper comes after
  // the page's first render: what it watches has to start once it's there.
  const canvas = await open(page)
  const wrap = page.locator("[data-board-page]")
  await expect(wrap).not.toHaveAttribute("data-board-drawing")
  const f = await finger(page)
  await f.down(canvas.x + 300, canvas.y + 300)
  await expect(wrap).toHaveAttribute("data-board-drawing", "true")
  await f.move(canvas.x + 330, canvas.y + 340)
  await f.up()
  await expect(wrap).not.toHaveAttribute("data-board-drawing")
})
