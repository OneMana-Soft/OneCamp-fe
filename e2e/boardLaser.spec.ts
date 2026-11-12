import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp, setOfflineKeepingSocket } from "../scripts/fluidity/fakeApp.mjs"
import { MSG, readFrame } from "../scripts/fluidity/fakeCollab.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { INK_SEND_MS, LASER_MS } from "../lib/calls/ink"
import { finger } from "./finger"

// A laser everyone on a board sees (miro-28, miro-10): Sam takes Excalidraw's laser from the tool row (on a phone,
// its More tools, and draws with a finger) and Vic, who only views, sees the trail where Sam points, in Sam's
// colour, on Excalidraw's own trail for a collaborator: the short tail Sam sees of his own, decaying from its end
// while held and gone once he lets go, however long he holds it. A fast drag goes out at most once every
// INK_SEND_MS. It never sticks: Sam silently off the network mid-stroke, or leaving mid-stroke, takes the trail off
// Vic's board. A share link's guest sees the laser too, with no one's cursor or name on their board, in the markup
// too. A viewer who asked for reduced motion sees the laser's pointer, a still dot where it points, and no moving
// trail. At 1280 and at 390 with touch, light and dark (SHOTS_DIR: shots).

const BOARD = "b0a4d000-0000-4000-8000-0000000000f9"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-laser"
const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES

function shareBoard() {
  const levels: Record<string, string> = { sam: "edit", vic: "view", guest: "view" }
  const [card, label] = note("n-plan", 120, 120, "Ship the laser")
  const board = { uuid: BOARD, title: "Launch plan", levels, update: boardDoc(ordered([card, label])) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

/** The held lasers in an awareness frame a tab received: one for each state whose laser is down. */
function heldIn(bytes: Uint8Array): number {
  const m = readFrame(bytes) as { type: number; payload?: Uint8Array }
  if (m.type !== MSG.awareness || !m.payload) return 0
  const b = m.payload
  let i = 0
  const uint = () => {
    let n = 0
    for (let s = 1; ; s *= 128) {
      const x = b[i++]
      n += (x & 0x7f) * s
      if (x < 0x80) return n
    }
  }
  let held = 0
  for (let n = uint(); n > 0; n--) {
    uint()
    uint()
    const len = uint()
    const state = JSON.parse(new TextDecoder().decode(b.subarray(i, (i += len)))) as { pointer?: { tool?: string } | null; button?: string } | null
    if (state?.pointer?.tool === "laser" && state.button === "down") held++
  }
  return held
}

async function open(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, user: typeof USERS.sam, theme: string, heard?: (bytes: Uint8Array) => void, more?: BrowserContextOptions) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark", ...more })
  await context.addInitScript(
    (key: string) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      } catch {
        /* the camera starts elsewhere: the trail is still where Sam points */
      }
    },
    `onecamp:board:viewport:${BOARD}`,
  )
  // What this tab's socket hears from the collaboration server, as it goes past.
  const collab = heard ? { ...on.collab, connect: (send: (b: Uint8Array) => void, close: () => void) => on.collab.connect((b: Uint8Array) => (heard(b), send(b)), close) } : on.collab
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: [...boardFixtures([on.board], user, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** A share link's guest on the board: read-only, publishing nothing of their own. */
async function openGuest(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, theme: string) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Launch plan", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`)
  await expect(page.locator('[data-guest-board][data-board-elements="2"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** Sam takes the laser from the tool row's More tools (a phone's row scrolls to it); his pointer, a finger on a phone. */
async function takeLaser(page: Page, phone: boolean) {
  const more = page.locator(".App-toolbar__extra-tools-trigger").first()
  await more.scrollIntoViewIfNeeded()
  await (phone ? more.tap() : more.click())
  const item = page.locator('[data-testid="toolbar-laser"]').first()
  await (phone ? item.tap() : item.click())
  const box = (await page.locator(".excalidraw").first().boundingBox())!
  const f = phone ? await finger(page) : null
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    down: (x: number, y: number) => (f ? f.down(x, y) : page.mouse.move(x, y).then(() => page.mouse.down())),
    move: (x: number, y: number) => (f ? f.move(x, y) : page.mouse.move(x, y)),
    up: () => (f ? f.up() : page.mouse.up()),
  }
}

/** Someone else's laser trail on a board: Excalidraw's own, on its trail layer. */
const TRAIL = ".excalidraw .SVGLayer path"

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`a laser on a board is seen by everyone on it, in its person's colour, and never sticks (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(240_000)
      const phone = device === "phone"
      const on = shareBoard()
      const heard: number[] = []
      const vic = await open(browser, device, on, USERS.vic, theme, (b) => {
        if (heldIn(b)) heard.push(Date.now())
      })
      const sam = await open(browser, device, on, USERS.sam, theme)

      const { cx, cy, down, move, up } = await takeLaser(sam.page, phone)

      // No one lasering: nothing drawn on Vic's board.
      const trail = vic.page.locator(TRAIL)
      await expect(trail).toHaveCount(0)

      // Sam lasers: Vic sees the trail where Sam points, in Sam's colour (his cursor's on Vic's board).
      await down(cx - 80, cy)
      for (let i = 1; i <= 8; i++) await move(cx - 80 + i * 12, cy + (i % 2 ? 10 : -10))
      await expect(trail).toHaveCount(1, { timeout: 10_000 })
      const fill = await vic.page.locator("[data-cursor] path").first().getAttribute("fill")
      expect(fill).toBeTruthy()
      await expect(trail).toHaveAttribute("fill", fill!)
      await shot(vic.page, "laser-seen", theme)
      await shot(sam.page, "laser-drawn", theme)
      if (phone) {
        // GUARD (no behaviour change): the board hides Excalidraw's main menu (excalidrawTheme.css), whose phone
        // layout would list the lasers as "Collaborators" with no one in it; mid-laser there's no way in, and no list.
        await expect(vic.page.locator(".excalidraw .main-menu-trigger").filter({ visible: true })).toHaveCount(0)
        await expect(vic.page.getByText("Collaborators", { exact: true }).filter({ visible: true })).toHaveCount(0)
        await shot(vic.page, "laser-no-menu", theme)
      }

      // A fast drag doesn't flood the board's awareness: at most one update every INK_SEND_MS reaches Vic.
      heard.length = 0
      const from = Date.now()
      for (let i = 0; i < 60; i++) await move(cx + 16 - i * 2, cy + 30 + (i % 3) * 4)
      const took = Date.now() - from
      await vic.page.waitForTimeout(INK_SEND_MS * 3)
      const during = heard.filter((at) => at <= from + took + INK_SEND_MS * 2)
      expect(during.length, `updates in a ${took} ms drag of 60 moves`).toBeGreaterThan(0)
      expect(during.length, `updates in a ${took} ms drag of 60 moves`).toBeLessThanOrEqual(Math.ceil(took / INK_SEND_MS) + 2)

      // Let go: what's left of the trail decays from its tail, as Sam's own does, then goes.
      const held = (await trail.boundingBox())!
      await up()
      await vic.page.waitForTimeout(450)
      await shot(vic.page, "laser-fading", theme)
      // Already gone is shrunk too: a box is read only from a trail still there, and never waited for.
      const fading = (await trail.count()) ? await trail.boundingBox({ timeout: 500 }).catch(() => null) : null
      expect(fading === null || fading.width * fading.height < held.width * held.height, "the trail shrinks once let go").toBe(true)
      await expect(trail).toHaveCount(0, { timeout: LASER_MS + 3_000 })

      // Sam drops off the network without a word, mid-stroke: Vic's trail ends and goes all the same.
      await down(cx, cy - 40)
      for (let i = 1; i <= 5; i++) await move(cx + i * 10, cy - 40)
      await expect(trail).toHaveCount(1, { timeout: 10_000 })
      await setOfflineKeepingSocket(sam.context, true, { lose: true })
      await expect(trail).toHaveCount(0, { timeout: LASER_MS * 2 + 3_000 })
      await setOfflineKeepingSocket(sam.context, false)
      await up()
      await vic.page.waitForTimeout(500)
      await expect(trail).toHaveCount(0)

      // Sam leaves mid-stroke: his trail goes from Vic's board at once, before any fade would end it.
      await down(cx, cy + 60)
      for (let i = 1; i <= 5; i++) await move(cx - i * 10, cy + 60)
      await expect(trail).toHaveCount(1, { timeout: 10_000 })
      await sam.page.goto("about:blank")
      await expect(trail).toHaveCount(0, { timeout: LASER_MS - 300 })
      await shot(vic.page, "laser-left", theme)
      await sam.context.close()
      await vic.context.close()
    })
  }
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`a share link's guest sees a laser on the board, and no one's cursor or name (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(150_000)
      const on = shareBoard()
      const guest = await openGuest(browser, device, on, theme)
      const sam = await open(browser, device, on, USERS.sam, theme)
      const { cx, cy, down, move, up } = await takeLaser(sam.page, device === "phone")
      const layer = guest.page.locator("[data-board-cursors]")
      const trail = guest.page.locator(TRAIL)
      await expect(trail).toHaveCount(0)

      await down(cx - 80, cy)
      for (let i = 1; i <= 8; i++) await move(cx - 80 + i * 12, cy + (i % 2 ? 10 : -10))
      await expect(trail).toHaveCount(1, { timeout: 10_000 })
      await expect(layer.locator("[data-cursor]")).toHaveCount(0)
      // No one's name, in the markup either: not on the board's layer, not on the trail.
      for (const html of [await layer.evaluate((e) => e.outerHTML), await trail.evaluate((e) => e.outerHTML)])
        for (const name of [USERS.sam.user_name, USERS.sam.user_full_name]) expect(html).not.toContain(name)
      await shot(guest.page, "laser-guest", theme)

      await up()
      await expect(trail).toHaveCount(0, { timeout: LASER_MS + 3_000 })
      await sam.context.close()
      await guest.context.close()
    })
  }
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`a held, moving laser keeps a short tail on everyone else's board, as on its drawer's (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const phone = device === "phone"
      const on = shareBoard()
      const vic = await open(browser, device, on, USERS.vic, theme)
      const sam = await open(browser, device, on, USERS.sam, theme)
      const { cx, cy, down, move, up } = await takeLaser(sam.page, phone)
      const trail = vic.page.locator(TRAIL)

      // Sam holds the laser and sweeps it across the board for ~3 s.
      const span = phone ? 260 : 600
      const x0 = cx - span / 2
      await down(x0, cy)
      const cursor = vic.page.locator("[data-cursor] path")
      await expect(cursor).toHaveCount(1, { timeout: 10_000 })
      // Sam's trail as drawn now: only the path in his colour that draws something. A held trail with nothing new for
      // a second (a stalled update under load) decays to an empty path, which draws nothing and whose box is the
      // layer's corner (laser-gate4: x -512 from where it was): none is drawn then, and nothing is read.
      const drawn = vic.page.locator(`${TRAIL}[fill="${await cursor.getAttribute("fill")}"][d]:not([d=""])`)
      const box = async () => ((await drawn.count()) ? await drawn.first().boundingBox({ timeout: 500 }).catch(() => null) : null)
      const t0 = Date.now()
      let early: { x: number; width: number } | null = null
      let late: { x: number; width: number } | null = null
      // Nothing else in the sweep: a pause in Sam's moves of over a second (a screenshot under load) lets both trails
      // decay to nothing while held, as the drawer's own does when the pointer stops.
      for (let t = 0; t < 3_000; t = Date.now() - t0) {
        await move(x0 + (span * t) / 3_000, cy + 24 * Math.sin(t / 120))
        const now = t > 1_200 ? await box() : null
        if (!early) early = now
        if (now && t > 2_400) late = now
        await vic.page.waitForTimeout(16)
      }
      // Still held: Vic's trail is about the last second of it, its start long gone.
      expect(early, "Sam's trail drawn mid-sweep").not.toBeNull()
      expect(late, "Sam's trail drawn late in the sweep").not.toBeNull()
      expect(late!.width, `the trail's width after a ${span} px, 3 s sweep`).toBeLessThan(span * 0.6)
      expect(late!.x - early!.x, "the trail's tail moved on with it").toBeGreaterThan(span * 0.2)
      // Still held and moving on: the same moment on both boards, Sam's own trail and Vic's of Sam's, the same short tail.
      for (let i = 1; i <= 20; i++) {
        await move(x0 + span - i * 6, cy + 24 * Math.sin(i / 3))
        await vic.page.waitForTimeout(16)
      }
      await Promise.all([shot(sam.page, "laser-held-sam", theme), shot(vic.page, "laser-held-vic", theme)])
      await up()
      await expect(trail).toHaveCount(0, { timeout: LASER_MS + 3_000 })
      await sam.context.close()
      await vic.context.close()
    })
  }
}

for (const device of ["computer", "phone"] as const) {
  test(`a laser held past the old 2000-point cap still moves on everyone else's board (${device})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const phone = device === "phone"
    const on = shareBoard()
    const vic = await open(browser, device, on, USERS.vic, "light")
    const sam = await open(browser, device, on, USERS.sam, "light")
    const { cx, cy, down, move, up } = await takeLaser(sam.page, phone)
    const trail = vic.page.locator(TRAIL)

    await down(cx - 80, cy)
    await move(cx - 76, cy + 2)
    // Past the old cap at once: 2,100 moves of the held pointer, made in the page (one real move each would take a
    // minute), small and on the spot.
    await sam.page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive")!
        for (let i = 0; i < 2_100; i++)
          canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x + (i % 2) * 4, clientY: y + (i % 3), pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }))
      },
      [cx - 80, cy],
    )
    await expect(trail).toHaveCount(1, { timeout: 10_000 })
    await vic.page.waitForTimeout(INK_SEND_MS * 6)
    const capped = (await trail.first().boundingBox())!
    // Then Sam moves on, still held: Vic's trail goes with him.
    for (let i = 1; i <= 16; i++) {
      await move(cx - 76 + i * 10, cy + 2)
      await sam.page.waitForTimeout(16)
    }
    await expect
      .poll(async () => {
        const b = await trail.first().boundingBox()
        return b ? b.x + b.width : 0
      }, { timeout: 5_000 })
      .toBeGreaterThan(capped.x + capped.width + 80)
    await up()
    await sam.context.close()
    await vic.context.close()
  })
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`with reduced motion, everyone else's laser is its pointer, with no moving trail (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(150_000)
      const on = shareBoard()
      const vic = await open(browser, device, on, USERS.vic, theme, undefined, { reducedMotion: "reduce" })
      const sam = await open(browser, device, on, USERS.sam, theme)
      const { cx, cy, down, move, up } = await takeLaser(sam.page, device === "phone")
      const dot = vic.page.locator("[data-board-cursors] [data-laser-dot]")
      const trail = vic.page.locator(TRAIL)

      await down(cx - 80, cy)
      for (let i = 1; i <= 8; i++) await move(cx - 80 + i * 12, cy + (i % 2 ? 10 : -10))
      // Where Sam points, in his colour (his cursor's on Vic's board), and still while he is.
      await expect(dot).toHaveCount(1, { timeout: 10_000 })
      const fill = await vic.page.locator("[data-cursor] path").first().getAttribute("fill")
      await expect(dot.locator("circle")).toHaveAttribute("fill", fill!)
      for (let i = 1; i <= 8; i++) await move(cx + 16 + i * 12, cy)
      await vic.page.waitForTimeout(400)
      await shot(vic.page, "laser-still", theme)
      const at = (await dot.boundingBox())!
      const cursor = (await vic.page.locator("[data-cursor] svg").first().boundingBox())!
      // Sam's pointer: the corner his cursor starts at.
      expect(Math.abs(at.x + at.width / 2 - cursor.x), "the dot is at Sam's pointer").toBeLessThan(4)
      expect(Math.abs(at.y + at.height / 2 - cursor.y), "the dot is at Sam's pointer").toBeLessThan(4)
      // No trail at any point of the stroke: Excalidraw drew none.
      await expect(trail).toHaveCount(0)

      await up()
      await expect(dot).toHaveCount(0, { timeout: LASER_MS + 3_000 })
      await expect(trail).toHaveCount(0)
      await sam.context.close()
      await vic.context.close()
    })
  }
}
