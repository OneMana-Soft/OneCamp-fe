import { expect, type Page, type Request, type TestInfo } from "@playwright/test"

import { leavesApp } from "../scripts/fluidity/appServers.mjs"
import { brokerFor } from "../scripts/fluidity/fakeBroker.mjs"

/**
 * The signed-in app in a real browser, with no backend: every request that
 * leaves the app's own origin is answered here, and no websocket reaches
 * anything. For checks only a browser can make (layout, computed style) on
 * pages behind sign-in. It never touches a real server, whatever the build's
 * backend URL is (the demo's, a customer's).
 */

/** The signed-in person. A uuid, as the profile schema requires. */
export const SAM = {
  user_uuid: "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b",
  user_name: "sam",
  user_full_name: "Sam Rivera",
  user_email_id: "sam@example.com",
  user_is_admin: false,
}

export type Answers = Record<string, unknown>

const STATUS = Symbol("status")

/**
 * An answer with a status of its own (a 410, a 500), or 0 for no answer at
 * all (the network failed); any other answer is a 200.
 */
export function withStatus(status: number, json: unknown) {
  return { [STATUS]: status, json }
}

/**
 * A thread's createComment behind the server's send-once guard (V-1088): one
 * reply per client_msg_id, and the same comment_id answered again for it. The
 * first send fails as `first` says: "500" writes nothing; "lost" writes the
 * reply and its answer never arrives. `sent` holds every body taken, `written`
 * each reply the server holds.
 */
export function sendOnceReplies(first: "500" | "lost", commentId: (n: number) => string) {
  const sent: Record<string, unknown>[] = []
  const written = new Map<string, string>()
  const answer = (_url: URL, request: Request) => {
    const body = request.postDataJSON() as Record<string, unknown>
    sent.push(body)
    if (sent.length === 1 && first === "500") return withStatus(500, { msg: "Something went wrong" })
    const key = typeof body.client_msg_id === "string" ? body.client_msg_id : `none-${sent.length}`
    if (!written.has(key)) written.set(key, commentId(written.size))
    if (sent.length === 1) return withStatus(0, {})
    return { msg: "ok", data: { comment_id: written.get(key), comment_created_at: new Date().toISOString() } }
  }
  return { answer, sent, written }
}

const HEADERS = Symbol("headers")

/**
 * An answer with headers of its own (a download's counts and parts), which the
 * app may read: each is exposed to it, as the API's CORS exposes it.
 */
export function withHeaders(headers: Record<string, string>, json: unknown, status = 200) {
  return { [STATUS]: status, [HEADERS]: headers, json }
}

function statusOf(answer: unknown): { status: number; json: unknown; headers: Record<string, string> } {
  const s = (answer as { [STATUS]?: number } | null)?.[STATUS]
  const own = (answer as { [HEADERS]?: Record<string, string> } | null)?.[HEADERS] ?? {}
  const headers = Object.keys(own).length ? { ...own, "access-control-expose-headers": Object.keys(own).join(", ") } : {}
  return typeof s === "number" ? { status: s, json: (answer as { json: unknown }).json, headers } : { status: 200, json: answer, headers }
}

/**
 * Prints what failed on the page as it happens, so a red run says which call
 * no stub answered (or which a stub refused) and what threw: each call that
 * failed as "PROBE <status> <method> <path>" (the page's own "/" left out),
 * and each uncaught error as "PAGEERROR <message>".
 */
export function logFailures(page: Page) {
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname
    if (r.status() >= 400 && path !== "/") console.log(`PROBE ${r.status()} ${r.request().method()} ${path}`)
  })
  page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`))
}

/**
 * The app shell's own reads, made on every signed-in page (its sidebar, its
 * header, the settings it keeps), answered with nothing, as the fluidity fake
 * (scripts/fluidity/fakeApp.mjs) answers them. Left to the 404, each failed
 * into a "Not found · Not in this test" toast at some moment of a test, and a
 * toast was a Radix layer then: one that came while a table cell's picker was
 * open was the top layer, and took the Escape meant for the picker
 * (cellTargets, on a loaded machine). A test that needs one of them answers it
 * itself.
 */
const SHELL_READS: Array<[RegExp, unknown]> = [
  // The Inbox badge (lib/activity/inboxBadge), read with the nav on every page: nothing new.
  [/\/activity\/unread$/, { msg: "ok", data: { count: 0 } }],
  [/\/task\/time\/running$/, { msg: "ok", data: null }],
  // A project's SLA settings (hooks/useSlaView: a list's filter and Display, the project's tools): SLAs off, as the
  // server answers a project that never turned them on. A spec about SLAs answers it itself (V-1093).
  [/\/project\/[^/]+\/sla$/, { msg: "ok", data: { on: false, rules: [], defaults: false, hours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", tz: "UTC" }, hours_set: false, can_manage: false } }],
  // A project's triage queue (linear-21 H3, components/work/triage): read only while its Triage tab is open, which a
  // project's info draws only while project_triage says on. Off and empty, as the server answers a project that never
  // turned triage on; a spec about triage answers it itself.
  [/\/project\/[^/]+\/triage$/, { msg: "ok", data: { on: false, requests: [], can_decide: false } }],
  // A task's approval request (package 9 R2): none, unless a test sends one.
  [/\/task\/approval\/[^/]+$/, { msg: "ok", data: null }],
  // A task's links to other tasks (jira-01 J-H), read by every task panel: none, unless a test sends some.
  [/\/task\/[^/]+\/links$/, { links: [], count: 0 }],
  // A task's releases (jira-04 Head B, components/task/taskReleaseField), read by every task panel: in none, with none
  // to offer, so the panel draws no Release row. A test about releases answers it itself.
  [/\/task\/release\/[^/]+$/, { msg: "ok", data: { releases: [], options: [], can_edit: false, can_change_released: false } }],
  // Every page's composer drafts (components/conversation/DraftSyncLoader), none kept.
  [/\/drafts$/, { msg: "ok", data: { drafts: [], max: 500 } }],
  // What a task or a project links to (services/entityLinkService), read by every task page: nothing.
  // A project's links to its tools elsewhere (basecamp-16), read by every project page: none.
  [/\/project\/[^/]+\/links$/, { msg: "ok", data: { links: [], can_manage: false } }],
  // A project's plan (linear-15), read by every project page: in progress, nothing else set, for someone who may not change it.
  [/\/project\/[^/]+\/plan$/, { msg: "ok", data: { plan: { lead: null, start: null, target: null, priority: "", status: { category: "in_progress", name: "In progress", color: "amber" }, labels: null }, can_edit: false, can_lead: false } }],
  [/\/project\/plan\/registry$/, { msg: "ok", data: { categories: [], statuses: null, labels: null, colors: [] } }],
  [/\/link\/source\/[^/]+\/[^/]+$/, { msg: "ok", data: { docs: [], boards: [] } }],
  // A doc page's own reads, as a doc nobody has followed, starred, linked to,
  // commented on or suggested a change to, with no folder above it.
  [/\/proposals$/, { msg: "ok", data: { proposals: [] } }],
  // The profile's sign-in section: no passkeys yet.
  [/\/auth\/passkeys$/, { data: [] }],
  [/\/auth\/2fa$/, { msg: "ok", data: { enrolled: false } }],
  [/\/auth\/has-password$/, { has_password: true }],
  [/\/content-io\/capabilities$/, { capabilities: { export: true, export_formats: ["md", "html", "pdf", "docx"], import_extensions: [".md", ".html", ".txt"], max_import_bytes: 10485760, max_direct_bytes: 5242880 } }],
  [/\/follows$/, { msg: "ok", data: { resource_kind: "doc", resource_uuid: "", mode: "all", chosen: false, default: "all" } }],
  [/\/places$/, { msg: "ok", data: { places: [] } }],
  // What the person opened lately (the sidebar's Recent boards, the phone's More): nothing yet.
  [/\/places\/recent$/, { msg: "ok", data: { places: [] } }],
  [/\/threads$/, { msg: "ok", data: { threads: [] } }],
  [/\/doc\/exportConsent$/, { consent: { allowed: true, owner: true, private: true } }],
  [/\/doc\/ancestors\/[^/]+$/, { msg: "ok", data: { ancestors: [], truncated: false } }],
  [/\/doc\/backlinks\/[^/]+$/, { msg: "ok", data: { tasks: [], projects: [], docs: [], count: 0 } }],
  // Admin › Import's export card (components/admin/ExportCard), beside the import
  // card on that tab: no exports made yet.
  [/\/admin\/docs\/exports$/, { exports: [] }],
  // And its review of the people earlier imports added (components/admin/ImportReviewCard): none.
  [/\/admin\/import-reviews$/, { projects: [], pending: 0 }],
  // And its earlier imports' re-check (components/admin/ImportAccessCard): none.
  [/\/admin\/import-access$/, { imports: [] }],
  // A conversation page's own reads, as a conversation with no pins, nothing
  // scheduled and no keywords, whose composer offers no commands or voice input.
  [/\/command\/catalog$/, { msg: "ok", data: { commands: [] } }],
  [/\/message\/scheduled$/, { msg: "ok", data: [] }],
  [/\/ai\/voice-input$/, { msg: "ok", data: {} }],
  [/\/conversations\/[^/]+\/[^/]+\/pins$/, { msg: "ok", data: { pins: [], can_pin: true, max: 100 } }],
  [/\/me\/keywords$/, { msg: "ok", data: [] }],
  // A DM's held-notifications bar (components/messages/heldNotificationsBar), read
  // as the DM opens and every minute after. The API answers { data: HeldStatus }
  // (controllers/Notification TeammateNotificationStatus, from business/Notification
  // HeldStatusOf): `reason` says why the other person's notifications are held
  // ("paused", "focus" or "quiet_hours") and `until` when that ends (RFC 3339).
  // Both are left out when nothing is held, as here, and the bar draws nothing.
  [/\/user\/notificationStatus\/[^/]+$/, { data: {} }],
  // The same bar says what the other person's calendar says now (calendar head 5c),
  // read every five minutes: { data: { kind, until, words, private } } (controllers/
  // Calendar PersonStatus). An empty kind, as here, says nothing.
  [/\/event\/status\/[^/]+$/, { msg: "ok", data: { kind: "", words: "", private: false } }],
  // Outlook's link (calendar B7, GET /calendar/sync/microsoft), read by the
  // Calendars panel and the phone's options: off, as on a server whose admin
  // hasn't added a Microsoft app (business/Calendar SyncStatus).
  [/\/calendar\/sync\/microsoft$/, { msg: "ok", data: { provider: "microsoft", state: "none", progress: 0, moved: 0, unchanged: 0, available: false } }],
  [/\/(user\/preferences|user\/notificationPreferences|user\/sidebarNav|user\/botKinds|config\/mqttConfig|config\/client|auth\/providers|me\/capabilities|later|doc\/children)$/, { msg: "ok", data: {} }],
]

/**
 * The writes a page makes on its own, nobody waiting on them (a doc's or a
 * board's view recorded), answered as done. Left to the 404, a doc's view
 * record raised a "Not found" toast in every doc test, which the app no longer
 * does for a write that asks for no error toast (hooks/usePost).
 */
const SHELL_WRITES: Array<[RegExp, unknown]> = [
  [/\/(doc|board)\/recordView$/, { msg: "ok" }],
  // A channel marked seen as it opens.
  [/\/ch\/markSeen\/[^/]+$/, { msg: "ok" }],
  // A composer's draft kept on the server as it is typed, and emptied when it is
  // sent (lib/conversation/draftSync): the composer reads nothing back.
  [/\/drafts$/, { msg: "ok" }],
  // Guests' working hours (calendar A3): nobody keeps any here.
  [/\/event\/hours$/, { msg: "ok", data: {} }],
  // A theme picked, saved to the profile (components/activeTheme/useThemeBackendSync).
  // The demo's build keeps the theme in the browser only, so a run on it never
  // made this call; every other build does, whenever a test changes the theme.
  [/\/updateUserTheme$/, { msg: "ok" }],
]

/** The calls each page made that no stub answered, as "GET /path". */
const unanswered = new WeakMap<Page, string[]>()

/**
 * Waits until nothing on the page moves, naming what still does if it never
 * stops: a dialog's entrance among them, so a box measured after it is where
 * it rests. An endless animation (a spinner) is not waited for, nor one a
 * scroll drives (a strip's data-edge-fade), which reads "running" for as long
 * as it is drawn, nor a microphone's live meter (data-mic-meter), which moves
 * with every sound the browser's fake microphone makes, nor a countdown bar
 * (the toast-timer keyframes: an undoable toast's bar, a ring card's drain),
 * which runs for as long as its toast or card stays: waiting for it would see
 * the toast or the card gone. A countdown only scales its own bar, so nothing
 * around it moves.
 */
export async function untilStill(page: Page) {
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
        .filter((a) => !(a instanceof CSSAnimation && a.animationName === "toast-timer"))
        .filter((a) => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest("[data-mic-meter]"))
        .map((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target
          const what = a instanceof CSSAnimation ? a.animationName : a instanceof CSSTransition ? a.transitionProperty : "an animation"
          return `${what} on ${target ? target.outerHTML.slice(0, 80) : "nothing"}`
        }),
    )
  await expect.poll(moving, { message: "the page still moves" }).toEqual([])
}

/**
 * Saves the page for design review when SHOTS_DIR is set, as
 * `<name>-<width>-<theme>.png`, once nothing on it moves (untilStill) and with
 * no stub's "Not in this test" toast on it; a failure names what still moves,
 * or the calls no stub answered.
 */
export async function reviewShot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await untilStill(page)
  expect(await page.getByText("Not in this test").count(), `a shot with the stub's toast, from ${(unanswered.get(page) ?? []).join(", ")}`).toBe(0)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/**
 * Lets a window the page opened itself (Document Picture-in-Picture) finish
 * loading, for a test's last steps. The window's about:blank document fetches
 * through its opener, and while the opener has stubs (page.route) Playwright
 * pauses those fetches and never lets them go: the window's fonts stay
 * "loading", and page.screenshot waits on them forever. A browser with no
 * stubs has no such hold. CALLS-LEAD-95's probes (31 Oct) saw it in the
 * headless shell, headed and in new headless alike, and the held font arrived
 * the moment the routes went. It drops the opener's stubs, so call it only
 * when nothing stubbed is left to answer; the fake call's sockets
 * (routeWebSocket) stay.
 */
export async function releaseWindowLoads(opener: Page) {
  await opener.unrouteAll({ behavior: "ignoreErrors" })
}

/**
 * Home, settled with no projects: its projects strip offers the three
 * templates. A crash under the page's error boundary ("Something broke on this
 * page") takes the strip with it but leaves the bars, the sheets and the
 * composer, so a test that only acts on those still passed: on 26 Oct five
 * specs answered /project/overview with data null, the strip read .projects of
 * it, and web batch wA26's gate logged the crash while each of them passed.
 */
export async function expectHomeSettled(page: Page) {
  await expect(page.locator("[data-projects-strip]"), "Home drew its projects strip (a crash under the page's error boundary replaces it)").toContainText("Plan, build, ship", { timeout: 60_000 })
}

/**
 * Every call the page made was answered. The stub's 404 for one nobody
 * answered becomes a "Not found · Not in this test" toast unless the app asked
 * for none, and a toast can land on the control a test presses next: a DM's
 * held-notifications read covered the composer's Send later on a phone held
 * sideways (momentFields, web batch wB26's gate, 26 Oct). A failure names the
 * calls.
 */
export async function expectEveryCallAnswered(page: Page) {
  const missed = unanswered.get(page) ?? []
  expect(await page.getByText("Not in this test").count(), `the stub's toast, from ${missed.join(", ")}`).toBe(0)
  expect(missed, "calls no stub answered").toEqual([])
}

/**
 * The themes a design spec runs in: dark only when its review shots are
 * wanted (SHOTS_DIR). A run without them registers no dark case, since a gate
 * fails on a skipped one.
 */
export const SHOT_THEMES = process.env.SHOTS_DIR ? (["light", "dark"] as const) : (["light"] as const)

/**
 * reviewShot in each of SHOT_THEMES with that theme applied (the app follows
 * the system's colour scheme), then back to the scheme the page had. Nothing
 * when SHOTS_DIR is unset, so a gate run never changes the page's theme.
 */
export async function reviewShotInThemes(page: Page, name: string) {
  if (!process.env.SHOTS_DIR) return
  const was = (await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)) ? "dark" : "light"
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: was })
}

/** The server's ai feature on, so the AI edition's own entries draw (lib/addOns). */
export const AI_ON = { "/config/client": { msg: "ok", data: { features: { ai: true } } } }

/**
 * The AI reads a signed-in page makes beside its own: OneCamp AI's nudges and
 * note, what each Doc AI action needs (none: they need edit), a doc's
 * starters, and Home's briefing, "what needs me" and AI teammates' work
 * (services/memoryService, components/ai/AgentWorkCard). Answered empty, so no
 * "Not in this test" toast lands in a shot.
 */
export const AI_READS = {
  "/ai/nudges": { msg: "ok", data: [] },
  "/ai/agent-note": { msg: "ok", data: {} },
  "/ai/status": { msg: "ok", data: {} },
  "/doc/ai/starters": { msg: "ok", data: { project: null } },
  "/ai/briefing": { msg: "ok", data: { enabled: true, open_items: [], highlights: [], day_items: [] } },
  "/ai/attention": { msg: "ok", data: { enabled: true, items: [], counts: {} } },
  "/agents/activity": { msg: "ok", data: [] },
}

/**
 * The reads a task's panel makes beside the task itself: its time, its
 * recurrence, its cycle and its client review. Answered empty, so a test that
 * opens a panel gets no "Not in this test" toast in a shot.
 */
export const TASK_PANEL_READS = {
  "/task/time/": { msg: "ok", data: null },
  "/task/recurrence/": { msg: "ok", data: null },
  "/task/cycle/": { msg: "ok", data: null },
  "/task/clientReview/": { msg: "ok", data: null },
}

/**
 * The calendar's own reads beside its events (components/calendar/calendarApp,
 * lib/calendar/otherCalendars): your one calendar, nothing repeating ahead,
 * Google not linked and no tasks in the period. Left to the 404, the tasks'
 * read failed the grid into "Couldn't load your calendar" behind an event's
 * panel in a shot (DESIGN-BUILD-121's LOW). A test that needs one of them
 * otherwise answers it itself, after these.
 */
export const CALENDAR_READS = {
  "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  "/calendar/repeats": { msg: "ok", data: { checkins: [], tasks: [] } },
  "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
  "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
}

/**
 * Events' call rooms as the server answers them (gcal-15 head B, router/calendarAnswers.go): GET
 * /calendar/events/<id>/room, its title and the page it is joined at, nothing made; POST .../room/join, the member's
 * own call token for it. For a test's "/calendar/events/" answer: what was sent ("GET room <id>", "POST room/join
 * <id>") and the answer, or null for any other calendar route. An event not in `rooms` is no such event to this
 * member (a busy-only reader, someone not on it), as the server tells them; `fail` answers its join with that status,
 * as a fault the server didn't expect. Nothing in the demo's build makes a room, so the beta run meets these here.
 */
export function eventRoomAnswers(rooms: Record<string, { title: string; token?: string; fail?: number }>) {
  return (url: URL, request: Request): { sent: string; answer: unknown } | null => {
    const m = /\/calendar\/events\/([^/]+)\/room(\/join)?$/.exec(url.pathname)
    if (!m) return null
    const id = decodeURIComponent(m[1])
    const join = !!m[2] && request.method() === "POST"
    const sent = join ? `POST room/join ${id}` : `GET room ${id}`
    const room = rooms[id]
    if (!room) return { sent, answer: withStatus(404, { msg: "Event not found" }) }
    if (!join) return { sent, answer: { msg: "ok", data: { title: room.title, join: `/app/meet/e/${id}` } } }
    if (room.fail) return { sent, answer: withStatus(room.fail, { msg: "Something went wrong. Try again in a moment." }) }
    return { sent, answer: { msg: "ok", data: { token: room.token ?? "", room: `meet-${id}`, title: room.title } } }
  }
}

/**
 * Closes what a signed-in page may show over what a test presses or shoots:
 * the shared demo's banner and the first-run keyboard tip, each on its "Got
 * it". There are two, so it looks twice.
 */
export async function tidy(page: Page) {
  for (let i = 0; i < 2; i++) {
    const gotIt = page.getByRole("button", { name: "Got it" }).first()
    if (!(await gotIt.isVisible().catch(() => false))) break
    await gotIt.click().catch(() => {})
  }
}

/**
 * The page's waits of `ms` last `to` instead: a click a test makes inside
 * a page's wait before it writes its address lands inside it on any machine.
 */
export async function longerWait(page: Page, ms: number, to: number) {
  await page.addInitScript(([ms, to]) => {
    const set = window.setTimeout
    window.setTimeout = ((fn: TimerHandler, wait?: number, ...rest: unknown[]) => set(fn, wait === ms ? to : wait, ...rest)) as typeof window.setTimeout
  }, [ms, to])
}

/**
 * Holds the app's pages that match (their prefetches too) until let go, so a
 * move to one is still on its way while the test does what it must.
 */
export async function holdPages(page: Page, match: (url: URL) => boolean) {
  let go = () => {}
  const gone = new Promise<void>((resolve) => (go = resolve))
  await page.route(match, async (route) => {
    await gone
    await route.fallback()
  })
  return go
}

/** The app's own origin: stubBackend answers everything that leaves it. */
export function appOrigin(testInfo: TestInfo): URL {
  return new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
}

/**
 * Answers the app's API calls: `answers` by path prefix (the longest that
 * matches; withStatus for one that isn't a 200; a function of the URL for one
 * that depends on its query, and of the request for one that depends on what
 * was sent, which may answer later), the profile, the shell's own reads, and
 * 404 for everything else (never 401: that signs the browser out).
 */
export async function stubBackend(page: Page, testInfo: TestInfo, answers: Answers = {}) {
  const missed: string[] = []
  unanswered.set(page, missed)
  const app = appOrigin(testInfo)
  await page.routeWebSocket(/.*/, () => {
    // Accepted and silent: the collaboration and live-update sockets wait.
  })
  const prefixes = Object.keys(answers).sort((a, b) => b.length - a.length)
  await page.route(
    leavesApp(app),
    async (route) => {
      const request = route.request()
      const origin = request.headers()["origin"] || app.origin
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      }
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      const path = new URL(request.url()).pathname
      const hit = prefixes.find((p) => path.startsWith(p) || path.includes(p))
      if (hit) {
        const answer = answers[hit]
        // An answer may depend on the query (a page, a page size) or on what a
        // write sent: a function of the URL and the request. Its promise
        // answers when the test lets it (a card that fills in late).
        const { status, json, headers: own } = statusOf(typeof answer === "function" ? await (answer as (url: URL, request: Request) => unknown)(new URL(request.url()), request) : answer)
        return status === 0 ? route.abort("failed") : route.fulfill({ status, headers: { ...headers, ...own }, json })
      }
      if (/\/user\/profile$/.test(path)) return route.fulfill({ status: 200, headers, json: { msg: "ok", data: SAM } })
      const shell = (request.method() === "GET" ? SHELL_READS : SHELL_WRITES).find(([re]) => re.test(path))
      if (shell) return route.fulfill({ status: 200, headers, json: shell[1] })
      missed.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 404, headers, json: { msg: "Not in this test" } })
    },
  )
}

/** A doc as getDocInfo answers it. */
export function docInfo(doc: { doc_uuid: string; doc_title: string; doc_body?: string; edit?: boolean }) {
  const now = new Date().toISOString()
  return {
    msg: "ok",
    data: {
      doc_uuid: doc.doc_uuid,
      doc_title: doc.doc_title,
      doc_body: doc.doc_body ?? "<p>The body.</p>",
      doc_edit_access: doc.edit ? 1 : 0,
      doc_read_access: 1,
      doc_comment_access: 1,
      doc_editing_users: [],
      doc_reading_users: [],
      doc_commenting_users: [],
      doc_public_comment: false,
      doc_private: true,
      doc_created_by: { ...SAM },
      doc_comments: [],
      doc_comment_count: 3,
      doc_created_at: now,
      doc_updated_at: now,
      doc_mqtt_topic: `doc/${doc.doc_uuid}`,
      doc_deleted_at: "0001-01-01T00:00:00Z",
    },
  }
}

/**
 * A reset link's check (POST /auth/reset-password/check) answered "usable",
 * for a page that uses /reset-password with a made-up token: the page asks as
 * it opens, and would ask the build's real backend.
 */
export async function usableResetLink(page: Page) {
  await page.route(/\/auth\/reset-password\/check$/, async (route) => {
    const request = route.request()
    const headers = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "POST,OPTIONS",
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 200, headers, json: { msg: "ok", data: { valid: true } } })
  })
}

/** The realtime settings' answer: the broker brokerOn answers, and the topics the member holds. */
export function mqttConfig(topics: string[]) {
  return { msg: "ok", data: { clientId: "e2e", username: "u", password: "p", topics, ws_url: "ws://broker.e2e.test:8083/mqtt" } }
}

/**
 * The time a spec pins the page's clock to (page.clock.setFixedTime) when the
 * page also holds a live connection (brokerOn): the real clock at run time, an
 * hour ahead, to the minute. Never a date written into the spec. Playwright's
 * fixed clock fakes performance.timeOrigin in the page but not in a Worker,
 * and mqtt.js keeps its connection alive on worker timers (worker-timers),
 * whose worker takes a timer's due time from the page's faked origin. Pinned
 * behind the real clock, every keepalive tick is overdue at once, and the
 * connection times out before it subscribes (V-577, 5 Nov 2026: both Inbox
 * specs, pinned to 10:05 UTC, failed from 15:35 IST on). The hour is far
 * more than one worker's run of such a spec takes (180 s a test at most), so
 * the pin stays ahead of the real clock throughout.
 */
export function liveClockNow(): Date {
  return new Date(Math.ceil((Date.now() + 60 * 60_000) / 60_000) * 60_000)
}

/**
 * A realtime broker of the test's own (scripts/fluidity/fakeBroker.mjs) at
 * the address mqttConfig names; after stubBackend, whose silent websocket
 * route it takes over (the newest route wins). `held`: what the app sends
 * waits until release(), so the app isn't connected, nor live on any topic,
 * until the test lets it be. A page clock pinned behind the real one would
 * starve the connection (liveClockNow): it is checked as the app connects,
 * and broker.subscriptions() then fails with the reason instead of staying
 * empty.
 */
export async function brokerOn(page: Page, { held = false } = {}) {
  const broker = brokerFor()
  let release = () => {}
  const open = held ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
  let behind = ""
  const subscriptions = broker.subscriptions
  broker.subscriptions = () => {
    if (behind) throw new Error(behind)
    return subscriptions()
  }
  await page.routeWebSocket(/broker\.e2e\.test/, (ws) => {
    // An unpinned page reads the real clock, a round trip earlier than this.
    void page.evaluate(() => Date.now()).then(
      (at) => {
        if (at < Date.now() - 5_000) behind = `the page's clock is pinned at ${new Date(at).toISOString()}, behind the real one, so mqtt.js's keepalive (worker timers) times the connection out: pin it to liveClockNow() from e2e/stubbedApp`
      },
      () => {},
    )
    const peer = broker.connect(
      (bytes: Uint8Array) => ws.send(Buffer.from(bytes)),
      () => ws.close().catch(() => {}),
    )
    ws.onMessage((m) => {
      if (typeof m !== "string") void open.then(() => peer.receive(new Uint8Array(m)))
    })
    ws.onClose(() => peer.closed())
  })
  return { broker, release }
}

/**
 * "Plan my week"'s plan as POST /event/planWeek answers it (gcal-16): three
 * blocks proposed for the week of Wednesday 21 Oct 2026 from 10:00 (one waits
 * on another's block), one task left out, ordered by the workspace's own model
 * on its server. A test answers an empty or a failed plan itself.
 */
const planAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
export const WEEK_PLAN = {
  from: planAt(21, 10),
  to: planAt(26, 0),
  proposals: [
    { task_uuid: "t-plan", task_name: "Plan the launch", project_name: "Launch", start: planAt(21, 11), end: planAt(21, 11, 45), reason: "Due Thursday" },
    { task_uuid: "t-copy", task_name: "Write the pricing copy", project_name: "Launch", start: planAt(22, 9), end: planAt(22, 10), reason: "After Plan the launch, which it waits on", after: "t-plan" },
    { task_uuid: "t-ship", task_name: "Ship the pricing page", project_name: "Launch", start: planAt(23, 14), end: planAt(23, 15), reason: "Due Friday" },
  ],
  left: [{ task_uuid: "t-audit", task_name: "Audit the docs", reason: "it needs 6 hours and the week has 4 free" }],
  by: "model",
  model: "qwen3:4b-instruct",
  local: true,
}

/**
 * "Find a better time"'s options for an event, as POST /ai/schedule/reschedule
 * answers them (gcal-16, RescheduleDialog): its time now, who is on it, and
 * the times proposed instead, each with how many are free. Nothing is written
 * until a time is confirmed (POST /ai/schedule/reschedule/confirm).
 */
export function rescheduleOptions(event: { uuid: string; title: string; start: string; end: string }, candidates: { start: string; end: string; free: number; total: number }[], participants: string[]) {
  return {
    msg: "ok",
    data: {
      enabled: true,
      event_uuid: event.uuid,
      title: event.title,
      current_start: event.start,
      current_end: event.end,
      duration_mins: Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000),
      participants: participants.map((name, i) => ({ uuid: `p-${i}`, name })),
      conflict_count: 0,
      conflicts: [],
      candidates: candidates.map((c) => ({ start: c.start, end: c.end, all_free: c.free === c.total, free_count: c.free, total: c.total })),
    },
  }
}
