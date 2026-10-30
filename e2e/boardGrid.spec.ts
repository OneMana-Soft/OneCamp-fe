import { expect, test, type Browser } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server shared by everyone's browser. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// A board's grid is the board's (whiteboard W-1, miro-02 1): turned on by
// someone who can edit it, it is on for everyone on the board, and it is still
// on for whoever opens the board next. Someone who can only view it sees it,
// and can't turn it off. Snapping to shapes (miro-02 3) is each person's own,
// on until they turn it off.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit", vic: "view" }

function theBoard(drawing = ordered(note("n1", 100, 150, "Ship it"))) {
  return { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(drawing) }
}

async function person(browser: Browser, who: "sam" | "ann" | "vic", board: ReturnType<typeof theBoard>, collab: ReturnType<typeof collabFor>) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await context.addInitScript((camera: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so a point on the board is that far from the canvas's corner.
      localStorage.setItem(camera, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the tip then sits over the canvas's corner, and the drag below misses: the test says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS[who], docs: [], collab, fixtures: boardFixtures([board], USERS[who], USERS.sam) })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** The More menu's "Show grid", as it says it is. */
async function gridItem(page: Awaited<ReturnType<typeof person>>["page"]) {
  await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
  return page.getByRole("menuitemcheckbox", { name: "Show grid" })
}

test("a board's grid is on for everyone on it, and for whoever opens it next", async ({ browser }) => {
  test.setTimeout(120_000)
  const board = theBoard()
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const sam = await person(browser, "sam", board, collab)
  const ann = await person(browser, "ann", board, collab)

  const samGrid = await gridItem(sam.page)
  await expect(samGrid).toHaveAttribute("aria-checked", "false")
  await samGrid.click()
  await expect.poll(() => collab.doc(NAME).getMap("boardMeta").get("grid"), { timeout: 5_000 }).toBe(true)

  await expect(await gridItem(ann.page)).toHaveAttribute("aria-checked", "true", { timeout: 5_000 })
  await ann.page.keyboard.press("Escape")

  // Vic, who can only view the board, opens it now: the grid is on, and his can't be turned off.
  const vic = await person(browser, "vic", board, collab)
  const vicGrid = await gridItem(vic.page)
  await expect(vicGrid).toHaveAttribute("aria-checked", "true", { timeout: 5_000 })
  await expect(vicGrid).toHaveAttribute("aria-disabled", "true")

  await sam.context.close()
  await ann.context.close()
  await vic.context.close()
})

test("a note dragged near another lines up with it while snapping is on, and Snap to shapes turns that off and stays off", async ({ browser }) => {
  test.setTimeout(120_000)
  // Two notes side by side, the second 8 px lower than the first.
  const board = theBoard(ordered([...note("n1", 100, 150, "Ship it"), ...note("n2", 400, 158, "Then this")]))
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const sam = await person(browser, "sam", board, collab)
  const top = () => (collab.doc(NAME).getMap("elements").get("n2") as { y: number }).y
  const drag = async (fromY: number, dy: number) => {
    const box = await sam.page.locator(".excalidraw").first().boundingBox()
    if (!box) throw new Error("the canvas isn't on the page")
    // The note's left part, clear of its words.
    await sam.page.mouse.move(box.x + 420, box.y + fromY + 20)
    await sam.page.mouse.down()
    await sam.page.mouse.move(box.x + 430, box.y + fromY + 20 + dy, { steps: 6 })
    await sam.page.mouse.up()
  }

  // Snapping is on: moved 1 px up, the note lines up with its neighbour's top.
  await gridItem(sam.page)
  await expect(sam.page.getByRole("menuitemcheckbox", { name: "Snap to shapes" })).toHaveAttribute("aria-checked", "true")
  await sam.page.keyboard.press("Escape")
  await drag(158, -1)
  await expect.poll(top, { timeout: 5_000 }).toBe(150)

  // Turned off, the same kind of nudge lands where it was let go, and it stays off after a reload.
  await gridItem(sam.page)
  await sam.page.getByRole("menuitemcheckbox", { name: "Snap to shapes" }).click()
  await drag(150, 5)
  await expect.poll(top, { timeout: 5_000 }).toBe(155)
  await sam.page.reload()
  await expect(sam.page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await gridItem(sam.page)
  await expect(sam.page.getByRole("menuitemcheckbox", { name: "Snap to shapes" })).toHaveAttribute("aria-checked", "false")
  await sam.page.keyboard.press("Escape")

  // Someone who can only view the board moves nothing, so has no such switch.
  const vic = await person(browser, "vic", board, collab)
  await gridItem(vic.page)
  await expect(vic.page.getByRole("menuitemcheckbox", { name: "Show grid" })).toBeVisible()
  await expect(vic.page.getByRole("menuitemcheckbox", { name: "Snap to shapes" })).toHaveCount(0)

  await sam.context.close()
  await vic.context.close()
})
