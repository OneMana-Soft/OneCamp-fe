import type { Page, TestInfo } from "@playwright/test"

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
 * Answers the app's API calls: `answers` by path prefix (the longest that
 * matches; withStatus for one that isn't a 200; a function of the URL for one
 * that depends on its query), the profile, and 404 for everything else (never
 * 401: that signs the browser out).
 */
export async function stubBackend(page: Page, testInfo: TestInfo, answers: Answers = {}) {
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await page.routeWebSocket(/.*/, () => {
    // Accepted and silent: the collaboration and live-update sockets wait.
  })
  const prefixes = Object.keys(answers).sort((a, b) => b.length - a.length)
  await page.route(
    (url) => url.origin !== app.origin,
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
        // An answer may depend on the query (a page, a page size): a function of the URL.
        const { status, json } = statusOf(typeof answer === "function" ? (answer as (url: URL) => unknown)(new URL(request.url())) : answer)
        return status === 0 ? route.abort("failed") : route.fulfill({ status, headers, json })
      }
      if (/\/user\/profile$/.test(path)) return route.fulfill({ status: 200, headers, json: { msg: "ok", data: SAM } })
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
