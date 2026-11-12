import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, SHOT_THEMES, stubBackend, untilStill, WEEK_PLAN, withStatus } from "./stubbedApp"

// gcal-16 and gcal-new-task-blocks: "Plan my week" beside Tasks. The plan for
// your open tasks (POST /event/planWeek, which writes nothing) is a preview:
// at 1280 its proposals are dashed ghosts on the week beside a list, kept or
// removed, moved by a drag or the keys; on a phone it is a list in a drawer
// with its actions in a pinned footer. "Add N blocks" makes the kept ones, one
// task_block create each; Discard and Escape write nothing. A slow plan waits
// on skeleton rows, an empty plan says why and what to do next, and a failed
// one says so once, each with Close as its one way out. The plan takes the
// focus as it opens, and gives it back to "Plan my week" as it closes. With
// SHOTS_DIR set, each is saved for review at both widths, light and dark.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)

interface Made {
  kind?: string
  task_uuid?: string
  start?: { at: string }
  end?: { at: string }
}
interface Opts {
  member?: boolean
  plan?: unknown
  /** The plan's answer fails with this status; 0 is offline. */
  status?: number
  /** The plan's answer waits for this: a local model can take seconds. */
  hold?: Promise<void>
}

/** Opens the week; what it returns counts the plan's asks (one per open: a second would drop the first's answer). */
async function open(page: Page, testInfo: TestInfo, posted: Made[] = [], o: Opts = {}) {
  let asks = 0
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  // The blocks made, as the week reads them back: each titled with its task's name, as the server does.
  const name = (task?: string) => WEEK_PLAN.proposals.find((p) => p.task_uuid === task)?.task_name ?? "Block"
  const made = () =>
    posted.map((p, i) => ({ event_uuid: `b-${i}`, event_title: name(p.task_uuid), event_start_time: p.start?.at, event_end_time: p.end?.at, event_task: { task_uuid: p.task_uuid, task_name: name(p.task_uuid), task_status: "todo" } }))
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/getEvents": () => ({ msg: "ok", data: made() }),
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/user/sidebarNav": { msg: "ok", data: o.member === false ? {} : { user_projects: [{ project_uuid: "p-launch", project_name: "Launch" }] } },
    "/event/planWeek": async () => {
      asks++
      await o.hold
      return o.status !== undefined ? withStatus(o.status, { msg: "The planner is having a moment" }) : { msg: "ok", data: o.plan ?? WEEK_PLAN }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/calendar/events": (url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      if (request.method() !== "POST") return /^\/calendar\/events\/[^/]+$/.test(url.pathname) ? withStatus(404, { msg: "Not in this test" }) : { msg: "ok", data: [] }
      posted.push(request.postDataJSON() as Made)
      return { data: { id: `b-${posted.length}`, kind: "task_block", title: name(posted[posted.length - 1]?.task_uuid) } }
    },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return () => asks
}

async function shotIn(page: Page, name: string, themes: readonly ("light" | "dark")[]) {
  for (const theme of themes) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
}

const press = (target: Locator, phone: boolean) => (phone ? target.tap() : target.click())
const planButton = (page: Page) => page.getByRole("button", { name: "Plan my week" })
const addButton = (page: Page) => page.getByRole("button", { name: /^Add \d+ blocks?$/ })
/**
 * With nothing to discard (asked for, empty or failed), the way out is Close, and beside the grid the header's x is
 * Close too, "Close · Esc" (DESIGN-BUILD-128's re-look F3): no button is "Discard the plan". Gives the footer's Close.
 */
async function onlyClose(plan: Locator, phone: boolean) {
  await expect(plan.getByRole("button", { name: "Discard the plan" })).toHaveCount(0)
  const closes = plan.getByRole("button", { name: "Close", exact: true })
  await expect(closes).toHaveCount(phone ? 1 : 2)
  if (!phone) await expect(closes.first()).toHaveAttribute("title", "Close · Esc")
  return closes.last()
}
// The week's own "Nothing on this week" pill.
const pill = (page: Page) => page.locator("[data-calendar-blank]")
const EMPTY = { ...WEEK_PLAN, proposals: [], left: [], by: "due", model: undefined, note: "Nothing to plan: no open tasks" }
const ghosts = (page: Page) => page.locator("[data-plan-ghost]")
// By its own name: a ghost's reason may name another task ("After Plan the launch").
const ghost = (page: Page, name: string) => page.getByRole("group", { name: new RegExp(`^Proposed: ${name},`) })
const startOf = (m: Made) => Date.parse(m.start?.at ?? "")

for (const theme of ["light", "dark"] as const) {
  test.describe(`plan my week at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("shows the plan as ghosts beside a list, and adds only the kept blocks", async ({ page }, testInfo) => {
      const posted: Made[] = []
      const asks = await open(page, testInfo, posted)
      // The week is empty, and its own pill says so until the plan opens (DESIGN-BUILD-128 F2).
      await expect(pill(page)).toBeVisible()
      await planButton(page).click()
      await expect(ghosts(page)).toHaveCount(3)
      await expect(pill(page)).toHaveCount(0)
      const aside = page.locator("[data-calendar-plan]")
      await expect(aside.getByText("Nothing is added until you say so. Drag a block to move it.")).toBeVisible()
      await expect(aside.getByText("Ordered by qwen3:4b-instruct on your server")).toBeVisible()
      await expect(aside.getByText(/Not planned: it needs 6 hours/)).toBeVisible()
      await expect(ghost(page, "Plan the launch")).toContainText("Due Thursday")
      await reviewShot(page, "plan-week", theme)
      await ghost(page, "Write the pricing copy").getByRole("button", { name: "Remove Write the pricing copy" }).click()
      expect(posted).toHaveLength(0)
      await page.getByRole("button", { name: "Add 2 blocks" }).click()
      await expect.poll(() => posted.length).toBe(2)
      expect(posted).toMatchObject([
        { kind: "task_block", task_uuid: "t-plan" },
        { kind: "task_block", task_uuid: "t-ship" },
      ])
      expect(startOf(posted[0])).toBe(at(21, 11).getTime())
      // The ghosts go, the plan closes, and the real block draws.
      await expect(ghosts(page)).toHaveCount(0)
      await expect(aside).toHaveCount(0)
      // The focus goes back to the button that opened it, never to the page.
      await expect(planButton(page)).toBeFocused()
      await expect(page.locator('[aria-label^="Plan the launch, "]').first()).toBeVisible()
      // Said once, on the toast (its screen reader's copy is Radix's own announcement).
      const said = page.locator(".toast-root").filter({ hasText: "Added 2 blocks to your week" })
      await expect(said).toHaveCount(1)
      await expect(said).toBeVisible()
      expect(asks()).toBe(1)
      // The hand-over from ghost to block, settled: the blocks where the ghosts were, the toast gone (F4e).
      if (theme === "light") {
        await expect(page.locator(".toast-root")).toHaveCount(0, { timeout: 15_000 })
        await reviewShot(page, "plan-week-added", theme)
      }
    })
  })
}

/** A slow plan (F4b): skeleton rows and only Close, held about 1.5 s with a frame mid-wait, then the plan. */
async function slow(page: Page, testInfo: TestInfo, phone: boolean) {
  let go = () => {}
  const hold = new Promise<void>((ok) => (go = ok))
  const asks = await open(page, testInfo, [], { hold })
  await press(planButton(page), phone)
  const plan = page.locator("[data-calendar-plan]")
  const waiting = plan.getByRole("status", { name: "Planning your week" })
  await expect(waiting).toBeVisible()
  await expect(addButton(page)).toHaveCount(0)
  await expect(await onlyClose(plan, phone)).toBeVisible()
  await page.waitForTimeout(750)
  await shotIn(page, "plan-week-loading", SHOT_THEMES)
  await page.waitForTimeout(750)
  await expect(waiting).toBeVisible()
  go()
  await expect(plan.getByText("Plan the launch").first()).toBeVisible()
  await expect(waiting).toHaveCount(0)
  expect(asks()).toBe(1)
}

/** An empty plan (F1): what to do next, and Close, which writes nothing; no "Add 0 blocks". */
async function empty(page: Page, testInfo: TestInfo, phone: boolean) {
  const posted: Made[] = []
  const asks = await open(page, testInfo, posted, { plan: EMPTY })
  await press(planButton(page), phone)
  const plan = page.locator("[data-calendar-plan]")
  await expect(plan.getByRole("heading", { name: "Nothing to plan" })).toBeVisible()
  await expect(plan.getByText("Assign yourself a task, then plan again.")).toBeVisible()
  await expect(addButton(page)).toHaveCount(0)
  await expect(plan.getByRole("button", { name: "Discard", exact: true })).toHaveCount(0)
  const close = await onlyClose(plan, phone)
  await shotIn(page, "plan-week-empty", SHOT_THEMES)
  await press(close, phone)
  await expect(plan).toHaveCount(0)
  if (!phone) await expect(planButton(page)).toBeFocused()
  expect(posted).toHaveLength(0)
  expect(asks()).toBe(1)
}

/** A failed plan (F1): said once, Try again asks once more, and Close writes nothing; no "Add 0 blocks". */
async function failed(page: Page, testInfo: TestInfo, phone: boolean, status: number, shoot: boolean) {
  const posted: Made[] = []
  const asks = await open(page, testInfo, posted, { status })
  await press(planButton(page), phone)
  const plan = page.locator("[data-calendar-plan]")
  await expect(page.getByText("Couldn't load a plan for your week")).toHaveCount(1)
  await expect(plan.getByText(/^Nothing was added\./)).toBeVisible()
  await expect(page.locator('[data-tone="error"]')).toHaveCount(0)
  await expect(addButton(page)).toHaveCount(0)
  await onlyClose(plan, phone)
  if (shoot) await shotIn(page, "plan-week-failed", SHOT_THEMES)
  await press(plan.getByRole("button", { name: "Try again" }), phone)
  await expect.poll(asks).toBe(2)
  await expect(page.getByText("Couldn't load a plan for your week")).toHaveCount(1)
  await press(await onlyClose(plan, phone), phone)
  await expect(plan).toHaveCount(0)
  expect(posted).toHaveLength(0)
}

test.describe("plan my week's other cases at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: "light" })

  test("Discard writes nothing, nor does Escape, and Tasks and the plan take turns in the aside", async ({ page }, testInfo) => {
    const posted: Made[] = []
    await open(page, testInfo, posted)
    const plan = planButton(page)
    await plan.click()
    await expect(ghosts(page)).toHaveCount(3)
    // With blocks to add, the header's x discards them, as the footer's Discard does.
    await expect(page.getByRole("button", { name: "Discard the plan" })).toHaveAttribute("title", "Discard · Esc")
    await page.getByRole("button", { name: "Discard", exact: true }).click()
    await expect(ghosts(page)).toHaveCount(0)
    await expect(plan).toBeFocused()
    await plan.click()
    await expect(ghosts(page)).toHaveCount(3)
    await page.keyboard.press("Escape")
    await expect(ghosts(page)).toHaveCount(0)
    await expect(plan).toBeFocused()
    // One aside: opening Tasks closes the plan, and the plan closes Tasks (CR-B49 R3).
    await plan.click()
    await expect(ghosts(page)).toHaveCount(3)
    const tasks = page.getByRole("button", { name: "Tasks", exact: true })
    await tasks.click()
    await expect(page.locator("[data-calendar-tasks]")).toBeVisible()
    await expect(page.locator("[data-calendar-plan]")).toHaveCount(0)
    await expect(ghosts(page)).toHaveCount(0)
    await expect(plan).toHaveAttribute("aria-pressed", "false")
    await plan.click()
    await expect(ghosts(page)).toHaveCount(3)
    await expect(page.locator("[data-calendar-tasks]")).toHaveCount(0)
    await expect(tasks).toHaveAttribute("aria-pressed", "false")
    expect(posted).toHaveLength(0)
  })

  // CR-B49 R1: each day's column draws its own ghosts, so a move to another day draws the ghost anew there.
  test("a ghost dragged into the next day goes on to where it is let go, and one moved a day by the keys keeps the focus", async ({ page }, testInfo) => {
    const posted: Made[] = []
    await open(page, testInfo, posted)
    await planButton(page).click()
    const launch = ghost(page, "Plan the launch")
    const copy = ghost(page, "Write the pricing copy")
    await expect(launch).toBeVisible()
    // Thursday's column: the one the copy's ghost is drawn in.
    const thu = await copy.locator("xpath=..").boundingBox()
    const box = await launch.boundingBox()
    if (!thu || !box) throw new Error("no ghost")
    const hour = thu.height / 24
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(thu.x + thu.width / 2, box.y + 8, { steps: 6 })
    await expect(launch).toHaveAttribute("aria-label", /, Thu 11\b/)
    await page.mouse.move(thu.x + thu.width / 2, box.y + 8 + hour, { steps: 6 })
    await page.mouse.up()
    await expect(launch).toHaveAttribute("aria-label", /, Thu 12\b/)
    // A day by the keys: the focus stays on the ghost, and the keys still act on it.
    await copy.focus()
    await page.keyboard.press("Alt+ArrowRight")
    await expect(copy).toHaveAttribute("aria-label", /, Fri 9\b/)
    await expect(copy).toBeFocused()
    await page.keyboard.press("Delete")
    await expect(page.getByRole("button", { name: "Add 2 blocks" })).toBeVisible()
    await expect(copy).toBeFocused()
    await page.getByRole("button", { name: "Add 2 blocks" }).click()
    await expect.poll(() => posted.length).toBe(2)
    expect(posted.map((p) => [p.task_uuid, startOf(p)])).toEqual([
      ["t-plan", at(22, 12).getTime()],
      ["t-ship", at(23, 14).getTime()],
    ])
  })

  // F4d: the plan by the keys alone.
  test("takes the focus as it opens, moves a ghost by the keys, and gives the focus back to Plan my week on Escape, Discard and Add", async ({ page }, testInfo) => {
    const posted: Made[] = []
    await open(page, testInfo, posted)
    const plan = planButton(page)
    await plan.focus()
    await page.keyboard.press("Enter")
    // Into the plan: its heading, which names the week once the plan is in.
    const title = page.locator("#calendar-plan-title")
    await expect(ghosts(page)).toHaveCount(3)
    await expect(title).toBeFocused()
    await expect(title).toHaveText(/^Plan for the week of/)
    // Back by Shift+Tab to Friday's ghost, the week's last, its ring on.
    const ship = ghost(page, "Ship the pricing page")
    for (let i = 0; i < 8 && !(await ship.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Shift+Tab")
    await expect(ship).toBeFocused()
    await page.keyboard.press("Alt+ArrowUp")
    await expect(ship).toHaveAttribute("aria-label", /, Fri (1|13):45\b/)
    await expect(ship).toBeFocused()
    await shotIn(page, "plan-week-keys", SHOT_THEMES)
    await page.keyboard.press("Escape")
    await expect(ghosts(page)).toHaveCount(0)
    await expect(plan).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(title).toBeFocused()
    await page.getByRole("button", { name: "Discard", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(ghosts(page)).toHaveCount(0)
    await expect(plan).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(ghosts(page)).toHaveCount(3)
    await page.getByRole("button", { name: "Add 3 blocks" }).focus()
    await page.keyboard.press("Enter")
    await expect.poll(() => posted.length).toBe(3)
    await expect(page.locator("[data-calendar-plan]")).toHaveCount(0)
    await expect(plan).toBeFocused()
  })

  test("a ghost moved by a drag or by the keys is added where it was put", async ({ page }, testInfo) => {
    const posted: Made[] = []
    await open(page, testInfo, posted)
    await page.getByRole("button", { name: "Plan my week" }).click()
    const launch = ghost(page, "Plan the launch")
    await expect(launch).toBeVisible()
    const col = await page.locator("[data-day-col]").first().boundingBox()
    const hour = (col?.height ?? 24 * 56) / 24
    const box = await launch.boundingBox()
    if (!box) throw new Error("no ghost")
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + hour / 2, { steps: 4 })
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + hour, { steps: 4 })
    await page.mouse.up()
    // Each move as the ghost's own label says it (12 or 24 hour), before the next.
    await expect(launch).toHaveAttribute("aria-label", /, Wed 12\b/)
    // By the keys: Shipping a snap earlier.
    const ship = ghost(page, "Ship the pricing page")
    await ship.focus()
    await page.keyboard.press("Alt+ArrowUp")
    await expect(ship).toHaveAttribute("aria-label", /, Fri (1|13):45\b/)
    await page.getByRole("button", { name: "Add 3 blocks" }).click()
    await expect.poll(() => posted.length).toBe(3)
    expect(posted.map(startOf)).toEqual([at(21, 12).getTime(), at(22, 9).getTime(), at(23, 13, 45).getTime()])
  })

  test("a guest or a visitor without projects has no Plan my week", async ({ page }, testInfo) => {
    await open(page, testInfo, [], { member: false })
    await expect(page.getByRole("button", { name: "Plan my week" })).toHaveCount(0)
  })

  test("waits on a slow plan with skeleton rows and only Close", async ({ page }, testInfo) => {
    await slow(page, testInfo, false)
  })

  test("an empty plan says why and what to do next, with only Close", async ({ page }, testInfo) => {
    await empty(page, testInfo, false)
  })

  for (const [what, status] of [
    ["fails", 500],
    ["is offline", 0],
  ] as const) {
    test(`says once when the plan ${what}, and writes nothing`, async ({ page }, testInfo) => {
      await failed(page, testInfo, false, status, status !== 0)
    })
  }
})

test.describe("plan my week on a phone", () => {
  for (const theme of SHOT_THEMES) {
    test.describe(theme, () => {
      test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

      test("is a list in a drawer, a row removed, the rest added from its pinned footer", async ({ page }, testInfo) => {
        const posted: Made[] = []
        const asks = await open(page, testInfo, posted)
        await page.getByRole("button", { name: "Plan my week" }).tap()
        const drawer = page.locator("[data-calendar-plan]")
        await expect(drawer.locator("[data-plan-row]")).toHaveCount(3)
        expect(asks()).toBe(1)
        await expect(ghosts(page)).toHaveCount(0)
        // DESIGN-BUILD-128 F3: the drawer fits its plan, the line on what isn't planned in view above the footer.
        await expect(drawer).toHaveAttribute("data-detent", "medium")
        await expect(drawer.getByText("Nothing is added until you say so.", { exact: true })).toBeVisible()
        await expect(drawer.getByText(/Drag a block/)).toHaveCount(0)
        await untilStill(page)
        const add = drawer.getByRole("button", { name: "Add 3 blocks" })
        const box = await add.boundingBox()
        expect(box && box.y >= 0 && box.y + box.height <= 844).toBe(true)
        const left = await drawer.getByText(/Not planned: it needs 6 hours/).boundingBox()
        const foot = await drawer.locator("[data-sheet-footer]").boundingBox()
        expect(left && foot && left.y >= 0 && left.y + left.height <= foot.y).toBe(true)
        await reviewShot(page, "plan-week-phone", theme)
        await drawer.getByRole("button", { name: "Remove Ship the pricing page" }).tap()
        await drawer.getByRole("button", { name: "Add 2 blocks" }).tap()
        await expect.poll(() => posted.length).toBe(2)
        expect(posted).toMatchObject([
          { kind: "task_block", task_uuid: "t-plan" },
          { kind: "task_block", task_uuid: "t-copy" },
        ])
        await expect(drawer).toHaveCount(0)
      })

      test("Discard writes nothing", async ({ page }, testInfo) => {
        const posted: Made[] = []
        await open(page, testInfo, posted)
        await page.getByRole("button", { name: "Plan my week" }).tap()
        const drawer = page.locator("[data-calendar-plan]")
        await expect(drawer.locator("[data-plan-row]")).toHaveCount(3)
        await drawer.getByRole("button", { name: "Discard", exact: true }).tap()
        await expect(drawer).toHaveCount(0)
        expect(posted).toHaveLength(0)
      })
    })
  }
})

test.describe("plan my week's other cases on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("waits on a slow plan with skeleton rows and only Close", async ({ page }, testInfo) => {
    await slow(page, testInfo, true)
  })

  test("an empty plan says why and what to do next, with only Close", async ({ page }, testInfo) => {
    await empty(page, testInfo, true)
  })

  test("says once when the plan fails, and writes nothing", async ({ page }, testInfo) => {
    await failed(page, testInfo, true, 500, true)
  })
})
