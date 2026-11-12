import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// Calendar B7: Outlook Calendar beside Google's. Off, in plain words, until
// the admin adds a Microsoft app (an admin is pointed, in one line, to the
// steps on the Microsoft card in Admin); then Connect, through the connectors and back
// to the calendar; the move brings Outlook's calendars, which are there to
// pick (show or hide) under My calendars; once linked, how it stands, and
// connecting it again when Microsoft stops answering, which the closed
// Calendars button says too. The admin's Microsoft app sits in Admin,
// Integrations, with the steps and the redirect address to copy, its secret
// only ever "Saved". At 1280 and at 390 with touch.
// With SHOTS_DIR set, each state is saved for review, light and dark.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()
const WEEK = "/app/calendar?date=2026-10-21&view=week"
const ADMIN = { ...SAM, user_is_admin: true }

type Sync = { provider: "microsoft"; account?: string; state: string; progress: number; moved: number; unchanged: number; available: boolean; last_synced_at?: string; error?: string }
// syncFails: GET /calendar/sync/microsoft answers 500 (CR-B22 G1).
type Setup = { available?: boolean; connected?: boolean; admin?: boolean; sync?: Partial<Sync>; syncFails?: boolean }

// What the server keeps as why; the web says it in its own short words.
const STOPPED = "Microsoft stopped answering for this account. Connect it again."
const BROKEN: Setup = { connected: true, sync: { state: "broken", progress: 100, error: STOPPED } }

const PERSONAL = { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }
// The calendar the move from Outlook makes.
const WORK = { id: "cal-work", name: "Work", kind: "external", hue: "berry", access: "manage", mine: true }

async function open(page: Page, testInfo: TestInfo, setup: Setup = {}) {
  const { available = true, admin = false } = setup
  const world = {
    connected: !!setup.connected,
    moved: false,
    moves: 0,
    connects: 0,
    disconnects: 0,
    posts: [] as unknown[],
    sync: { provider: "microsoft", account: "sam@contoso.com", state: "none", progress: 0, moved: 0, unchanged: 0, available, ...setup.sync } as Sync,
  }
  let polls = 0
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: admin ? ADMIN : SAM },
    "/event/getEvents": () => ({ msg: "ok", data: world.moved ? [{ event_uuid: "e-plan", event_title: "Quarterly planning", event_start_time: at(22, 14), event_end_time: at(22, 15), event_calendar_id: WORK.id }] : [] }),
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0, available: true } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": () => ({ msg: "ok", data: world.moved ? [PERSONAL, WORK] : [PERSONAL] }),
    // Only once the admin has added the app is Outlook's connector offered.
    "/connectors/microsoft_calendar/connect": () => {
      world.connects++
      // As if the person said yes on Microsoft's page: the callback lands on the calendar.
      world.connected = true
      return { msg: "ok", data: { url: `${WEEK}&connector=success&provider=microsoft_calendar` } }
    },
    "/connectors/microsoft_calendar/disconnect": () => {
      world.disconnects++
      world.connected = false
      // As the server: a link the sweep found broken stays broken (SyncStatus never reads the connector), CR-B22 F1.
      world.sync = { ...world.sync, state: world.sync.state === "broken" ? "broken" : "none", progress: 0, moved: 0 }
      return { msg: "Disconnected" }
    },
    "/connectors": () => ({ msg: "ok", data: { connectors: available ? [{ id: "microsoft_calendar", name: "Outlook Calendar", connected: world.connected }] : [] } }),
    "/calendar/sync/microsoft/move": (_url: URL, request: Request) => {
      if (request.method() === "POST") {
        world.moves++
        world.sync = { ...world.sync, state: "moving", progress: 45 }
      }
      return { msg: "ok", data: world.sync }
    },
    // The admin's apps, for the link to the Microsoft card (set up once Outlook is available).
    "/admin/auth/oauth-config": (_url: URL, request: Request) => {
      if (request.method() === "POST") world.posts.push(request.postDataJSON())
      return { msg: "ok", data: available ? OAUTH : OAUTH_OFF }
    },
    "/calendar/sync/microsoft": () => {
      if (setup.syncFails) return withStatus(500, { msg: "internal error" })
      // Two reads while it moves, then it is in step.
      if (world.sync.state === "moving" && ++polls > 2) {
        world.moved = true
        world.sync = { ...world.sync, state: "synced", progress: 100, moved: 37, last_synced_at: new Date(NOW.getTime() - 2 * 60_000).toISOString() }
      }
      return { msg: "ok", data: world.sync }
    },
  })
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`UNSTUBBED ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto(WEEK, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return world
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
}

for (const theme of SHOT_THEMES) {
  test.describe(`Outlook Calendar at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("off until the admin adds a Microsoft app: a member is told who turns it on, never shown how", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { available: false })
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const tile = page.locator("[data-calendars-panel] [data-sync-tile='microsoft']")
      await expect(tile).toContainText("Your admin turns Outlook on by adding a free Microsoft app.")
      await expect(tile.getByRole("button", { name: "How to turn on Outlook" })).toHaveCount(0)
      await expect(tile.getByRole("button", { name: /Connect/ })).toHaveCount(0)
      await shot(page, "b7-off", theme)
    })

    // DESIGN-BUILD-117 F1: the steps sit on the Microsoft card in Admin, where the admin acts; the panel keeps one line and its link, in view.
    test("off for an admin: one line, and the link to Admin, Integrations", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { available: false, admin: true })
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const tile = page.locator("[data-calendars-panel] [data-sync-tile='microsoft']")
      await expect(tile).toContainText("Add a free Microsoft app in Admin, Integrations")
      const link = tile.getByRole("link", { name: "Admin, Integrations" })
      await expect(link).toHaveAttribute("href", "/app/admin?tab=integrations#integrations-oauth-microsoft")
      await expect(link).toBeInViewport()
      await expect(tile.locator("[data-outlook-how]")).toHaveCount(0)
      await expect(tile.getByRole("button", { name: "How to turn on Outlook" })).toHaveCount(0)
      await shot(page, "b7-admin-off", theme)
    })

    test("connect, back to the calendar, move, pick its calendars, then linked; and disconnect", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo)
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const panel = page.locator("[data-calendars-panel]")
      const connect = panel.getByRole("button", { name: "Connect Outlook Calendar" })
      await expect(connect).toBeVisible()
      await shot(page, "b7-available", theme)
      await connect.click()
      // Back from Microsoft: said once, and dropped from the address.
      await expect(page.getByText("Outlook Calendar is connected", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await expect(page).not.toHaveURL(/connector=/)
      expect(world.connects).toBe(1)
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const tile = panel.locator("[data-sync-tile='microsoft']")
      await expect(tile.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com")
      await tile.getByRole("button", { name: "Move everything from Outlook" }).click()
      await expect(tile).toContainText("Moving from Outlook · 45%")
      await expect(tile.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com · In step with Outlook · 2m ago", { timeout: 20_000 })
      expect(world.moves).toBe(1)
      // The picker: Outlook's calendar is listed under My calendars, to show or hide.
      const work = panel.getByRole("checkbox", { name: "Work", exact: true })
      await expect(work).toBeChecked({ timeout: 20_000 })
      const week = page.locator("[data-period]")
      await expect(week.getByText("Quarterly planning")).toBeVisible({ timeout: 20_000 })
      await shot(page, "b7-linked", theme)
      await work.click()
      await expect(week.getByText("Quarterly planning")).toHaveCount(0)
      await work.click()
      await expect(week.getByText("Quarterly planning")).toBeVisible()
      // Disconnect asks first, then Connect is back.
      await tile.getByRole("button", { name: "Disconnect Outlook Calendar" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect Outlook Calendar" }).click()
      await expect.poll(() => world.disconnects).toBe(1)
      await expect(panel.getByRole("button", { name: "Connect Outlook Calendar" })).toBeVisible({ timeout: 20_000 })
    })

    test("when Microsoft stops answering, the closed button and the tile say so once, and connect it again", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo, BROKEN)
      const closed = page.getByRole("button", { name: "Calendars, Outlook needs connecting again" })
      await expect(closed.locator("[data-sync-broken]")).toBeVisible({ timeout: 60_000 })
      await closed.click()
      const tile = page.locator("[data-calendars-panel] [data-sync-tile='microsoft']")
      await expect(tile.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com · Outlook stopped answering")
      await expect(tile.getByText(/stopped answering/)).toHaveCount(1)
      await expect(tile.getByRole("button", { name: /from Outlook/ })).toHaveCount(0)
      await shot(page, "b7-broken", theme)
      await tile.getByRole("button", { name: "Connect Outlook again" }).click()
      await expect.poll(() => world.connects).toBe(1)
    })

    // CR-B22 F1: after the person's own Disconnect the sync stays "broken" on the server; nothing is to be
    // connected again, so the closed button carries no danger dot and its name says nothing of Outlook.
    test("disconnecting a broken Outlook leaves the closed button plain", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo, BROKEN)
      const broken = page.getByRole("button", { name: "Calendars, Outlook needs connecting again" })
      await expect(broken.locator("[data-sync-broken]")).toBeVisible({ timeout: 60_000 })
      await broken.click()
      const panel = page.locator("[data-calendars-panel]")
      await panel.locator("[data-sync-tile='microsoft']").getByRole("button", { name: "Disconnect Outlook Calendar" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect Outlook Calendar" }).click()
      await expect.poll(() => world.disconnects).toBe(1)
      await expect(panel.getByRole("button", { name: "Connect Outlook Calendar" })).toBeVisible({ timeout: 20_000 })
      expect(world.sync.state).toBe("broken")
      await page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)
      const closed = page.getByRole("button", { name: "Calendars", exact: true })
      await expect(closed).toBeVisible()
      await expect(page.locator("[data-sync-broken]")).toHaveCount(0)
    })

    // CR-B22 G1: Outlook's read failed: one quiet line says so, where the tile would be.
    test("when Outlook's link can't be read, the panel says it couldn't load", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { syncFails: true })
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const tile = page.locator("[data-calendars-panel] [data-sync-tile='microsoft']")
      await expect(tile).toHaveText("Outlook Calendar couldn't load", { timeout: 20_000 })
      await expect(tile).toHaveClass(/\btext-ink-3\b/)
      await expect(page.locator("[data-calendars-panel]").getByRole("button", { name: /Outlook/ })).toHaveCount(0)
      await shot(page, "b7-loadfail", theme)
    })
  })
}

for (const theme of SHOT_THEMES) {
  test.describe(`Outlook Calendar on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the calendar options: off for a member, told who turns it on", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { available: false })
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const outlook = page.locator("[data-drawer-outlook]")
      await expect(outlook).toContainText("Your admin turns Outlook on by adding a free Microsoft app.")
      await expect(outlook.getByRole("button", { name: "How to turn on Outlook" })).toHaveCount(0)
      await outlook.scrollIntoViewIfNeeded()
      await fits(page)
      await shot(page, "b7-off", theme)
    })

    test("an admin's options say in one line where Outlook is turned on", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { available: false, admin: true })
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const outlook = page.locator("[data-drawer-outlook]")
      await expect(outlook).toContainText("Add a free Microsoft app in Admin, Integrations")
      await expect(outlook.getByRole("link", { name: "Admin, Integrations" })).toHaveAttribute("href", "/app/admin?tab=integrations#integrations-oauth-microsoft")
      await expect(outlook.locator("[data-outlook-how]")).toHaveCount(0)
      await outlook.scrollIntoViewIfNeeded()
      await fits(page)
      await shot(page, "b7-admin-off", theme)
    })

    test("connect, move, pick its calendars, then linked; and disconnect from the last group", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const outlook = page.locator("[data-drawer-outlook]")
      const connect = outlook.getByRole("button", { name: "Connect Outlook Calendar" })
      await connect.scrollIntoViewIfNeeded()
      await shot(page, "b7-available", theme)
      await connect.tap()
      await expect(page.getByText("Outlook Calendar is connected", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      expect(world.connects).toBe(1)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      await expect(outlook.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com")
      await outlook.getByRole("button", { name: "Move everything from Outlook" }).tap()
      await expect(outlook.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com · In step with Outlook · 2m ago", { timeout: 20_000 })
      expect(world.moves).toBe(1)
      // The picker: Work under My calendars, its switch on.
      const work = page.locator("[data-drawer-calendars]").getByRole("switch", { name: "Show Work", exact: true })
      await expect(work).toBeChecked({ timeout: 20_000 })
      await outlook.scrollIntoViewIfNeeded()
      await fits(page)
      await shot(page, "b7-linked", theme)
      await work.tap()
      await expect(work).not.toBeChecked()
      // Disconnect, which loses something, sits in the options' last group (beside Google's, C7) and asks first;
      // the options stay behind the confirm, so Connect is back where it was, and the last group goes.
      const last = page.getByRole("group", { name: "Disconnect" })
      await expect(last).toHaveAttribute("data-holds-danger", "")
      await last.getByRole("button", { name: "Disconnect Outlook Calendar" }).tap()
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect Outlook Calendar" }).tap()
      await expect.poll(() => world.disconnects).toBe(1)
      await expect(outlook.getByRole("button", { name: "Connect Outlook Calendar" })).toBeVisible({ timeout: 20_000 })
      await expect(last).toHaveCount(0)
    })

    test("when Microsoft stops answering, the options say so once and connect it again", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo, BROKEN)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const outlook = page.locator("[data-drawer-outlook]")
      await expect(outlook.locator("[data-microsoft-account]")).toHaveText("sam@contoso.com · Outlook stopped answering")
      await expect(outlook.getByText(/stopped answering/)).toHaveCount(1)
      const again = outlook.getByRole("button", { name: "Connect Outlook again" })
      await again.scrollIntoViewIfNeeded()
      await fits(page)
      await shot(page, "b7-broken", theme)
      await again.tap()
      await expect.poll(() => world.connects).toBe(1)
    })

    // CR-B22 F1 on a phone: Disconnect from the options' last group; the sync stays "broken" on the server, and
    // nothing on the page says Outlook needs connecting again.
    test("disconnecting a broken Outlook leaves no danger dot", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const world = await open(page, testInfo, BROKEN)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const last = page.getByRole("group", { name: "Disconnect" })
      await last.getByRole("button", { name: "Disconnect Outlook Calendar" }).tap()
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect Outlook Calendar" }).tap()
      await expect.poll(() => world.disconnects).toBe(1)
      await expect(page.locator("[data-drawer-outlook]").getByRole("button", { name: "Connect Outlook Calendar" })).toBeVisible({ timeout: 20_000 })
      expect(world.sync.state).toBe("broken")
      await page.getByRole("button", { name: "Done" }).tap()
      await expect(page.locator("[data-drawer-outlook]")).toHaveCount(0)
      await expect(page.locator("[data-sync-broken]")).toHaveCount(0)
      await expect(page.getByRole("button", { name: /needs connecting again/ })).toHaveCount(0)
    })

    // CR-B22 G1 on a phone: the options' Outlook group says it couldn't load.
    test("when Outlook's link can't be read, the options say it couldn't load", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, { syncFails: true })
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const outlook = page.locator("[data-drawer-outlook]")
      await expect(outlook).toContainText("Outlook Calendar couldn't load", { timeout: 20_000 })
      await expect(outlook.getByRole("button")).toHaveCount(0)
      await outlook.scrollIntoViewIfNeeded()
      await fits(page)
      await shot(page, "b7-loadfail", theme)
    })
  })
}

// The admin's Microsoft app, beside Google's sign-in: its id, and a secret
// that is never sent back, only "Saved".
const OAUTH = {
  google_client_id: "1234.apps.googleusercontent.com", google_has_client_secret: true, google_configured: true, google_source: "db",
  github_client_id: "", github_has_client_secret: false, github_configured: false, github_source: "none",
  microsoft_client_id: "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b", microsoft_has_client_secret: true, microsoft_configured: true, microsoft_source: "db",
}
// Before the admin adds it (Outlook off on the calendar).
const OAUTH_OFF = { ...OAUTH, microsoft_client_id: "", microsoft_has_client_secret: false, microsoft_configured: false, microsoft_source: "none" }

for (const { width, touch } of [{ width: 1280, touch: false }, { width: 390, touch: true }]) {
  for (const theme of SHOT_THEMES) {
    test.describe(`the admin's Microsoft app at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: touch, hasTouch: touch, colorScheme: theme, permissions: ["clipboard-read", "clipboard-write"] })

      // DESIGN-BUILD-118 F3: the admin follows the calendar's one line (the panel at 1280, the options at 390)
      // and lands on the Microsoft card itself: its steps and Copy in view, with no scroll of the test's own.
      test("the calendar's link lands on its steps and the redirect address to copy", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const world = await open(page, testInfo, { available: false, admin: true })
        if (touch) await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
        else await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
        const link = page.locator(touch ? "[data-drawer-outlook]" : "[data-calendars-panel]").getByRole("link", { name: "Admin, Integrations" })
        await (touch ? link.tap() : link.click())
        await page.waitForURL(/\/app\/admin\?tab=integrations#integrations-oauth-microsoft$/, { timeout: 120_000 })
        const card = page.getByLabel("Microsoft app for Outlook Calendar")
        await expect(card).toBeVisible({ timeout: 240_000 })
        // The steps sit on the card, above the fields they end in (DESIGN-BUILD-117 F1).
        const steps = card.locator("[data-outlook-how]")
        await expect(steps.locator("li")).toHaveCount(4)
        await expect(steps).toContainText("“common” tenant")
        const address = steps.locator("code")
        await expect(address).toContainText("connector/oauth/callback")
        const copy = card.getByRole("button", { name: "Copy redirect address" })
        await expect(copy).toBeInViewport({ timeout: 20_000 })
        await expect(card.getByRole("heading", { name: "Microsoft", exact: true })).toBeInViewport()
        // The card itself fits the screen (the address scrolls in its box, never the page).
        const box = (await card.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        await shot(page, "b7-admin-app", theme)
        await (touch ? copy.tap() : copy.click())
        await expect(card.getByRole("button", { name: "redirect address copied" })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await address.textContent())
        await expect(page.getByLabel("Client ID for Microsoft")).toHaveValue("")
        expect(world.posts).toHaveLength(0)
      })

      test("once set up, its id, and a secret that only says Saved", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const posts: unknown[] = []
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/auth/oauth-config": (_url: URL, request: Request) => {
            if (request.method() === "POST") posts.push(request.postDataJSON())
            return { msg: "ok", data: OAUTH }
          },
        })
        await page.goto("/app/admin?tab=integrations#integrations-oauth-microsoft", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const card = page.getByLabel("Microsoft app for Outlook Calendar")
        await expect(card).toBeVisible({ timeout: 240_000 })
        const id = page.getByLabel("Client ID for Microsoft")
        const secret = page.getByLabel("Client secret for Microsoft")
        await expect(id).toHaveValue(OAUTH.microsoft_client_id)
        await expect(secret).toHaveValue("")
        await expect(secret).toHaveAttribute("placeholder", "Saved")
        await expect(card.getByRole("button", { name: "Copy redirect address" })).toBeInViewport({ timeout: 20_000 })
        expect(posts).toHaveLength(0)
      })
    })
  }
}
