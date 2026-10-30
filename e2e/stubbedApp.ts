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

function statusOf(answer: unknown): { status: number; json: unknown } {
  const s = (answer as { [STATUS]?: number } | null)?.[STATUS]
  return typeof s === "number" ? { status: s, json: (answer as { json: unknown }).json } : { status: 200, json: answer }
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
  [/\/task\/time\/running$/, { msg: "ok", data: null }],
  // A task's approval request (package 9 R2): none, unless a test sends one.
  [/\/task\/approval\/[^/]+$/, { msg: "ok", data: null }],
  // Every page's composer drafts (components/conversation/DraftSyncLoader), none kept.
  [/\/drafts$/, { msg: "ok", data: { drafts: [], max: 500 } }],
  // What a task or a project links to (services/entityLinkService), read by every task page: nothing.
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
 * with every sound the browser's fake microphone makes, nor an undoable
 * toast's countdown bar (.toast-timer), which runs for as long as the toast
 * stays: waiting for it would see the toast gone.
 */
export async function untilStill(page: Page) {
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
        .filter((a) => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest("[data-mic-meter], .toast-timer"))
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

/** The server's ai feature on, so the AI edition's own entries draw (lib/addOns). */
export const AI_ON = { "/config/client": { msg: "ok", data: { features: { ai: true } } } }

/**
 * The AI reads a signed-in page makes beside its own: OneCamp AI's nudges and
 * note, what each Doc AI action needs (none: they need edit), and a doc's
 * starters. Answered empty, so no "Not in this test" toast lands in a shot.
 */
export const AI_READS = {
  "/ai/nudges": { msg: "ok", data: [] },
  "/ai/agent-note": { msg: "ok", data: {} },
  "/ai/status": { msg: "ok", data: {} },
  "/doc/ai/starters": { msg: "ok", data: { project: null } },
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
        const { status, json } = statusOf(typeof answer === "function" ? await (answer as (url: URL, request: Request) => unknown)(new URL(request.url()), request) : answer)
        return status === 0 ? route.abort("failed") : route.fulfill({ status, headers, json })
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
 * A realtime broker of the test's own (scripts/fluidity/fakeBroker.mjs) at
 * the address mqttConfig names; after stubBackend, whose silent websocket
 * route it takes over (the newest route wins). `held`: what the app sends
 * waits until release(), so the app isn't connected, nor live on any topic,
 * until the test lets it be.
 */
export async function brokerOn(page: Page, { held = false } = {}) {
  const broker = brokerFor()
  let release = () => {}
  const open = held ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
  await page.routeWebSocket(/broker\.e2e\.test/, (ws) => {
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
