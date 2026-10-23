import { expect, type Page, type Request, type TestInfo } from "@playwright/test"

import { leavesApp } from "../scripts/fluidity/appServers.mjs"

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
  // Every page's composer drafts (components/conversation/DraftSyncLoader), none kept.
  [/\/drafts$/, { msg: "ok", data: { drafts: [], max: 500 } }],
  // What a task or a project links to (services/entityLinkService), read by every task page: nothing.
  [/\/link\/source\/[^/]+\/[^/]+$/, { msg: "ok", data: { docs: [], boards: [] } }],
  // A doc page's own reads, as a doc nobody has followed, starred, linked to
  // or commented on, with no folder above it.
  [/\/content-io\/capabilities$/, { capabilities: { export: true, export_formats: ["md", "html", "pdf", "docx"], import_extensions: [".md", ".html", ".txt"], max_import_bytes: 10485760, max_direct_bytes: 5242880 } }],
  [/\/follows$/, { msg: "ok", data: { resource_kind: "doc", resource_uuid: "", mode: "all", chosen: false, default: "all" } }],
  [/\/places$/, { msg: "ok", data: { places: [] } }],
  [/\/threads$/, { msg: "ok", data: { threads: [] } }],
  [/\/doc\/exportConsent$/, { consent: { allowed: true, owner: true, private: true } }],
  [/\/doc\/ancestors\/[^/]+$/, { msg: "ok", data: { ancestors: [], truncated: false } }],
  [/\/doc\/backlinks\/[^/]+$/, { msg: "ok", data: { tasks: [], projects: [], docs: [], count: 0 } }],
  [/\/(user\/notificationPreferences|user\/sidebarNav|user\/botKinds|config\/mqttConfig|config\/client|auth\/providers|me\/capabilities|later|doc\/children)$/, { msg: "ok", data: {} }],
]

/**
 * The writes a page makes on its own, nobody waiting on them (a doc's or a
 * board's view recorded), answered as done. Left to the 404, a doc's view
 * record raised a "Not found" toast in every doc test, which the app no longer
 * does for a write that asks for no error toast (hooks/usePost).
 */
const SHELL_WRITES: Array<[RegExp, unknown]> = [[/\/(doc|board)\/recordView$/, { msg: "ok" }]]

/** The calls each page made that no stub answered, as "GET /path". */
const unanswered = new WeakMap<Page, string[]>()

/**
 * Saves the page for design review when SHOTS_DIR is set, as
 * `<name>-<width>-<theme>.png`, once nothing on it moves and with no stub's
 * "Not in this test" toast on it; a failure names what still moves, or the
 * calls no stub answered. An endless animation (a spinner) is not waited for,
 * nor one a scroll drives (a strip's data-edge-fade), which reads "running"
 * for as long as it is drawn.
 */
export async function reviewShot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target
          const what = a instanceof CSSAnimation ? a.animationName : a instanceof CSSTransition ? a.transitionProperty : "an animation"
          return `${what} on ${target ? target.outerHTML.slice(0, 80) : "nothing"}`
        }),
    )
  await expect.poll(moving, { message: "a shot while the page moves" }).toEqual([])
  expect(await page.getByText("Not in this test").count(), `a shot with the stub's toast, from ${(unanswered.get(page) ?? []).join(", ")}`).toBe(0)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/**
 * Answers the app's API calls: `answers` by path prefix (the longest that
 * matches; withStatus for one that isn't a 200; a function of the URL for one
 * that depends on its query, and of the request for one that depends on what
 * was sent), the profile, the shell's own reads, and 404 for
 * everything else (never 401: that signs the browser out).
 */
export async function stubBackend(page: Page, testInfo: TestInfo, answers: Answers = {}) {
  const missed: string[] = []
  unanswered.set(page, missed)
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
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
        // write sent: a function of the URL and the request.
        const { status, json } = statusOf(typeof answer === "function" ? (answer as (url: URL, request: Request) => unknown)(new URL(request.url()), request) : answer)
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
