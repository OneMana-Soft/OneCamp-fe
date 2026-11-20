import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { takesAFinger } from "./menuReach"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// gcal-new-event-notes, head B: each call an event kept shows its recap (its
// words, by section) and its action items under its own line in
// "Recordings & notes", for the event and for an instance of a series, as
// GET /calendar/events/{id}/call/artefacts answers them. Whoever may change
// the event has Make task on each item: it reads their projects, picks one
// inline (a native select, no overlay), and POSTs
// .../artefacts/{key}/action-items/{index}/task; the list reads again and the
// item shows its task. Projects that won't load say so (offline said), with
// Try again; no project says that. A guest who may only read the event
// reads the recap, with no Make task and no switch; a call with no recap
// shows none.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }

const WEEKLY = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c31"
// One instance of Sam's daily standup (calendar A7's instance id).
const STANDUP = "0c1d2e3f-0000-4000-8000-00000000d031_20261021T033000Z"
const QUIET = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c32"
const RETRO = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c33"
const BOOKED = "7a5c0000-0000-4000-8000-0000000000f1"
const MADE = "7a5c0000-0000-4000-8000-0000000000f2"
const LAUNCH = "9b0d0000-0000-4000-8000-0000000000c1"
const WEBSITE = "9b0d0000-0000-4000-8000-0000000000c2"
const SECTION = "Recordings & notes"
const GUEST = "dana@client.test"

/**
 * Who each event invites, as both reads serve them from the server's one
 * store (the row's event_guests, the calendar's attendees): its members, and
 * a guest by email on all but Quiet sync. The standup's is Alex Kim, with the
 * address the public demo serves a visitor: "" (helpers/demoPrivacy.go).
 */
function guestsOf(id: string, members: { user_uuid: string; user_name: string }[]) {
  const byEmail = id === QUIET ? [] : [id === STANDUP ? { email: "", name: "Alex Kim" } : { email: GUEST }]
  return [
    ...members.map((m) => ({ user_uuid: m.user_uuid, name: m.user_name, role: "required", response: "accepted" })),
    ...byEmail.map((g) => ({ ...g, role: "required", response: "needs_action" })),
  ]
}

function events() {
  return listed().map((e) => ({ ...e, event_guests: guestsOf(e.event_uuid, e.event_participants) }))
}

function listed() {
  return [
    { event_uuid: WEEKLY, event_title: "Weekly design review", event_start_time: at(21, 8), event_end_time: at(21, 8, 45), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: STANDUP, event_title: "Standup", event_start_time: at(21, 9), event_end_time: at(21, 9, 15), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: QUIET, event_title: "Quiet sync", event_start_time: at(21, 11), event_end_time: at(21, 11, 30), event_created_by: ME, event_participants: [MAYA] },
    // Maya's, with Sam a guest she doesn't let change it.
    { event_uuid: RETRO, event_title: "Sprint retro", event_start_time: at(21, 16), event_end_time: at(21, 16, 30), event_created_by: MAYA, event_participants: [ME] },
  ]
}

const RECAP = "## 📝 Summary\n- The beta build went out this morning.\n- **Pricing copy** is final.\n\n## ✅ Decisions\n1. The design review moves to Thursday."

/** What the calendar kept of each event's calls, newest first; each item's task as the server has it now. */
function kept(made: Record<string, string>): Record<string, unknown[]> {
  const items = (id: string, key: string, list: { text: string; owner?: string; due?: string; task?: string }[]) =>
    list.map((it, i) => ({ ...it, ...(made[`${id} ${key} ${i}`] ? { task: made[`${id} ${key} ${i}`] } : {}) }))
  return {
    [WEEKLY]: [
      {
        key: "EG_today", started_at: at(21, 8, 2), ended_at: at(21, 8, 44), lines: 120, recorded: true, recap: RECAP,
        action_items: items(WEEKLY, "EG_today", [
          { text: "Post the pricing copy", owner: "Maya Chen", due: "2026-10-23" },
          { text: "Book a room for Thursday's review", owner: "Sam Rivera", task: BOOKED },
        ]),
      },
    ],
    [STANDUP]: [
      {
        key: "EG_standup", started_at: at(21, 9), ended_at: at(21, 9, 12), lines: 40, recorded: false, recap: "**🚧 Blockers**\n- The staging database is full.",
        action_items: items(STANDUP, "EG_standup", [{ text: "Clear old staging snapshots", due: "2026-10-22" }]),
      },
    ],
    // Recorded with no recap: none was written.
    [QUIET]: [{ key: "EG_quiet", started_at: at(20, 11), ended_at: at(20, 11, 20), lines: 0, recorded: true }],
    [RETRO]: [
      {
        key: "EG_retro", started_at: at(14, 16), ended_at: at(14, 16, 25), lines: 30, recorded: true, recap: "- Deploys felt slow.",
        action_items: [{ text: "Time the deploy steps", owner: "Maya Chen", task: BOOKED }, { text: "Pick a retro format" }],
      },
    ],
  }
}

type Projects = "ok" | "fail" | "none"

/**
 * The calendar's day as Sam reads it. asked: the Make task posts, as
 * "<event> <key> <index> <project>"; reads: GET /user/userProjectList asked. projects says
 * how that read answers; refuseTask answers Make task as the server refuses
 * a project that won't take the person's tasks (403, its words).
 */
async function openDay(page: Page, testInfo: TestInfo) {
  const s = { asked: [] as string[], reads: 0, projects: "ok" as Projects, refuseTask: false }
  const made: Record<string, string> = {}
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": () => ({ msg: "ok", data: events() }),
    "/event/getEvent/": (url: URL) => ({ msg: "ok", data: events().find((e) => e.event_uuid === decodeURIComponent(url.pathname.split("/").pop() ?? "")) }),
    "/user/userProjectList": () => {
      s.reads++
      if (s.projects === "fail") return withStatus(503, { msg: "Service unavailable" })
      return { msg: "ok", data: { user_projects: s.projects === "none" ? [] : [{ project_uuid: LAUNCH, project_name: "Launch" }, { project_uuid: WEBSITE, project_name: "Website" }] } }
    },
    "/calendar/events/": (url: URL, request: Request) => {
      const parts = url.pathname.split("/").map(decodeURIComponent)
      // POST /calendar/events/{id}/call/artefacts/{key}/action-items/{index}/task
      if (request.method() === "POST" && parts.at(-1) === "task" && parts.at(-3) === "action-items") {
        const [id, key, index] = [parts.at(-7) ?? "", parts.at(-4) ?? "", parts.at(-2) ?? ""]
        const project = (request.postDataJSON() as { project_uuid?: string }).project_uuid
        s.asked.push(`${id} ${key} ${index} ${project}`)
        if (s.refuseTask) return withStatus(403, { msg: "You can't add tasks to that project: project 'Website'." })
        made[`${id} ${key} ${index}`] = MADE
        return { msg: "ok", data: { task_uuid: MADE } }
      }
      if (parts.at(-1) === "artefacts" && parts.at(-2) === "call") return { msg: "ok", data: kept(made)[parts.at(-3) ?? ""] ?? [] }
      const e = events().find((x) => x.event_uuid === parts.at(-1))
      // Weekly and the retro have Dana, invited by email, the standup Alex Kim; Quiet sync has Maya alone.
      const attendees = e?.event_guests ?? []
      return {
        msg: "ok",
        data: e ? { id: e.event_uuid, title: e.event_title, notes: "", start: { at: e.event_start_time, zone: "Europe/London" }, end: { at: e.event_end_time }, all_day: false, sequence: 1, kind: "event", attendees, organiser: { user_uuid: e.event_created_by.user_uuid }, email_on_answers: false } : null,
      }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${WEEKLY}"]`).first()).toBeVisible({ timeout: 60_000 })
  return s
}

const card = (page: Page) => page.locator("[data-event-card]")
const sectionOf = (page: Page) => page.locator("[data-event-panel]").getByRole("region", { name: SECTION })
/** Each call's own line in the section (its recap's lists are inside it). */
const callsOf = (section: Locator) => section.locator("ul").first().locator(":scope > li")
const toastOf = (page: Page, title: string) => page.locator(".toast-card").filter({ hasText: title })

for (const theme of SHOT_THEMES) {
  for (const width of [1280, 390]) {
    const phone = width < 600
    test.describe(`an event's call recaps at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      const press = async (target: Locator) => (phone ? target.tap() : target.click())
      // Look F1: at 1280 an item's Make task goes by the keys, and each step leaves the focus on the next control.
      const choose = async (target: Locator) => (phone ? target.tap() : target.press("Enter"))
      // A guest still asked "Going?" has their answer at the card's foot: they open it from More.
      const openDetails = async (page: Page, id: string, asked = false) => {
        await press(page.locator(`[data-event-uuid="${id}"]`).first())
        if (!asked) return press(card(page).getByRole("button", { name: "Open details" }))
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Open", exact: true }))
      }

      test("shows a call's recap and action items, and makes an item a task in the project picked inline", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const s = await openDay(page, testInfo)
        await openDetails(page, WEEKLY)
        const section = sectionOf(page)
        const call = callsOf(section)
        await expect(call).toHaveCount(1, { timeout: 30_000 })
        const recap = call.getByRole("region", { name: "Recap" })
        // Its words by section: headings without their emoji or markers, points without theirs.
        await expect(recap.getByRole("heading", { name: "Summary" })).toBeVisible()
        await expect(recap.getByRole("heading", { name: "Decisions" })).toBeVisible()
        await expect(recap).toContainText("Pricing copy is final.")
        await expect(recap).not.toContainText("**")
        await expect(recap).toContainText("The design review moves to Thursday.")
        const items = recap.locator("[data-action-item]")
        await expect(items).toHaveCount(2)
        await expect(items.nth(0)).toContainText("Maya Chen")
        await expect(items.nth(0)).toContainText("Due 23 Oct")
        // The second is a task already: its chip opens it, with no Make task.
        await expect(items.nth(1).getByRole("link", { name: "Open task: Book a room for Thursday's review" })).toHaveAttribute("href", `/app/task/${BOOKED}`)
        await expect(items.nth(1).getByRole("button", { name: /Make task/ })).toHaveCount(0)
        const make = items.nth(0).getByRole("button", { name: "Make task: Post the pricing copy" })
        if (phone) {
          await make.scrollIntoViewIfNeeded()
          expect(await takesAFinger(make, items.nth(0))).toBe(true)
        }
        await reviewShot(page, "event-recap", theme)

        const overlays = await page.getByRole("dialog").count()
        await choose(make)
        const project = items.nth(0).getByRole("combobox", { name: "Project for the task" })
        await expect(project).toHaveValue(LAUNCH, { timeout: 30_000 })
        if (!phone) await expect(project).toBeFocused()
        // Picked where the item is: no dialog or sheet opens for it.
        await expect(page.getByRole("dialog")).toHaveCount(overlays)
        if (phone) expect((await project.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
        await project.selectOption(WEBSITE)
        await reviewShot(page, "event-recap-pick", theme)
        await choose(items.nth(0).getByRole("button", { name: "Make", exact: true }))
        // The list reads again, and the item shows its task, which takes the focus.
        const task = items.nth(0).getByRole("link", { name: "Open task: Post the pricing copy" })
        await expect(task).toHaveAttribute("href", `/app/task/${MADE}`, { timeout: 30_000 })
        if (!phone) await expect(task).toBeFocused()
        await expect(items.nth(0).getByRole("combobox")).toHaveCount(0)
        await expect(recap.getByRole("button", { name: /Make task/ })).toHaveCount(0)
        expect(s.asked).toEqual([`${WEEKLY} EG_today 0 ${WEBSITE}`])
        expect(s.reads).toBe(1)
      })

      test("on an instance of a series: its call's recap, and projects that won't load, offline, or aren't there", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const s = await openDay(page, testInfo)
        await openDetails(page, STANDUP)
        const call = callsOf(sectionOf(page))
        await expect(call).toHaveCount(1, { timeout: 30_000 })
        const recap = call.getByRole("region", { name: "Recap" })
        await expect(recap.getByRole("heading", { name: "Blockers" })).toBeVisible()
        await expect(recap).toContainText("The staging database is full.")
        const item = recap.locator("[data-action-item]")
        await expect(item).toHaveCount(1)
        await expect(item).toContainText("Due 22 Oct")

        // The projects won't load: said, with Try again.
        s.projects = "fail"
        await choose(item.getByRole("button", { name: "Make task: Clear old staging snapshots" }))
        await expect(item.getByRole("alert")).toHaveText(/^Couldn't load your projects\./, { timeout: 30_000 })
        if (!phone) await expect(item.getByRole("button", { name: "Try again" })).toBeFocused()
        // Offline: said so.
        await page.context().setOffline(true)
        await press(item.getByRole("button", { name: "Try again" }))
        await expect(item.getByRole("alert")).toContainText("You're offline. Couldn't load your projects.", { timeout: 30_000 })
        await reviewShot(page, "event-recap-offline", theme)
        // Back online, in no project: said so, and Close puts Make task back.
        await page.context().setOffline(false)
        s.projects = "none"
        await choose(item.getByRole("button", { name: "Try again" }))
        await expect(item).toContainText("You're in no project to add it to.", { timeout: 30_000 })
        if (!phone) await expect(item.getByRole("button", { name: "Close" })).toBeFocused()
        await choose(item.getByRole("button", { name: "Close" }))
        await expect(item.getByRole("button", { name: "Make task: Clear old staging snapshots" })).toBeVisible()
        if (!phone) await expect(item.getByRole("button", { name: "Make task: Clear old staging snapshots" })).toBeFocused()
        expect(s.asked).toEqual([])
        // F2: the server refuses the task (a project that won't take the person's tasks): said in its words, and
        // the item keeps its picker, with no task.
        s.projects = "ok"
        s.refuseTask = true
        await choose(item.getByRole("button", { name: "Make task: Clear old staging snapshots" }))
        const project = item.getByRole("combobox", { name: "Project for the task" })
        await expect(project).toHaveValue(LAUNCH, { timeout: 30_000 })
        await project.selectOption(WEBSITE)
        const make = item.getByRole("button", { name: "Make", exact: true })
        await choose(make)
        const refused = toastOf(page, "Couldn't make the task")
        await expect(refused).toBeVisible({ timeout: 30_000 })
        await expect(refused).toContainText("You can't add tasks to that project")
        await expect(project).toBeVisible()
        await expect(make).not.toHaveAttribute("aria-busy", "true")
        if (!phone) await expect(make).toBeFocused()
        await expect(item.getByRole("link", { name: /Open task/ })).toHaveCount(0)
        expect(s.asked).toEqual([`${STANDUP} EG_standup 0 ${WEBSITE}`])
      })

      test("a guest who may only read the event reads the recap, with no Make task and no switch; a call with no recap shows none", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const s = await openDay(page, testInfo)
        await openDetails(page, RETRO, true)
        const section = sectionOf(page)
        const recap = callsOf(section).getByRole("region", { name: "Recap" })
        await expect(recap).toContainText("Deploys felt slow.", { timeout: 30_000 })
        await expect(recap.locator("[data-action-item]")).toHaveCount(2)
        await expect(recap.getByRole("link", { name: "Open task: Time the deploy steps" })).toHaveAttribute("href", `/app/task/${BOOKED}`)
        await expect(recap.getByRole("button", { name: /Make task/ })).toHaveCount(0)
        await expect(section.getByRole("switch")).toHaveCount(0)

        // Sam's own Quiet sync: its call kept no recap, and nobody is invited by email.
        await page.goto(`/app/calendar?date=2026-10-21&view=day`, { waitUntil: "domcontentloaded" })
        await openDetails(page, QUIET)
        await expect(callsOf(sectionOf(page))).toHaveCount(1, { timeout: 30_000 })
        await expect(sectionOf(page).getByRole("region", { name: "Recap" })).toHaveCount(0)
        await expect(sectionOf(page).getByRole("switch")).toHaveCount(0)
        expect(s.reads).toBe(0)
      })
    })
  }
}
