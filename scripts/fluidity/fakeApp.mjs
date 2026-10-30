// The app's server side, faked for a browser on a production build: the API
// answers from fixtures and every collaboration socket is answered by one
// in-memory collaboration server (fakeCollab.mjs), so several browser contexts
// in one run edit the same doc live. Nothing leaves the machine.
//
// Used by the doc fluidity budgets (docs.mjs) and the two-client e2e
// (e2e/docSession.spec.ts). A production build bakes its servers' addresses
// in (.env.production); this routes every request that leaves the build's own
// origin, whatever domain it was made for, by the rule e2e/stubbedApp.ts
// routes by too (appServers.mjs).
//
// The realtime broker's socket is answered only when a run asks for it
// (`broker: true`: fakeBroker.mjs, an MQTT broker; context.__broker publishes
// and keeps its packets' times). Otherwise it is taken and stays silent, as
// every measure before 21 Oct 2026 had it: the app never connects.
//
//   const collab = createFakeCollab({ docs, policy })
//   await fakeApp(context, { app: "http://localhost:3000", user: USERS.sam, docs: DOCS, collab, rtt: 150 })
import { leavesApp, serverOf } from "./appServers.mjs"
import { brokerFor } from "./fakeBroker.mjs"
import { createFakeCollab } from "./fakeCollab.mjs"

export const USERS = {
  sam: { user_uuid: "5a7a1c11-0000-4000-8000-00000000000a", user_name: "sam", user_full_name: "Sam Rivera", user_email_id: "sam@example.test", token: "sam" },
  ann: { user_uuid: "5a7a1c11-0000-4000-8000-00000000000b", user_name: "ann", user_full_name: "Ann Lee", user_email_id: "ann@example.test", token: "ann" },
  vic: { user_uuid: "5a7a1c11-0000-4000-8000-00000000000c", user_name: "vic", user_full_name: "Vic Reader", user_email_id: "vic@example.test", token: "vic" },
}

/** A doc's details as GET /doc/getDocInfo answers them, for `user`. */
export function docInfo(doc, user) {
  const level = doc.levels?.[user.token] ?? "none"
  const now = new Date().toISOString()
  return {
    doc_uuid: doc.id,
    doc_title: doc.title,
    doc_body: doc.html,
    doc_snippet: "",
    doc_created_by: { user_uuid: USERS.sam.user_uuid, user_name: "sam", user_full_name: "Sam Rivera" },
    doc_edit_access: level === "edit" || level === "full" ? 1 : 0,
    doc_read_access: 1,
    doc_comment_access: level === "comment" ? 1 : 0,
    doc_editing_users: [],
    doc_reading_users: [],
    doc_commenting_users: [],
    doc_public_comment: false,
    doc_private: false,
    doc_comment_count: 0,
    doc_created_at: now,
    doc_updated_at: now,
    doc_mqtt_topic: "",
  }
}

/** The collaboration server's policy for these docs: each user's level by token. */
export function docPolicy(docs) {
  const byId = new Map(docs.map((d) => [d.id, d]))
  return (token, name) => {
    const level = byId.get(name)?.levels?.[token] ?? "none"
    if (level === "none") return { deny: "forbidden" }
    return { level }
  }
}

/** A collaboration server holding `docs` (each with an `update`). */
export function collabFor(docs, options = {}) {
  return createFakeCollab({
    docs: Object.fromEntries(docs.filter((d) => d.update).map((d) => [d.id, d.update])),
    policy: docPolicy(docs),
    ...options,
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const STATUS = Symbol("status")
/** A fixture's answer with a status of its own (a 404, a 500). */
export function status(code, json) {
  return { [STATUS]: code, json }
}

const BYTES = Symbol("bytes")
/** A fixture's answer that isn't JSON: an image's bytes, say (a board's pictures). */
export function bytes(contentType, body) {
  return { [BYTES]: contentType, body }
}

// The app shell's reads whose "nothing" is not an empty object.
const SHELL_FIXTURES = [
  [/\/task\/time\/running$/, { msg: "ok", data: null }],
]

/**
 * Installs the fake server side on a Playwright browser context.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ app: string, user: object, docs: object[], collab: ReturnType<typeof createFakeCollab>, rtt?: number, handshakeMs?: number, delays?: Record<string, number>, fixtures?: Array<[RegExp, unknown]>, log?: string[] }} o
 *   app: the build's address (its origin is the app's own; every other one is faked).
 *   rtt: ms per round trip, for the API and the socket alike (half each way on the socket).
 *   handshakeMs: what opening a socket costs before it carries anything (default 2 × rtt).
 *   delays: extra ms for API paths matching a key (a regexp source).
 */
export async function fakeApp(context, o) {
  const rtt = o.rtt ?? 0
  const log = o.log
  const sockets = []
  context.__collabSockets = sockets

  const offApp = leavesApp(o.app)
  await context.route(offApp, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    // Only the API is answered: the realtime broker and the storefront's
    // funnel are never reached.
    if (serverOf(url) !== "backend") return route.abort("blockedbyclient").catch(() => {})
    const origin = req.headers()["origin"] || "*"
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    }
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }).catch(() => {})
    const path = url.pathname.replace(/\/+/g, "/")
    let extra = 0
    for (const [k, v] of Object.entries(o.delays || {})) if (new RegExp(k).test(path)) extra += v
    if (rtt + extra) await sleep(rtt + extra)
    log?.push(`${req.method()} ${path}`)
    const json = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
    if (path.endsWith("/user/profile")) return json(200, { msg: "ok", data: { ...o.user, token: undefined, user_is_admin: false } })
    if (path.endsWith("/auth/token")) return json(200, { msg: "ok", data: { token: o.user.token } })
    const info = path.match(/\/doc\/getDocInfo\/([^/]+)$/)
    if (info) {
      const doc = o.docs.find((d) => d.id === info[1])
      if (!doc || (doc.levels?.[o.user.token] ?? "none") === "none") return json(404, { msg: "There's no such doc." })
      return json(200, { msg: "ok", data: docInfo(doc, o.user) })
    }
    // A fixture that is a function is asked with the path, the whole URL (its
    // query) and the request (its method and what a write sent); it may answer
    // { status, json } for an answer that isn't a 200 (fakeApp.status).
    for (const [re, body] of [...(o.fixtures || []), ...SHELL_FIXTURES]) {
      if (!re.test(path)) continue
      const answer = typeof body === "function" ? body(path, url, req) : body
      if (answer === undefined) continue
      if (answer && answer[STATUS]) return json(answer[STATUS], answer.json)
      if (answer && answer[BYTES]) return route.fulfill({ status: 200, headers: cors, contentType: answer[BYTES], body: answer.body }).catch(() => {})
      return json(200, answer)
    }
    // Anything else the shell asks for: an empty object, which every reader
    // takes as "nothing here" (lists that need an array are fixed above).
    if (req.method() === "GET") return json(200, { msg: "ok", data: {} })
    return json(200, { msg: "ok" })
  })

  // A new socket costs its handshakes (TCP and TLS: two round trips by
  // default) before the server hears anything on it; a socket kept open
  // doesn't pay them again. That is the cost one socket per tab saves.
  const handshakeMs = o.handshakeMs ?? rtt * 2
  const net = { offline: false, losing: false }
  context.__collabNet = net
  const broker = o.broker ? brokerFor({ log }) : null
  context.__broker = broker
  await context.routeWebSocket(offApp, (ws) => {
    // The collaboration server's sockets are answered here, and the realtime
    // broker's when the run has one; any other is taken and stays silent.
    const kind = serverOf(new URL(ws.url()))
    const server = kind === "collab" ? o.collab : kind === "emqx" ? broker : null
    if (!server) return
    // Offline (setOffline below): the connection fails, as a real one would.
    if (net.offline) {
      ws.close().catch?.(() => {})
      return
    }
    const half = rtt / 2
    const readyAt = Date.now() + handshakeMs
    const entry = { url: ws.url(), open: true }
    sockets.push(entry)
    const peer = server.connect(
      (bytes) => {
        if (net.losing) return
        const send = () => entry.open && ws.send(Buffer.from(bytes))
        half ? setTimeout(send, half) : send()
      },
      () => ws.close().catch?.(() => {}),
    )
    entry.close = () => ws.close().catch?.(() => {})
    let last = 0
    ws.onMessage((m) => {
      if (typeof m === "string" || net.losing) return
      const bytes = new Uint8Array(m)
      // In order, and not before the handshakes are done.
      const at = Math.max(Date.now() + half, readyAt, last)
      last = at
      const wait = at - Date.now()
      wait > 0 ? setTimeout(() => peer.receive(bytes), wait) : peer.receive(bytes)
    })
    ws.onClose(() => {
      entry.open = false
      peer.closed()
    })
  })
  return { sockets, broker }
}

/**
 * Takes a context off the network or puts it back, collaboration socket
 * included: Playwright's setOffline leaves a routed socket open, so the
 * socket is closed here and new ones fail until it is back.
 */
export async function setOffline(context, offline) {
  dropCollabSocket(context, offline)
  await context.setOffline(offline)
}

/**
 * Takes the collaboration socket down, or lets it come back, while the network
 * stays up: the socket is closed and new ones fail until it is back, as when
 * the collaboration server goes away under a page that is still online.
 */
export function dropCollabSocket(context, down) {
  context.__collabNet.offline = down
  if (down) for (const s of context.__collabSockets) if (s.open) s.close()
}

/**
 * A short blip, as the journey's probe made one: the page hears `offline`
 * and `online`, and its open collaboration socket stays open throughout
 * (Playwright's own setOffline). With `lose`, frames either way are lost
 * meanwhile, as on a connection that never noticed the network go.
 */
export async function setOfflineKeepingSocket(context, offline, { lose = false } = {}) {
  context.__collabNet.losing = offline && lose
  await context.setOffline(offline)
}
