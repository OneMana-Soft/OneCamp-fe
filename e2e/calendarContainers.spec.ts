import { expect, test, type Browser, type Locator, type Request, type TestInfo } from "@playwright/test"

import { JONAS, LAUNCH, MAYA, ME, VIEWS, channel, openChannel, type View } from "./channelPage"
import { CALENDAR_READS, SHOT_THEMES, reviewShot, tidy, withStatus } from "./stubbedApp"

// gcal-14: a project's, a channel's and a team's own calendar. Each opens from
// where its container lives, through the one opener (POST
// /calendar/{projects|channels|teams}/{id}/calendar, then the calendar showing
// it). Such a calendar fills itself from the work: a project's dated tasks and
// milestones, a channel's linked tasks, a team's time off ("Away"). Those
// entries come read only with their source: drawn apart, never dragged, their
// card opens the source. Its row names its container and the level the server
// gives, says what fills it while nothing is dated, and says Couldn't load
// (never an empty calendar) when its entries couldn't be read. In settings,
// each person's own switch for whether others see when they're busy; a
// workspace that shows nobody's busy times keeps it off. Head A's routes are
// not live, so they are stubbed here. With SHOTS_DIR set, three states are
// saved at 1280 and 390, light and dark (18 frames).

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

const TEAM = "0c4a0000-0000-4000-8000-0000000000e1"
const PROJECT = "0c4a0000-0000-4000-8000-0000000000d1"
const TASK = "0c4a0000-0000-4000-8000-0000000000c1"
const MILESTONE = "0c4a0000-0000-4000-8000-0000000000c2"
const AWAY = `away:${MAYA.user_uuid}:${Math.floor(new Date(at(21, 13)).getTime() / 1000)}`

const CALENDARS = [
  { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true, source: "onecamp" },
  { id: "cal-launch", name: "Launch", kind: "project", container_kind: "project", container_id: PROJECT, access: "edit", source: "onecamp" },
  { id: "cal-channel", name: "launch", kind: "channel", container_kind: "channel", container_id: LAUNCH, access: "view", source: "onecamp" },
  { id: "cal-team", name: "Design team", kind: "team", container_kind: "team", container_id: TEAM, access: "edit", source: "onecamp" },
]

/** What the work fills them with, as head A's events read answers it: read only, with a source, ids no event has. */
const day = (kind: "task" | "milestone", id: string, title: string) => ({
  id: `${kind}:${id}`, calendar_id: "cal-launch", kind: "event", title, start: { date: "2026-10-21" }, end: { date: "2026-10-22" }, all_day: true,
  transparency: "transparent", visibility: "default", read_only: true, source: { kind, id },
})
const DERIVED = [
  day("task", TASK, "Write launch notes"),
  day("milestone", MILESTONE, "Beta ships"),
  { id: AWAY, calendar_id: "cal-team", kind: "out_of_office", title: "Away", start: { at: at(21, 13), zone: "UTC" }, end: { at: at(21, 17), zone: "UTC" }, all_day: false,
    visibility: "default", organiser: { user_uuid: MAYA.user_uuid }, read_only: true, source: { kind: "person", id: MAYA.user_uuid } },
]

const team = { id: "0x7e1", team_uuid: TEAM, team_name: "Design team", team_is_admin: false, team_is_member: true, team_member_count: 3, team_members: [MAYA, JONAS, ME], team_projects: [] }

/** Every write the calendar sends, so a test can say none went. */
type Sent = { method: string; path: string; body?: unknown }

/** The calendar's reads, head A's container routes and free/busy, with `events` for the week's read of others'. */
function answers(sent: Sent[], events: () => unknown, freebusy = { hidden: false, workspace: true }) {
  const keep = (r: Request) => sent.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postDataJSON?.() ?? undefined })
  let putFails = 0
  const table = {
    ...CALENDAR_READS,
    "/calendar/calendars/events": events,
    "/calendar/calendars": { msg: "ok", data: CALENDARS },
    "/calendar/subscriptions": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0, available: true } },
    "/calendar/sync/microsoft": { msg: "ok", data: { provider: "microsoft", state: "none", progress: 0, moved: 0, unchanged: 0, available: true } },
    "/connectors": { msg: "ok", data: { connectors: [{ id: "microsoft_calendar", name: "Outlook Calendar", connected: false }] } },
    "/config/client": { msg: "ok", data: { features: {} } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/getEvents": { msg: "ok", data: [{ event_uuid: "e-review", event_title: "Design review", event_start_time: at(21, 11), event_end_time: at(21, 12), event_calendar_id: "cal-me" }] },
    // Head A: the container's own calendar, made the first time, to anyone who may read the container.
    [`/calendar/channels/${LAUNCH}/calendar`]: (_: URL, r: Request) => (keep(r), { msg: "ok", data: { id: "cal-channel" } }),
    [`/calendar/teams/${TEAM}/calendar`]: (_: URL, r: Request) => (keep(r), { msg: "ok", data: { id: "cal-team" } }),
    // Head A: the person's own choice; a PUT answers what is kept. `failPut` makes the next PUT a 500.
    "/calendar/freebusy": (_: URL, r: Request) => {
      if (r.method() === "PUT") {
        keep(r)
        if (putFails-- > 0) return withStatus(500, { msg: "Something went wrong. Try again in a moment." })
        freebusy = { ...freebusy, hidden: !!(r.postDataJSON() as { hidden?: boolean }).hidden }
      }
      return { msg: "ok", data: freebusy }
    },
    // Any other write to an event: none should go.
    "/calendar/events": (_: URL, r: Request) => (keep(r), withStatus(500, { msg: "No write was expected" })),
    "/event/": (_: URL, r: Request) => (keep(r), withStatus(500, { msg: "No write was expected" })),
    [`/team/info/${TEAM}`]: { msg: "ok", data: team },
    [`/ch/channelInfoWithMemberAdminFlag/${LAUNCH}`]: { msg: "ok", channel_info: { ...channel, ch_members: [MAYA, JONAS, ME] } },
    "/user/usersListNotBelongToChannelId": { msg: "ok", users: [] },
    [`/conversations/channel/${LAUNCH}/broadcasts`]: { msg: "ok", data: { members_may: true, own: false, manages: true } },
    "/guest/links": { msg: "ok", data: [] },
    "/user/preferences": { msg: "ok", data: {} },
  }
  return { table, failNextPut: () => void (putFails = 1) }
}

const stubs = (a: ReturnType<typeof answers>) => a.table

const writes = (sent: Sent[]) => sent.filter((s) => s.method !== "GET" && !s.path.includes("/freebusy"))

async function openCalendar(browser: Browser, testInfo: TestInfo, view: View, scheme: string, events: () => unknown) {
  const sent: Sent[] = []
  const tab = await openChannel(browser, testInfo, view, scheme, () => stubs(answers(sent, events)), (t) => t.clock.setFixedTime(NOW))
  await tab.goto(`/app/calendar?date=2026-10-21&view=${view.phone ? "day" : "week"}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.locator("[data-period]")).toBeVisible({ timeout: 120_000 })
  await tidy(tab)
  return { tab, sent }
}

const ok = () => ({ msg: "ok", data: DERIVED, truncated: false })

for (const scheme of SHOT_THEMES) {
  for (const view of VIEWS) {
    test.describe(`project, channel and team calendars at ${view.name}, ${scheme}`, () => {
      const press = (l: Locator) => (view.phone ? l.tap() : l.click())

      test("(a) a channel's and a team's own calendar open from where they live; offline asks nothing", async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        const sent: Sent[] = []
        const tab = await openChannel(browser, testInfo, view, scheme, () => stubs(answers(sent, ok)), (t) => t.clock.setFixedTime(NOW))
        if (view.phone) {
          await tab.getByRole("button", { name: "Channel options" }).click()
          await tab.getByRole("button", { name: "Details and members" }).click()
        } else {
          await tab.getByRole("button", { name: "Channel details" }).click()
        }
        const opener = tab.getByRole("button", { name: "Open channel calendar" })
        await expect(opener).toBeVisible({ timeout: 30_000 })
        // Offline: it asks the server nothing and says why.
        await tab.context().setOffline(true)
        await press(opener)
        await expect(tab.locator(".toast-root").filter({ hasText: "You're offline. Open it when you're back online." })).toBeVisible()
        expect(sent.filter((s) => s.path.endsWith("/calendar")), "no calendar was asked for offline").toEqual([])
        await tab.context().setOffline(false)
        await press(opener)
        await tab.waitForURL(/\/app\/calendar(\?|$)/, { timeout: 60_000 })
        expect(sent.map((s) => `${s.method} ${s.path}`)).toContain(`POST /calendar/channels/${LAUNCH}/calendar`)
        // The calendar shows it, and drops the address's ?calendar= once it has.
        await expect(tab.locator("[data-period]")).toBeVisible({ timeout: 120_000 })
        // V-1043: the channel's details closed as its calendar opened.
        await expect(opener).toBeHidden()
        await reviewShot(tab, "v1043-channel-calendar-opened", scheme)
        await expect.poll(() => new URL(tab.url()).searchParams.get("calendar")).toBeNull()
        // basecamp-05: that calendar alone; the others are hidden here, a tick away in the panel.
        const hidden = JSON.parse((await tab.evaluate(() => localStorage.getItem("onecamp:calendars-hidden"))) || "[]") as string[]
        expect(hidden).not.toContain("cal-channel")
        expect(hidden).toEqual(expect.arrayContaining(["onecamp", "cal-launch", "cal-team"]))
        // The team's, from the team page.
        await tab.goto(`/app/team/${TEAM}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await press(tab.getByRole("button", { name: "Team calendar" }))
        await tab.waitForURL(/\/app\/calendar(\?|$)/, { timeout: 60_000 })
        expect(sent.map((s) => `${s.method} ${s.path}`)).toContain(`POST /calendar/teams/${TEAM}/calendar`)
        await tab.context().close()
      })

      test("(b) what the work fills in is drawn apart, never moved, and its card opens its source", async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        const { tab, sent } = await openCalendar(browser, testInfo, view, scheme, ok)
        const task = tab.locator("[data-derived='task']").first()
        const milestone = tab.locator("[data-derived='milestone']").first()
        const away = tab.locator("[data-derived='person']").first()
        for (const [block, words] of [[task, "Write launch notes"], [milestone, "Beta ships"], [away, "Away"]] as const) {
          await expect(block).toBeVisible({ timeout: 30_000 })
          await expect(block).toContainText(words)
        }
        // Where each comes from, for a screen reader too.
        await expect(task).toContainText("A task in Launch")
        await expect(away).toContainText("Time off, on Design team's calendar")
        // Never moved: a drag at 1280 sends nothing and leaves it where it was (calendarPieces.test holds every view).
        if (!view.phone) {
          // Probe (W3): the grid's scroll and the block's place inside it, before and after the drag try.
          const probe = () => away.evaluate((el) => {
            let g = el.parentElement
            while (g && !(g.scrollHeight > g.clientHeight && /(auto|scroll)/.test(getComputedStyle(g).overflowY))) g = g.parentElement
            const r = el.getBoundingClientRect()
            return { y: Math.round(r.top), scrollTop: g ? Math.round(g.scrollTop) : null, inGrid: g ? Math.round(r.top - g.getBoundingClientRect().top + g.scrollTop) : null, page: Math.round(window.scrollY) }
          })
          const p0 = await probe()
          const before = (await away.boundingBox())!
          await away.hover()
          await tab.mouse.down()
          await tab.mouse.move(before.x + before.width / 2, before.y + before.height / 2 + 90, { steps: 8 })
          await tab.mouse.up()
          await tab.waitForTimeout(500)
          expect(writes(sent), "nothing was written for a derived entry").toEqual([])
          await tab.keyboard.press("Escape")
          const p1 = await probe()
          console.log(`W3 PROBE ${testInfo.project.name} ${scheme} before ${JSON.stringify(p0)} after ${JSON.stringify(p1)}`)
          await expect.poll(async () => (await away.boundingBox())?.y).toBe(before.y)
          await expect(tab.locator("[data-event-card]")).toHaveCount(0)
        }
        // The task's card: where it comes from, its source to open, nothing to change.
        await press(task)
        const card = tab.locator("[data-event-card]")
        await expect(card).toContainText("Write launch notes", { timeout: 20_000 })
        await expect(card.locator("[data-card-source='task']")).toContainText("A task in Launch")
        const link = card.locator("[data-card-source-link]")
        await expect(link).toHaveText(/Open task/)
        await expect(link).toHaveAttribute("href", `/app/task/${TASK}`)
        await expect(card.getByRole("button", { name: /^(Edit|More|Delete)/ })).toHaveCount(0)
        if (view.phone) await expect(tab.locator("[data-event-sheet][data-pinned-foot]")).toHaveCount(1)
        await reviewShot(tab, "g14-b-task-card", scheme)
        await tab.keyboard.press("Escape")
        await expect(card).toHaveCount(0)
        // The milestone's opens its project's updates.
        await press(milestone)
        await expect(card.locator("[data-card-source='milestone']")).toContainText("A milestone of Launch", { timeout: 20_000 })
        await expect(card.locator("[data-card-source-link]")).toHaveAttribute("href", new RegExp(PROJECT))
        await tab.keyboard.press("Escape")
        await expect(card).toHaveCount(0)
        // CR-295 F1: a plain event's card pins its Open details at the sheet's foot too, where the fade never reaches.
        if (view.phone) {
          await press(tab.locator("[data-calendar] [data-event-uuid='e-review']").first())
          await expect(card).toContainText("Design review", { timeout: 20_000 })
          await expect(card.locator("[data-card-footer]").getByRole("button", { name: "Open details" })).toBeVisible()
          await expect(tab.locator("[data-event-sheet][data-pinned-foot]")).toHaveCount(1)
          await reviewShot(tab, "g14-b-plain-card", scheme)
          await tab.keyboard.press("Escape")
          await expect(card).toHaveCount(0)
        }
        // Time off opens the person.
        await press(away)
        const profile = card.locator("[data-card-source-link]")
        await expect(profile).toHaveText(/Open profile/, { timeout: 20_000 })
        await press(profile)
        await tab.waitForURL(new RegExp(`/app/user/${MAYA.user_uuid}`), { timeout: 60_000 })
        expect(writes(sent)).toEqual([])
        await tab.context().close()
      })

      test("(c) its row names its container and level, says what fills it, and says Couldn't load when its entries couldn't be read", async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        let fail = false
        const { tab } = await openCalendar(browser, testInfo, view, scheme, () => (fail ? withStatus(500, { msg: "Internal Server Error" }) : ok()))
        if (view.phone) {
          await tab.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
          const theirs = tab.locator("[data-drawer-other-calendars]")
          for (const [name, words] of [
            ["Launch", "Can edit · Shared with the project's members"],
            // CR-295 G1: nothing dated this week, so it says what fills it, as the panel does.
            ["launch", "View only · Tasks linked from its messages show here"],
            ["Design team", "Can edit · Shared with the team's members"],
          ] as const) {
            const row = theirs.locator("button", { hasText: words })
            await expect(row).toHaveCount(1)
            await expect(row).toContainText(name)
            await expect(row.getByRole("switch", { name: `Show ${name}` })).toBeVisible()
          }
          expect(await tab.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
          await reviewShot(tab, "g14-c-calendars", scheme)
          await tab.getByRole("button", { name: "Done" }).click()
        } else {
          await tab.getByRole("button", { name: /^Calendars/ }).click()
          const panel = tab.locator("[data-calendars-panel]")
          const row = (id: string) => panel.locator(`[data-calendar-row='${id}']`)
          await expect(row("cal-launch").locator("[data-container='project']")).toBeVisible()
          await expect(row("cal-launch")).toContainText("2 this week")
          await expect(row("cal-team").locator("[data-container='team']")).toBeVisible()
          await expect(row("cal-channel").locator("[data-container='channel']")).toBeVisible()
          await expect(row("cal-channel").locator("[data-calendar-empty]")).toHaveText("Tasks linked from its messages show here")
          await row("cal-channel").hover()
          await row("cal-channel").getByRole("button", { name: "launch options" }).click()
          const menu = tab.getByRole("menu")
          await expect(menu.locator("[data-calendar-container='channel']")).toContainText("View only")
          await expect(menu.locator("[data-calendar-container='channel']")).toContainText("Shared with the channel's members")
          await expect(tab.getByRole("menuitem", { name: /Share/ })).toHaveCount(0)
          await reviewShot(tab, "g14-c-calendars", scheme)
          await tab.keyboard.press("Escape")
        }
        // Its entries couldn't be read: an error, never an empty calendar.
        fail = true
        await tab.reload({ waitUntil: "domcontentloaded" })
        await expect(tab.locator("[data-period]")).toBeVisible({ timeout: 120_000 })
        await expect(tab.getByText("Couldn't load the calendars beside yours, so their busy times aren't shown.")).toBeVisible({ timeout: 60_000 })
        await expect(tab.locator("[data-derived]")).toHaveCount(0)
        if (view.phone) {
          // Nor does the phone's row say what fills it: it can't know.
          await tab.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
          const theirs = tab.locator("[data-drawer-other-calendars]")
          await expect(theirs.locator("button", { hasText: "View only · Shared with the channel's members" })).toHaveCount(1)
          await expect(theirs).not.toContainText("show here")
          await reviewShot(tab, "g14-c-calendars-failed", scheme)
          await tab.getByRole("button", { name: "Done" }).click()
        } else {
          await tab.getByRole("button", { name: /^Calendars/ }).click()
          const panel = tab.locator("[data-calendars-panel]")
          for (const id of ["cal-launch", "cal-channel", "cal-team"]) {
            await expect(panel.locator(`[data-calendar-row='${id}']`)).toContainText("Couldn't load")
            await expect(panel.locator(`[data-calendar-row='${id}'] [data-calendar-empty]`)).toHaveCount(0)
          }
        }
        await tab.context().close()
      })

      test("(d) your own switch for whether others see when you're busy: on, off, not saved, offline, and the workspace's no", async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        const sent: Sent[] = []
        const a = answers(sent, ok)
        const tab = await openChannel(browser, testInfo, view, scheme, () => stubs(a), (t) => t.clock.setFixedTime(NOW))
        await tab.goto("/app/settings/profile", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const busy = tab.getByRole("switch", { name: "Show when you're busy" })
        await busy.scrollIntoViewIfNeeded({ timeout: 120_000 })
        await expect(busy).toBeChecked()
        await press(busy)
        await expect(busy).not.toBeChecked()
        await expect.poll(() => sent.filter((s) => s.method === "PUT").map((s) => s.body)).toEqual([{ hidden: true }])
        // The change is offered back, as the other profile switches' are: Undo shows your busy times again.
        const offered = tab.locator(".toast-card").filter({ hasText: "Show when you're busy: Off" })
        await expect(offered.getByRole("button", { name: "Undo" })).toBeVisible({ timeout: 20_000 })
        if (view.phone) await reviewShot(tab, "g14-d-busy-undo", scheme)
        await press(offered.getByRole("button", { name: "Undo" }))
        await expect(busy).toBeChecked({ timeout: 20_000 })
        await expect.poll(() => sent.filter((s) => s.method === "PUT").map((s) => s.body)).toEqual([{ hidden: true }, { hidden: false }])
        await expect(tab.locator(".toast-card").filter({ hasText: "Undone" })).toBeVisible()
        // A save that doesn't hold goes back and says so.
        a.failNextPut()
        await press(busy)
        const section = tab.locator("#profile-freebusy")
        await expect(section).toContainText("Not saved", { timeout: 20_000 })
        await expect(busy).toBeChecked()
        // Offline it asks nothing and says it can't save now.
        await tab.context().setOffline(true)
        const puts = sent.filter((s) => s.method === "PUT").length
        await press(busy)
        await expect(section).toContainText("You're offline. This can't be saved now.")
        await expect(busy).toBeChecked()
        expect(sent.filter((s) => s.method === "PUT").length).toBe(puts)
        await tab.context().setOffline(false)
        await tab.context().close()
        // A workspace that shows nobody's busy times: off, can't be changed, one line says why.
        const off = await openChannel(browser, testInfo, view, scheme, () => stubs(answers([], ok, { hidden: false, workspace: false })), (t) => t.clock.setFixedTime(NOW))
        await off.goto("/app/settings/profile", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const locked = off.getByRole("switch", { name: "Show when you're busy" })
        await locked.scrollIntoViewIfNeeded({ timeout: 120_000 })
        await expect(locked).not.toBeChecked()
        await expect(locked).toBeDisabled()
        await expect(off.locator("#profile-freebusy")).toContainText("Your workspace keeps everyone's busy times private.")
        await reviewShot(off, "g14-d-busy-times", scheme)
        await off.context().close()
      })
    })
  }
}

