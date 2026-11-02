import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { displayNameOf } from "../lib/personName"
import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { inkAndGround } from "./contrast"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, shape } from "../scripts/fluidity/fakeBoard.mjs"

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

// A share link's guest is brought and held (miro-21; main 17:3x), never a trigger: Ann, an editor, presents and her
// view takes the guest along, fitted to its screen; holding keeps the guest there (a move of its own comes back, and
// there is no Stop); Bring everyone here moves the guest once, and its toast's Go back returns it.

const BLUE = { r: 0x2f, g: 0x6b, b: 0xff }
const LIVE_LEVELS = { ann: "edit", sam: "edit", guest: "view" }

/** Whether the middle of what this screen's board shows is the big blue square (Excalidraw's own drawing, read before a dark theme's filter). */
const blueInMiddle = (page: Page) =>
  page.evaluate((blue) => {
    const c = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.static")
    if (!c) return false
    const [r, g, b] = c.getContext("2d")!.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data
    return Math.abs(r - blue.r) < 8 && Math.abs(g - blue.g) < 8 && Math.abs(b - blue.b) < 8
  }, BLUE)

/** Scroll the board on this screen, as a wheel or a trackpad does. */
async function scrollBoard(page: Page, dy: number) {
  const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, dy)
}

/** How tall a control is drawn, and whether a press 21px above and below its middle lands on it (a 44px target does). */
const reachOf = (control: Locator) =>
  control.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const lands = (y: number) => !!document.elementFromPoint(x, y)?.closest("button")?.isSameNode(el)
    return { height: r.height, reached: [lands(r.top + r.height / 2 - 21), lands(r.top + r.height / 2 + 21)] }
  })

/** A board with a small note at the origin and a big blue square far off, on one collaboration server for Ann and the guest. */
function liveBoard() {
  const update = boardDoc([...note("n1", 0, 0, "Agenda"), shape("big", "rectangle", 3000, 2000, 900, 900, { fill: "#2F6BFF" })])
  return { update, collab: collabFor([{ id: NAME, update, levels: LIVE_LEVELS }]) }
}

/** Ann on a computer, looking at the middle of the blue square. */
type Member = (typeof USERS)[keyof typeof USERS]

/** A member opens the live board on a computer, looking at the blue square. */
async function openMember(browser: Browser, live: ReturnType<typeof liveBoard>, who: Member, other: Member) {
  const context = await browser.newContext(DEVICES.computer)
  await context.addInitScript(
    ([key, cam]) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(key, cam)
      } catch {
        /* the camera is then the drawing's, and the test says so */
      }
    },
    [`onecamp:board:viewport:${BOARD}`, JSON.stringify({ scrollX: -2850, scrollY: -2070, zoom: 1 })] as const,
  )
  const board = { uuid: BOARD, title: "Kickoff", levels: LIVE_LEVELS, update: live.update }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: who, docs: [], collab: live.collab, fixtures: [...boardFixtures([board], who, other)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  expect(await blueInMiddle(page), `${displayNameOf(who)} looks at the blue square`).toBe(true)
  return { context, page, bar: page.getByRole("toolbar", { name: "Facilitation" }) }
}

const openAnn = (browser: Browser, live: ReturnType<typeof liveBoard>) => openMember(browser, live, USERS.ann, USERS.sam)

/** The guest opens the share link on `use`'s screen. */
async function openGuest(browser: Browser, use: BrowserContextOptions, live: ReturnType<typeof liveBoard>) {
  const context = await browser.newContext(use)
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Kickoff", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: live.collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`)
  await expect(page.locator('[data-guest-board][data-board-elements="3"]')).toBeAttached({ timeout: 30_000 })
  return { context, page, frame: page.locator("[data-following]") }
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a share link's guest on a ${device} is taken to a presenter's view, held there, and brought once with a way back`, async ({ browser }) => {
    test.setTimeout(150_000)
    const ANN = displayNameOf(USERS.ann)
    const live = liveBoard()
    const ann = await openAnn(browser, live)
    const guest = await openGuest(browser, use, live)
    await expect.poll(() => blueInMiddle(guest.page), { message: "the guest first sees the whole drawing" }).toBe(false)

    // Ann presents: the guest is taken to her view, fitted to its screen, and told so.
    await ann.bar.getByRole("button", { name: "Present", exact: true }).click()
    await expect(guest.frame.getByText(`Following ${ANN}`, { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => blueInMiddle(guest.page), { timeout: 10_000, message: "the guest shows the middle of Ann's view" }).toBe(true)

    // The frame under a finger (V-293): a phone has no Esc key, so no Esc chip, and Stop takes a 44px touch while the
    // pill keeps its size; a computer keeps the key, and a Stop the size it is drawn.
    const touch = device === "phone"
    await expect(guest.frame.getByText("Esc", { exact: true })).toBeVisible({ visible: !touch })
    const stop = await reachOf(guest.frame.getByRole("button", { name: "Stop", exact: true }))
    expect(stop.height, "the pill keeps its size").toBeLessThan(28)
    expect(stop.reached, touch ? "a finger 21px above or below Stop's middle presses Stop" : "a pointer off Stop is off it").toEqual([touch, touch])

    // Ann holds everyone: the guest has no Stop, and a move of its own comes back to her view.
    await ann.bar.getByRole("button", { name: "Hold everyone", exact: true }).click()
    await expect(guest.frame.getByText("· held", { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(guest.frame.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
    await scrollBoard(guest.page, 1500)
    await expect.poll(() => blueInMiddle(guest.page), { timeout: 10_000, message: "a held guest comes back to Ann's view" }).toBe(true)
    // No Bring while she presents (V-286): the guest is on the board, but a bring would pull her followers two ways.
    await expect(ann.bar.getByRole("button", { name: "Bring everyone here" }), "no Bring while Ann presents").toHaveCount(0)

    // Ann stops presenting: the guest is free, and looks elsewhere.
    await ann.bar.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(guest.frame).toHaveCount(0, { timeout: 10_000 })
    await scrollBoard(guest.page, 1500)
    await expect.poll(() => blueInMiddle(guest.page), { timeout: 10_000, message: "a free guest stays where it moved" }).toBe(false)

    // Ann, alone on the board with the guest, brings everyone to her view from the facilitation bar (V-286): the list
    // of who's here shows members only (a link's guest neither shows nor sees any), so it has no Bring for her. The
    // guest is brought once, told who did it, and Go back returns it.
    await expect(ann.page.locator("[data-presence-stack]"), "no member but Ann is here").toHaveCount(0)
    await ann.bar.getByRole("button", { name: "Bring everyone here" }).click()
    const toast = guest.page.locator(".toast-root").filter({ hasText: `${ANN} brought everyone here` })
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => blueInMiddle(guest.page), { timeout: 10_000, message: "the guest is brought to Ann's view" }).toBe(true)
    await toast.getByRole("button", { name: "Go back" }).click()
    await expect.poll(() => blueInMiddle(guest.page), { timeout: 10_000, message: "Go back returns the guest" }).toBe(false)
    await guest.context.close()
    await ann.context.close()
  })
}
