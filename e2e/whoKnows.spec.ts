import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { stubBackend, withStatus, type Answers } from "./stubbedApp"

// Who knows (DG9) on the search page and in Settings › Profile, in a real
// browser with every request answered here: the strip under the search with
// the first three people, "See who and why" as a popover on a computer and a
// sheet with its action pinned on a phone, each person's items opening where
// they live; the loading, no-one, failed, refused and hidden-self states; and
// the person's own switch. With WHO_KNOWS_SHOTS=<dir> it saves each state at
// its size in light and dark, for design review (never committed).

const SHOTS = process.env.WHO_KNOWS_SHOTS || ""
const id = (n: number) => `${n.toString(16).padStart(8, "0")}-5a6b-4c7d-8e9f-0a1b2c3d4e5f`
const PLAN = id(1)
const TASK = id(2)
const MSG = id(3)
const CH = id(4)
const SHEET = id(5)

const ev = (kind: string, i: string, title: string, role: string, data?: Record<string, unknown>) => ({ kind, id: i, title, role, data })
const people = [
  { id: id(11), name: "Maya Chen", score: 9, wrote: 2, created: 0, posted: 0, assigned: 1, commented: 1, evidence: [ev("doc", PLAN, "Q4 budget plan", "wrote"), ev("doc", SHEET, "Budget assumptions", "wrote"), ev("task", TASK, "Close the Q4 budget", "assigned")] },
  { id: id(12), name: "Priya Nair", score: 6, wrote: 0, created: 1, posted: 1, assigned: 0, commented: 0, evidence: [ev("task", TASK, "Close the Q4 budget", "wrote"), ev("message", MSG, "Budget review moved to Thursday", "wrote", { channel_id: CH, channel_name: "finance" })] },
  { id: id(13), name: "Leo Grant", score: 4, wrote: 0, created: 0, posted: 0, assigned: 1, commented: 2, evidence: [ev("task", TASK, "Close the Q4 budget", "assigned"), ev("doc", PLAN, "Q4 budget plan", "commented")] },
  { id: id(14), name: "Ana Souza", score: 3, wrote: 0, created: 0, posted: 0, assigned: 0, commented: 3, evidence: [ev("doc", PLAN, "Q4 budget plan", "commented")] },
  { id: id(15), name: "Tom Becker", score: 1, wrote: 0, created: 0, posted: 0, assigned: 0, commented: 1, evidence: [ev("message", MSG, "Budget review moved to Thursday", "commented", { channel_id: CH, channel_name: "finance" })] },
]
const answer = (hidden = false, list = people) => (url: URL) => ({
  data: { query: url.searchParams.get("q"), considered: 14, you_hidden: hidden, people: list.slice(0, Number(url.searchParams.get("limit") || 8)) },
})
const results = { data: { page: [{ type: "doc", doc: { doc_uuid: PLAN, doc_title: "Q4 budget plan" } }], has_more: false } }
// The search page asks the one grammar's search (docs C2-1).
const queryResults = { data: { ...results.data, totals: { doc: 1 }, total: 1, notes: [], query: { runs: true, issues: [], text: "budget" } } }

async function open(page: Page, testInfo: TestInfo, whoKnows: unknown, theme: "light" | "dark" = "light", extra: Answers = {}, routes?: (page: Page) => Promise<unknown>, path = "/app/search?query=budget") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("ui-theme", t)
      localStorage.setItem("theme", t)
    } catch {}
  }, theme)
  await page.emulateMedia({ colorScheme: theme })
  await stubBackend(page, testInfo, {
    "/people/who-knows/me": { data: { listed: true } },
    "/people/who-knows": whoKnows,
    "/search/unifiedSearch": results,
    "/query/search": queryResults,
    [`/doc/getDocInfo/${PLAN}`]: { msg: "ok", data: { doc_uuid: PLAN, doc_title: "Q4 budget plan" } },
    ...extra,
  })
  await routes?.(page)
  if (process.env.WHO_KNOWS_DEBUG) page.on("response", (r) => r.status() === 404 && console.log("404", new URL(r.url()).pathname))
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  await page.waitForTimeout(350) // entrances settled
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const strip = (page: Page) => page.locator("[data-who-knows-strip]")

/** Whatever the strip says fits its held slot: nothing scrolls inside it, so nothing is cut (DESIGN-BUILD-16, 25 Oct). */
async function fitsTheSlot(page: Page) {
  expect(await strip(page).locator("[data-who-knows-body]").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`on a computer (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 } })

    test("the strip names who knows, and the panel shows why", async ({ page }, testInfo) => {
      await open(page, testInfo, answer(), theme)
      await expect(strip(page).getByRole("link", { name: "Maya Chen, Wrote 2 · Assigned 1 · Commented on 1" })).toBeVisible({ timeout: 30_000 })
      await expect(strip(page).getByRole("link")).toHaveCount(3)
      await shot(page, `strip-1280-${theme}`)
      await strip(page).getByRole("link", { name: /Priya Nair/ }).hover()
      await shot(page, `strip-hover-1280-${theme}`)
      const see = strip(page).getByRole("button", { name: "See who and why" })
      await see.click()
      const panel = page.locator("[data-who-knows-panel]")
      // Open is the neutral press tint, never the accent.
      await expect(see).toHaveAttribute("aria-expanded", "true")
      await expect(panel.getByRole("link", { name: "Created Close the Q4 budget" })).toBeVisible()
      await expect(panel.getByRole("link", { name: "Wrote Q4 budget plan" }).first()).toHaveAttribute("href", `/app/doc/${PLAN}`)
      await expect(panel.getByRole("link", { name: "Posted Budget review moved to Thursday" })).toHaveAttribute("href", `/app/channel/${CH}/${MSG}`)
      await expect(panel.getByRole("link", { name: /Tom Becker/ })).toBeVisible()
      await shot(page, `panel-1280-${theme}`)
      // The keyboard: arrows move through the rows, Escape returns to the button.
      await panel.getByRole("link", { name: /Maya Chen/ }).focus()
      await page.keyboard.press("ArrowDown")
      await expect(panel.getByRole("link", { name: "Wrote Q4 budget plan" }).first()).toBeFocused()
      await shot(page, `panel-focus-1280-${theme}`)
      await page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)
      await expect(see).toBeFocused()
    })

    test("loading, then no one", async ({ page }, testInfo) => {
      let release: () => void = () => {}
      const held = new Promise<void>((r) => (release = r))
      // Held, then answered by the stub (no one).
      await open(page, testInfo, answer(false, []), theme, {}, (p) =>
        p.route(/\/people\/who-knows\?/, async (route) => {
          await held
          await route.fallback()
        }),
      )
      await expect(strip(page).getByRole("status", { name: "Finding who knows" })).toBeVisible({ timeout: 30_000 })
      await shot(page, `loading-1280-${theme}`)
      // The strip's code can land between finding its place and measuring it: the
      // loaded strip then takes the place of the frame that stood in for it
      // (WhoKnowsSlot's fallback), and the node found is gone. Measured until one stays.
      let held_ = 0
      await expect(async () => {
        held_ = (await strip(page).boundingBox())?.height ?? 0
        expect(held_).toBeGreaterThan(0)
      }).toPass()
      release()
      await expect(strip(page).getByText(/No one yet/)).toBeVisible()
      // Said in the same held slot: nothing under it moves (main, 25 Oct).
      expect((await strip(page).boundingBox())!.height).toBe(held_)
      await shot(page, `empty-1280-${theme}`)
    })

    test("a failure offers Try again", async ({ page }, testInfo) => {
      await open(page, testInfo, withStatus(503, { msg: "down" }), theme)
      // In one row, in view: never below the slot's fold.
      await expect(strip(page).getByRole("button", { name: /Try again/ })).toBeInViewport({ ratio: 1, timeout: 30_000 })
      await expect(strip(page).getByText(/No one yet/)).toHaveCount(0)
      await fitsTheSlot(page)
      await shot(page, `error-1280-${theme}`)
    })

    test("someone who left themselves out is told, and the search still answers", async ({ page }, testInfo) => {
      await open(page, testInfo, answer(true), theme)
      await expect(strip(page).getByText(/You're hidden from Who knows/)).toBeVisible({ timeout: 30_000 })
      await expect(strip(page).getByRole("link", { name: "Change" })).toHaveAttribute("href", "/app/settings/profile#profile-who-knows")
      // The note takes one person's room.
      await expect(strip(page).locator("[data-who-knows-person]")).toHaveCount(2)
      await fitsTheSlot(page)
      await shot(page, `hidden-1280-${theme}`)
    })

    test("someone refused sees no strip at all", async ({ page }, testInfo) => {
      await open(page, testInfo, withStatus(403, { msg: "members only" }), theme)
      await expect(page.locator("[data-search-results]")).toBeVisible({ timeout: 30_000 })
      await expect(strip(page)).toHaveCount(0)
    })

    test("the person's own switch", async ({ page }, testInfo) => {
      let sent: unknown = null
      await open(page, testInfo, answer(), theme, {
        "/people/who-knows/me": (_url: URL, request: { method(): string; postDataJSON(): unknown }) => {
          if (request.method() === "PUT") sent = request.postDataJSON()
          return { data: { listed: request.method() === "PUT" ? false : true } }
        },
      }, undefined, "/app/settings/profile")
      const sw = page.getByRole("switch", { name: /Show me in Who knows/ })
      await expect(sw).toBeChecked({ timeout: 30_000 })
      await sw.scrollIntoViewIfNeeded()
      await shot(page, `setting-1280-${theme}`)
      await sw.click()
      await expect(sw).not.toBeChecked()
      await expect.poll(() => sent).toEqual({ listed: false })
      await shot(page, `setting-off-1280-${theme}`)
    })
  })

  test.describe(`on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test("the panel is a sheet whose action stays in reach", async ({ page }, testInfo) => {
      await open(page, testInfo, answer(), theme)
      await expect(strip(page).getByRole("link", { name: /Maya Chen/ })).toBeVisible({ timeout: 30_000 })
      await shot(page, `strip-390-${theme}`)
      await strip(page).getByRole("button", { name: "See who and why" }).tap()
      const sheet = page.locator("[data-who-knows-panel]")
      await expect(sheet.getByRole("link", { name: /Tom Becker/ })).toBeAttached({ timeout: 30_000 })
      const action = sheet.locator("[data-sheet-footer]").getByRole("link", { name: "Your Who knows setting" })
      await expect(action).toBeInViewport()
      await shot(page, `panel-390-${theme}`)
    })

    test("its failed and empty states", async ({ page }, testInfo) => {
      await open(page, testInfo, withStatus(503, { msg: "down" }), theme)
      await expect(strip(page).getByRole("button", { name: /Try again/ })).toBeInViewport({ ratio: 1, timeout: 30_000 })
      await fitsTheSlot(page)
      await shot(page, `error-390-${theme}`)
    })

    test("someone who left themselves out sees two people under the note, none cut", async ({ page }, testInfo) => {
      await open(page, testInfo, answer(true), theme)
      await expect(strip(page).getByText(/You're hidden from Who knows/)).toBeVisible({ timeout: 30_000 })
      await expect(strip(page).locator("[data-who-knows-person]")).toHaveCount(2)
      await fitsTheSlot(page)
      await shot(page, `hidden-390-${theme}`)
    })

    test("before the strip's code arrives, its place is already the strip loading", async ({ page }, testInfo) => {
      let release: () => void = () => {}
      const held = new Promise<void>((r) => (release = r))
      // The strip's own chunk (the only one with "See who and why" in it) waits; the page draws the slot first.
      await open(page, testInfo, answer(), theme, {}, (p) =>
        p.route(/\/_next\/static\/chunks\/.+\.js/, async (route) => {
          const response = await route.fetch()
          const body = await response.text()
          if (body.includes("See who and why")) await held
          await route.fulfill({ response, body })
        }),
      )
      // Never a blank card, which reads as broken: the strip's frame, its rows waiting.
      await expect(strip(page).getByRole("heading", { name: "Who knows about “budget”" })).toBeVisible({ timeout: 30_000 })
      await expect(strip(page).getByRole("status", { name: "Finding who knows" })).toBeVisible()
      await shot(page, `first-frame-390-${theme}`)
      const first = (await strip(page).boundingBox())!.height
      release()
      await expect(strip(page).getByRole("link", { name: /Maya Chen/ })).toBeVisible({ timeout: 30_000 })
      // The strip takes the same place: nothing under it moves.
      expect((await strip(page).boundingBox())!.height).toBe(first)
    })
  })
}
