import { join } from "node:path"
import { expect, test, type BrowserContextOptions, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { stubBackend, withStatus } from "./stubbedApp"
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, note } from "../scripts/fluidity/fakeBoard.mjs"

// V-1111: a phone page outside /app has no tab bar, yet the toasts and the
// offline pill stood on the tab bar's floor (app/phone.css, --phone-floor:
// 56px and the home indicator), so on a page with a foot bar of its own they
// landed on that bar. A foot bar publishes its top as the floor while it is
// on a phone screen, as a doc's comment pages do (V-1105), and the pill or a
// toast sits 8px or more above it, off its button. With SHOTS_DIR set, the
// lower half of each phone screen is saved with the pill or the toast up.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } satisfies BrowserContextOptions
const COMPUTER = { viewport: { width: 1280, height: 860 } } satisfies BrowserContextOptions

type Box = { top: number; bottom: number; left: number; right: number }
const rect = (l: Locator): Promise<Box> =>
  l.evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }
  })

/** Its entrance played out (the pill slides in, shell-pill-in 240ms; a toast too): a box read mid-way is a few px low. Endless ones (a dot's pulse) are left. */
const settled = (l: Locator) =>
  l.evaluate((e) =>
    Promise.all(
      e.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  )

/** Whether a first tap at the button's centre reaches the button, not something over it. */
const tapLands = (button: Locator) =>
  button.evaluate((b) => {
    const r = b.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (hit === b || b.contains(hit))
  })

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  const { width, height } = page.viewportSize()!
  const half = Math.round(height / 2)
  await page.screenshot({ path: join(dir, `${name}.png`), clip: { x: 0, y: half, width, height: height - half } })
}

/** The pill or the toast stands 8px or more above the foot (or wholly under it), and a first tap reaches the foot's button. */
async function expectClear(over: Locator, foot: Locator, button: Locator, what: string) {
  await settled(over)
  const o = await rect(over)
  const f = await rect(foot)
  const clear = o.bottom <= f.top - 8 || o.top >= f.bottom
  expect(clear, `${what}: it spans ${o.top}-${o.bottom}px, the foot ${f.top}-${f.bottom}px`).toBe(true)
  expect(await tapLands(button), `${what}: a first tap at the button's centre`).toBe(true)
}

// ---------------------------------------------------------------------------
// The public booking page: the confirm form's foot (the Book button).
// ---------------------------------------------------------------------------
const SLUG = "sam-rivera"
const NOW = new Date(2026, 9, 21, 10, 0)

function slots(today: Date) {
  const out: { start: string; end: string }[] = []
  for (let i = 1; out.length < 10; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    for (const m of [0, 30]) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, m)
      out.push({ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() })
    }
  }
  return out
}

const BOOKING = {
  slug: SLUG,
  title: "Intro call",
  // A page's usual few lines: on a 667px phone the page then runs past the screen, as LIVE's does.
  description: "Thirty minutes to see whether OneCamp fits your team: how you plan, chat and meet today, and what you would move first.",
  duration_minutes: 30,
  owner_name: "Sam Rivera",
  owner_tz: "UTC",
  slots: slots(NOW),
  bookable_until: new Date(NOW.getTime() + 30 * 864e5).toISOString(),
}

async function openBookingForm(page: Page, testInfo: TestInfo) {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, { [`/public/book/${SLUG}`]: { data: BOOKING } })
  await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.locator("[data-available]").first().click({ timeout: 30_000 })
  await page.locator("[data-slot] button").first().click()
  await page.locator("[data-slot-next]").click()
  await page.getByLabel("Name").fill("Jordan")
  await page.getByLabel("Email").fill("jordan@example.com")
  const book = page.locator("[data-book-button]")
  return { book, foot: book.locator("..") }
}

// ---------------------------------------------------------------------------
// A guest's board link: the name form at the foot, before the board opens.
// ---------------------------------------------------------------------------
const BOARD = "b0a4d000-0000-4000-8000-0000000000f9"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-foot"
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
const LIVE = `${b64({ alg: "HS256" })}.${b64({ sub: "guest-g9", name: "Guest: Priya", guest: true })}.sig`
const SESSION = { collab_token: LIVE, document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "comment", title: "Kickoff", workspace_name: "Acme", unlock: "u-1" }

async function openGuestBoard(use: BrowserContextOptions, browser: import("@playwright/test").Browser, posted: "ok" | "fails" = "ok") {
  const collab = collabFor([{ id: NAME, update: boardDoc([...note("n1", 0, 0, "Ship the pricing page")]), levels: { [LIVE]: "view" } }])
  const context = await browser.newContext(use)
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS.vic,
    docs: [],
    collab,
    fixtures: [
      [new RegExp(`/guest/collab/${TOKEN}$`), () => ({ msg: "ok", data: SESSION })],
      [/\/guest\/board-comment$/, () => (posted === "ok" ? { msg: "Success", data: { comment: { id: "c-1" } } } : status(500, { msg: "Something went wrong." }))],
    ],
  })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const field = page.getByLabel("Your name, as the team will see it")
  await expect(field).toBeVisible({ timeout: 60_000 })
  await field.fill("Priya")
  const go = page.getByRole("button", { name: "Continue" })
  return { context, page, go, foot: page.locator("form").filter({ has: go }) }
}

// ---------------------------------------------------------------------------
// A guest waiting in a personal room's lobby: Leave at the column's foot.
// ---------------------------------------------------------------------------
const ROOM = "/public/r/maya"

async function openLobby(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
    [`${ROOM}/join`]: withStatus(202, { data: { waiting: true, ticket: "t-1" } }),
    [`${ROOM}/knock/`]: (_url: URL, request: Request) => (request.method() !== "DELETE" ? new Promise(() => {}) : { data: { left: true } }),
  })
  await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByLabel("Your name").fill("Gia Russo")
  await page.getByRole("button", { name: "Join now" }).tap({ timeout: 60_000 })
  const wait = page.locator("[data-guest-lobby]")
  await expect(wait.getByRole("heading", { name: "Waiting to be let in" })).toBeVisible({ timeout: 30_000 })
  return wait.getByRole("button", { name: "Leave" })
}

const pillOf = (page: Page) => page.locator('[data-connection-pill="offline"]')

// The lobby leg asks for a camera: a browser-wide flag, so it is set for the file (a describe cannot take it).
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`on a phone, ${colorScheme}`, () => {
    test.use({ ...PHONE, colorScheme })

    test("offline on the booking page's confirm form, the pill stands above the Book bar and Book takes the first tap", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      // A 667px phone, the booker back at the page's top: the Book bar stands at the screen's foot, with no room
      // under it for the pill (8px, 36px, 8px). At the page's end it stands higher (on LIVE at 844 the pill sits under it, clear).
      await page.setViewportSize({ width: 390, height: 667 })
      const { book, foot } = await openBookingForm(page, testInfo)
      // The form's own scroll to its step may still be running: scroll back until the top holds.
      await expect
        .poll(
          async () => {
            await page.getByRole("heading", { level: 1 }).evaluate((e) => e.scrollIntoView({ block: "start" }))
            return 667 - (await rect(foot)).bottom
          },
          { message: "the Book bar's room under it", timeout: 10_000 },
        )
        .toBeLessThan(52)
      await page.context().setOffline(true)
      await expect(pillOf(page)).toBeVisible({ timeout: 30_000 })
      await shot(page, `booking-offline-390-${colorScheme}`)
      await expectClear(pillOf(page), foot, book, "the offline pill over the Book bar")
      // Back online the pill goes, and the floor with the bar when it leaves.
      await page.context().setOffline(false)
    })

    test("offline at a guest board link's name form, the pill stands above the form and Continue takes the first tap", async ({ browser }) => {
      test.setTimeout(120_000)
      const { context, page, go, foot } = await openGuestBoard({ ...PHONE, colorScheme }, browser)
      await context.setOffline(true)
      await expect(pillOf(page)).toBeVisible({ timeout: 30_000 })
      await shot(page, `guest-name-offline-390-${colorScheme}`)
      await expectClear(pillOf(page), foot, go, "the offline pill over the name form")
      // Continue is the foot's one button: a 44px touch target on a phone.
      expect((await go.boundingBox())?.height ?? 0, "Continue's height on a phone").toBeGreaterThanOrEqual(44)
      // Named, the form goes, and so does the floor it published.
      await context.setOffline(false)
      await go.click()
      await expect(page.locator("[data-guest-board]")).toBeVisible({ timeout: 30_000 })
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--mobile-drawer-h"))).toBe("")
      await context.close()
    })

    test("a guest's comment that fails says so above the new comment sheet, whose Comment takes the first tap", async ({ browser }) => {
      test.setTimeout(120_000)
      const { context, page, go } = await openGuestBoard({ ...PHONE, colorScheme }, browser, "fails")
      await go.click()
      await expect(page.locator("[data-guest-board]")).toBeVisible({ timeout: 30_000 })
      await page.getByRole("button", { name: "Comment", exact: true }).click()
      const canvas = page.locator("[data-guest-board] canvas").last()
      const box = (await canvas.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
      const sheet = page.getByRole("dialog", { name: "New comment" })
      await sheet.getByRole("textbox").fill("Looks good")
      const send = sheet.getByRole("button", { name: "Comment", exact: true })
      await send.click()
      const toast = page.locator(".toast-viewport > li").filter({ hasText: "Your comment wasn't posted" }).first()
      await expect(toast).toBeVisible({ timeout: 30_000 })
      await shot(page, `guest-comment-toast-390-${colorScheme}`)
      const foot = (await send.isVisible()) ? send.locator("..") : page.locator("[data-guest-board]")
      // Refused, Comment drops its spinner (a busy button takes no tap) and keeps the words.
      await expect(send).not.toHaveAttribute("aria-busy", "true", { timeout: 10_000 })
      await expectClear(toast, foot, send, "the comment-failed toast over the sheet's foot")
      await context.close()
    })

    test("offline in a room's lobby, the pill clears Leave, which takes the first tap (not red: a guard)", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const leave = await openLobby(page, testInfo)
      await page.context().setOffline(true)
      await expect(pillOf(page)).toBeVisible({ timeout: 30_000 })
      await settled(pillOf(page))
      const p = await rect(pillOf(page))
      const l = await rect(leave)
      expect(p.bottom, `the pill's bottom ${p.bottom}px against Leave's top ${l.top}px`).toBeLessThanOrEqual(l.top)
      expect(await tapLands(leave)).toBe(true)
    })
  })
}

test.describe("on a computer", () => {
  test.use(COMPUTER)

  test("the booking page publishes no floor, and its pill sits in the corner, off Book", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const { book, foot } = await openBookingForm(page, testInfo)
    await page.context().setOffline(true)
    await expect(pillOf(page)).toBeVisible({ timeout: 30_000 })
    const root = await page.evaluate(() => [document.documentElement.style.getPropertyValue("--mobile-drawer-h"), document.documentElement.style.getPropertyValue("--phone-floor")])
    expect(root).toEqual(["", ""])
    expect(await foot.evaluate((e) => getComputedStyle(e).position)).toBe("static")
    expect(await tapLands(book)).toBe(true)
  })

  test("a guest board link's name form publishes no floor", async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page, go } = await openGuestBoard(COMPUTER, browser)
    const root = await page.evaluate(() => [document.documentElement.style.getPropertyValue("--mobile-drawer-h"), document.documentElement.style.getPropertyValue("--phone-floor")])
    expect(root).toEqual(["", ""])
    expect(await tapLands(go)).toBe(true)
    await context.close()
  })
})
