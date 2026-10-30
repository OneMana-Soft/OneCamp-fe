import { expect, test, type BrowserContextOptions } from "@playwright/test"
import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { inkAndGround } from "./contrast"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, note, shape } from "../scripts/fluidity/fakeBoard.mjs"

// A board shared by link opens for a guest (whiteboard W-1): the page's frame
// and the board's name at once, then the canvas, which loads after it as the
// member's board does, with everything on the board. The canvas follows the
// viewer's theme as the page's frame does (it was forced light inside a dark
// page): its zoom reads at AA, and a phone shows no empty bar at its foot.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f2"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-kickoff"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

for (const [device, use] of Object.entries(DEVICES)) for (const theme of ["light", "dark"] as const) {
  test(`a shared board opens for a guest, on a ${device}, in the viewer's ${theme} theme`, async ({ browser }) => {
    test.setTimeout(90_000)
    const update = boardDoc([...note("n1", 0, 0, "Ship the pricing page"), ...note("n2", 220, 0, "Load test"), shape("s1", "ellipse", 0, 240)])
    const collab = collabFor([{ id: NAME, update, levels: { guest: "view" } }])
    // No theme chosen on this device: the page follows the system's.
    const context = await browser.newContext({ ...use, colorScheme: theme })
    const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Kickoff", workspace_name: "Acme" }
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
    // The canvas's code loads after the page's frame (its chunk, asked for once
    // the share's answer is in): held here, so its place shows until let go.
    let holding = false
    let letGo = () => {}
    const heldUntil = new Promise<void>((done) => (letGo = done))
    await context.route(/\/_next\/static\/chunks\//, async (route) => {
      if (holding) await heldUntil
      await route.fallback()
    })
    await context.route(new RegExp(`/guest/collab/${TOKEN}$`), async (route) => {
      holding = true
      await route.fallback()
    })
    const page = await context.newPage()
    await page.goto(`/guest/b/${TOKEN}`)
    await expect(page.getByText("Kickoff").first()).toBeVisible({ timeout: 30_000 })
    // While it loads: the canvas's own place and ground, edge to edge, saying so in words.
    const pending = page.locator("[data-canvas-pending]")
    await expect(pending).toBeVisible({ timeout: 30_000 })
    await expect(pending.getByRole("status")).toHaveText("Opening the board…")
    const waitingBox = (await pending.boundingBox())!
    const waiting = (await inkAndGround(page, pending)).ground
    letGo()
    await expect(page.locator('[data-guest-board][data-board-elements="5"]')).toBeAttached({ timeout: 30_000 })
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible()
    // The board arrives in the place and the colour it was held in.
    const board = page.locator("[data-guest-board]")
    const boardBox = (await board.boundingBox())!
    for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(waitingBox[k] - boardBox[k]), `the place's ${k}`).toBeLessThanOrEqual(1)
    const drawn = (await inkAndGround(page, board)).ground
    for (const k of ["r", "g", "b"] as const) expect(Math.abs(waiting[k] - drawn[k]), `the ground's ${k}: ${rgbToHex(waiting)} held, ${rgbToHex(drawn)} drawn`).toBeLessThanOrEqual(3)
    const canvas = page.locator("[data-guest-board] .excalidraw").first()
    if (theme === "dark") await expect(canvas).toHaveClass(/\btheme--dark\b/)
    else await expect(canvas).not.toHaveClass(/\btheme--dark\b/)
    if (device === "computer") {
      const zoom = page.locator("[data-guest-board] .reset-zoom-button").first()
      await expect(zoom).toBeVisible()
      const { ink, ground } = await inkAndGround(page, zoom)
      expect(contrastRatio(ink, ground), `the zoom's ${await zoom.textContent()}: ${rgbToHex(ink)} on ${rgbToHex(ground)}`).toBeGreaterThanOrEqual(4.5)
    } else {
      await expect(page.locator("[data-guest-board] .App-bottom-bar")).toBeHidden()
    }
    await context.close()
  })
}
