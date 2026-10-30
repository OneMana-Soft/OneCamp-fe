import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { expectToolsInLine } from "./boardTools"

// The board's hint line under its tools (Excalidraw's HintViewer) speaks to a
// keyboard and a mouse: "Press Enter to add text. Hold Ctrl and Arrow key…",
// "Click to start multiple points". On a touch phone there is neither, so it
// isn't drawn there (DESIGN-BUILD-24, 28 Oct: it read over a guest's board in
// a call). At a desk it stays. On a phone the tools are touch targets, More
// tools among them (DESIGN-BUILD-27).

const BOARD = "b0a4d000-0000-4000-8000-0000000000f7"
const NAME = boardDocName(BOARD)

function theBoard() {
  return { uuid: BOARD, title: "Launch plan", levels: { sam: "edit" }, update: boardDoc(ordered(note("plan", 60, 120, "Plan"))) }
}

async function open(browser: Browser, device: BrowserContextOptions) {
  const board = theBoard()
  const context = await browser.newContext(device)
  await context.addInitScript(() => {
    try {
      // The first-run tip about keys sits over the canvas's corner.
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* the tip then shows, and the test still reads the hint line */
    }
  })
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([{ id: NAME, update: board.update, levels: board.levels }]),
    fixtures: boardFixtures([board], USERS.sam, USERS.sam),
  })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-testid="toolbar-arrow"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

test("on a touch phone the board draws no keyboard hint when a tool is picked", async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  // The tool's radio is hidden under its label, which takes the tap.
  await page.locator('label:has([data-testid="toolbar-arrow"])').tap()
  // The hint line is drawn with the tool's pick, in the same render.
  await expect(page.locator('[data-testid="toolbar-arrow"]')).toBeChecked()
  await expect(page.locator(".excalidraw .HintViewer")).toBeHidden()
  await context.close()
})

test("at a desk the hint line stays: it says what the keys do", async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 860 } })
  await page.locator('label:has([data-testid="toolbar-arrow"])').click()
  await expect(page.locator(".excalidraw .HintViewer")).toBeVisible()
  await expect(page.locator(".excalidraw .HintViewer")).not.toHaveText("")
  await context.close()
})

test("on a touch phone More tools is a whole touch target on the tools' line", async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await expectToolsInLine(page.locator(".excalidraw"), true)
  await context.close()
})

test("at a desk More tools stays on the tools' line", async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 860 } })
  await expectToolsInLine(page.locator(".excalidraw"), false)
  await context.close()
})
