// A collaboration server in memory, speaking the Hocuspocus 3 protocol the
// browser's provider speaks: sign-in per doc, Yjs sync, updates, presence,
// stateless messages and closing a doc, several docs over one socket.
//
// It stands in for oneCamp's collaboration service wherever a test or a
// measurement must not reach a real one: the doc fluidity budgets
// (scripts/fluidity/docs.mjs, where the 2,000-block doc never reaches the
// demo), the two-client e2e (e2e/docSession.spec.ts) and the Doc Session's unit
// tests (lib/collabSession.test.ts). It keeps the two server habits the client
// has to live with (lib/collabSocket.ts): a doc refused on a socket stays
// refused on it, and a closed doc is answered with a close.
//
// The transport is the caller's: connect(send, close) returns the socket's
// receive(bytes) and closed(). A Playwright routeWebSocket or a fake browser
// WebSocket wraps it.
import * as Y from "yjs"

// ---- wire format: lib0 varUint / varString / varUint8Array ----
function writeUint(out, n) {
  while (n > 0x7f) {
    out.push(0x80 | (n & 0x7f))
    n = Math.floor(n / 128)
  }
  out.push(n)
}
function writeString(out, s) {
  const b = new TextEncoder().encode(s)
  writeUint(out, b.length)
  for (const x of b) out.push(x)
}
function writeBytes(out, b) {
  writeUint(out, b.length)
  for (const x of b) out.push(x)
}
class Reader {
  constructor(buf) {
    this.b = buf
    this.i = 0
  }
  uint() {
    let n = 0
    let m = 1
    for (;;) {
      if (this.i >= this.b.length) throw new Error("truncated")
      const x = this.b[this.i++]
      n += (x & 0x7f) * m
      if (x < 0x80) return n
      m *= 128
    }
  }
  bytes() {
    const n = this.uint()
    const v = this.b.subarray(this.i, this.i + n)
    this.i += n
    return v
  }
  string() {
    return new TextDecoder().decode(this.bytes())
  }
}

export const MSG = { sync: 0, awareness: 1, auth: 2, queryAwareness: 3, stateless: 5, close: 7, syncStatus: 8 }

/** Encodes one frame: the doc name, the type, then the body writer's bytes. */
export function frame(name, type, write) {
  const out = []
  writeString(out, name)
  writeUint(out, type)
  write?.(out)
  return Uint8Array.from(out)
}

/** Decodes one frame's head and the parts this server and its tests read. */
export function readFrame(bytes) {
  const r = new Reader(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
  const name = r.string()
  const type = r.uint()
  const msg = { name, type }
  if (type === MSG.auth) {
    msg.sub = r.uint()
    msg.text = r.string()
  } else if (type === MSG.sync) {
    msg.sub = r.uint()
    msg.payload = r.bytes()
  } else if (type === MSG.awareness) {
    msg.payload = r.bytes()
  } else if (type === MSG.stateless || type === MSG.close) {
    try {
      msg.text = r.string()
    } catch {
      msg.text = ""
    }
  } else if (type === MSG.syncStatus) {
    msg.applied = r.uint() === 1
  }
  return msg
}

// As the collaboration service's lineage.js: an update that inserts an item at
// the top of the body with nothing before or after it, into a body that has
// content, is a whole second copy of the doc (a tab holding an earlier one).
export function bringsSecondCopy(update, doc) {
  if (!update || update.length === 0) return false
  if (doc.getXmlFragment("default").length === 0) return false
  let structs
  try {
    structs = Y.decodeUpdate(update).structs
  } catch {
    return false
  }
  for (const s of structs) {
    if (!(s instanceof Y.Item)) continue
    if (s.parent !== "default" || s.parentSub != null) continue
    if (s.origin !== null || s.rightOrigin !== null) continue
    if (Y.getState(doc.store, s.id.client) > s.id.clock) continue
    return true
  }
  return false
}

const lineageOf = (doc) => {
  const v = doc.getMap("meta").get("epoch")
  return typeof v === "string" ? v : null
}

/**
 * @param {object} o
 * @param {Record<string, Uint8Array>} [o.docs] each doc's state, as a Yjs update
 * @param {(token: string, name: string) => {level?: string, canEdit?: boolean, deny?: string}} [o.policy]
 *   who may do what: deny names a refusal reason (forbidden, gone, unauthenticated, ...)
 * @param {boolean} [o.speaksSession] sends {type:'session'} on each doc connection (A2); false is an older server
 * @param {number} [o.loadDelayMs] how long a doc takes to load on its first sign-in
 * @param {(socket: number) => boolean} [o.mute] whether the socket-th connection
 *   (from 1) answers nothing: what the tab sends arrives, nothing comes back,
 *   and the tab's close never completes, as a first connection through a cold
 *   edge after a restart (22 Oct, 20:05)
 * @param {string} [o.schemaVersion]
 */
export function createFakeCollab(o = {}) {
  const policy = o.policy || (() => ({ level: "edit" }))
  const speaksSession = o.speaksSession !== false
  const docs = new Map()
  const stats = { sockets: 0, auths: 0, refusals: 0, updates: 0, closes: 0, secondCopies: 0 }
  // name -> Set<conn>
  const live = new Map()
  for (const [name, update] of Object.entries(o.docs || {})) setDoc(name, update)

  function setDoc(name, update) {
    const doc = new Y.Doc()
    if (update && update.length) Y.applyUpdate(doc, update)
    docs.set(name, doc)
    return doc
  }
  function docFor(name) {
    return docs.get(name) || setDoc(name)
  }

  function connect(send, close) {
    stats.sockets++
    const muted = o.mute?.(stats.sockets) === true
    // name -> { state: 'auth'|'ready'|'refused', queue, readOnly, awareness }
    const perDoc = new Map()
    let open = true
    const out = (bytes) => {
      if (open && !muted) send(bytes)
    }
    const conn = { out, perDoc }

    function broadcast(name, bytes, except) {
      for (const c of live.get(name) || []) if (c !== except) c.out(bytes)
    }

    function handleReady(name, m, entry) {
      const doc = docFor(name)
      if (m.type === MSG.sync) {
        if (m.sub === 0) {
          // step 1: what the client lacks, then what this server has
          out(frame(name, MSG.sync, (b) => { writeUint(b, 1); writeBytes(b, Y.encodeStateAsUpdate(doc, m.payload)) }))
          out(frame(name, MSG.sync, (b) => { writeUint(b, 0); writeBytes(b, Y.encodeStateVector(doc)) }))
          return
        }
        if (!entry.readOnly && bringsSecondCopy(m.payload, doc)) {
          // The service's guard: this tab may not write any more, and is told to reload.
          entry.readOnly = true
          stats.secondCopies = (stats.secondCopies || 0) + 1
          out(frame(name, MSG.stateless, (b) => writeString(b, JSON.stringify({ type: "epoch-changed" }))))
        }
        if (entry.readOnly) {
          // Hocuspocus acks a read-only write as applied only if it changes nothing.
          const before = Y.encodeStateVector(doc)
          const probe = new Y.Doc()
          Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc))
          Y.applyUpdate(probe, m.payload)
          const after = Y.encodeStateVector(probe)
          const same = after.length === before.length && after.every((x, i) => x === before[i])
          out(frame(name, MSG.syncStatus, (b) => writeUint(b, same ? 1 : 0)))
          return
        }
        const before = Y.encodeStateVector(doc)
        Y.applyUpdate(doc, m.payload, conn)
        const after = Y.encodeStateVector(doc)
        // Counted only when it changed something (a sync with nothing new is not an edit).
        if (after.length !== before.length || after.some((x, i) => x !== before[i])) stats.updates++
        broadcast(name, frame(name, MSG.sync, (b) => { writeUint(b, 2); writeBytes(b, m.payload) }), conn)
        out(frame(name, MSG.syncStatus, (b) => writeUint(b, 1)))
        o.onUpdate?.(name, m.payload)
        return
      }
      if (m.type === MSG.awareness) {
        entry.awareness = m.payload
        broadcast(name, frame(name, MSG.awareness, (b) => writeBytes(b, m.payload)))
        return
      }
      if (m.type === MSG.close) {
        // As Hocuspocus: the close is handled a moment later, and a sign-in
        // for the same doc that arrives meanwhile reaches the old connection,
        // which ignores it (lib/collabSocket.ts waits for this answer).
        if (entry.closing) return
        entry.closing = true
        setTimeout(() => {
          stats.closes++
          live.get(name)?.delete(conn)
          if (perDoc.get(name) === entry) perDoc.delete(name)
          out(frame(name, MSG.close, (b) => writeString(b, "provider_initiated")))
        }, 5)
      }
    }

    async function authenticate(name, token, entry) {
      stats.auths++
      const p = policy(token, name) || {}
      if (p.deny) {
        stats.refusals++
        entry.state = "refused"
        out(frame(name, MSG.auth, (b) => { writeUint(b, 1); writeString(b, p.deny) }))
        return
      }
      const level = p.level || "edit"
      const canEdit = p.canEdit ?? (level === "edit" || level === "full")
      entry.readOnly = !canEdit
      out(frame(name, MSG.auth, (b) => { writeUint(b, 2); writeString(b, canEdit ? "read-write" : "readonly") }))
      if (o.loadDelayMs && !docs.has(name)) await new Promise((r) => setTimeout(r, o.loadDelayMs))
      if (!open) return
      const doc = docFor(name)
      if (!live.has(name)) live.set(name, new Set())
      live.get(name).add(conn)
      entry.state = "ready"
      // Everyone else's presence, as Hocuspocus sends it to a new connection.
      for (const c of live.get(name)) {
        const a = c !== conn && c.perDoc.get(name)?.awareness
        if (a) out(frame(name, MSG.awareness, (b) => writeBytes(b, a)))
      }
      const queued = entry.queue
      entry.queue = []
      for (const m of queued) handleReady(name, m, entry)
      if (speaksSession) {
        const session = { type: "session", level, canEdit, locked: false, lineage: lineageOf(doc), schemaVersion: o.schemaVersion ?? null }
        out(frame(name, MSG.stateless, (b) => writeString(b, JSON.stringify(session))))
      }
    }

    return {
      muted,
      receive(bytes) {
        let m
        try {
          m = readFrame(bytes)
        } catch {
          return
        }
        let entry = perDoc.get(m.name)
        if (!entry) {
          entry = { state: "new", queue: [], readOnly: false, awareness: null }
          perDoc.set(m.name, entry)
        }
        if (entry.state === "ready") return handleReady(m.name, m, entry)
        if (m.type === MSG.auth && entry.state === "new") {
          entry.state = "auth"
          void authenticate(m.name, m.text, entry)
          return
        }
        // Waiting for sign-in, or refused on this socket for good (as Hocuspocus).
        entry.queue.push(m)
      },
      closed() {
        open = false
        for (const name of perDoc.keys()) live.get(name)?.delete(conn)
      },
      close() {
        open = false
        close?.()
      },
    }
  }

  return {
    connect,
    stats,
    docs,
    setDoc,
    doc: docFor,
    /** Sends a stateless message to every connection on a doc (a "persisted at", say). */
    tell(name, payload) {
      for (const c of live.get(name) || []) c.out(frame(name, MSG.stateless, (b) => writeString(b, JSON.stringify(payload))))
    },
    /** Changes a doc on the server, as another person would, and sends the change to everyone on it. */
    edit(name, change) {
      const doc = docFor(name)
      const updates = []
      const keep = (u) => updates.push(u)
      doc.on("update", keep)
      doc.transact(() => change(doc))
      doc.off("update", keep)
      for (const u of updates) for (const c of live.get(name) || []) c.out(frame(name, MSG.sync, (b) => { writeUint(b, 2); writeBytes(b, u) }))
    },
    /** Closes every connection on a doc, as the service does when someone's access changes; sockets stay up. */
    kick(name) {
      for (const c of [...(live.get(name) || [])]) {
        live.get(name).delete(c)
        c.perDoc.delete(name)
        c.out(frame(name, MSG.close, (b) => writeString(b, "access changed")))
      }
    },
    /** How many sockets are on a doc now. */
    watching(name) {
      return live.get(name)?.size ?? 0
    },
  }
}

/** A doc built from text paragraphs, as a Yjs update, with an optional lineage (epoch). */
export function docUpdate(paragraphs, { epoch } = {}) {
  const doc = new Y.Doc()
  doc.transact(() => {
    const frag = doc.getXmlFragment("default")
    for (const p of paragraphs) {
      const el = new Y.XmlElement("paragraph")
      el.insert(0, [new Y.XmlText(p)])
      frag.push([el])
    }
    if (epoch) doc.getMap("meta").set("epoch", epoch)
  })
  return Y.encodeStateAsUpdate(doc)
}

/**
 * A browser WebSocket class connected to `server`, for jsdom tests: install it
 * as globalThis.WebSocket. Every instance is recorded in `sockets`.
 *
 * `losing`: while true, frames either way are lost and the socket stays open,
 * as on a connection that never noticed the network go.
 */
export function fakeWebSocketClass(server, sockets = []) {
  return class FakeWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.binaryType = "arraybuffer"
      this.listeners = {}
      this.losing = false
      sockets.push(this)
      this.peer = server.connect(
        (bytes) => {
          if (this.losing) return
          setTimeout(() => this.readyState === 1 && this.dispatch("message", { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }), 0)
        },
        () => this.close(),
      )
      setTimeout(() => {
        if (this.readyState !== 0) return
        this.readyState = 1
        this.dispatch("open", {})
      }, 0)
    }
    addEventListener(type, fn) {
      ;(this.listeners[type] ||= []).push(fn)
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn)
    }
    dispatch(type, event) {
      for (const fn of this.listeners[type] || []) fn(event)
    }
    send(data) {
      if (this.readyState !== 1 || this.losing) return
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      this.peer.receive(bytes.slice())
    }
    close() {
      if (this.readyState >= 2) return
      this.peer.closed()
      // A server that answers nothing never answers the close either: the
      // browser stays closing.
      if (this.peer.muted) {
        this.readyState = 2
        return
      }
      this.readyState = 3
      setTimeout(() => this.dispatch("close", { code: 1000, reason: "" }), 0)
    }
  }
}

// ---- documents as the doc editor's schema stores them in Yjs ----

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function textNode(runs) {
  const t = new Y.XmlText()
  let at = 0
  for (const r of typeof runs === "string" ? [{ text: runs }] : runs) {
    const marks = {}
    if (r.bold) marks.bold = {}
    if (r.link) marks.link = { href: r.link, target: "_blank", rel: "noopener noreferrer nofollow", class: null }
    t.insert(at, r.text, marks)
    at += r.text.length
  }
  return t
}
function runsHtml(runs) {
  return (typeof runs === "string" ? [{ text: runs }] : runs)
    .map((r) => (r.bold ? `<strong>${esc(r.text)}</strong>` : r.link ? `<a href="${esc(r.link)}">${esc(r.text)}</a>` : esc(r.text)))
    .join("")
}
function element(name, attrs, children) {
  const el = new Y.XmlElement(name)
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v)
  el.insert(0, children)
  return el
}
const para = (runs) => element("paragraph", {}, [textNode(runs)])

/**
 * A doc from blocks: [{type:'heading', level, text} | {type:'paragraph', text}
 * | {type:'bullets', items} | {type:'todos', items:[{text, checked}]}
 * | {type:'quote', text} | {type:'code', language, text}], where text is a
 * string or runs [{text, bold?, link?}]. Returns its Yjs update and its HTML.
 */
export function docFromBlocks(blocks, { epoch } = {}) {
  const doc = new Y.Doc()
  const html = []
  const nodes = []
  for (const b of blocks) {
    if (b.type === "heading") {
      nodes.push(element("heading", { level: b.level }, [textNode(b.text)]))
      html.push(`<h${b.level}>${runsHtml(b.text)}</h${b.level}>`)
    } else if (b.type === "bullets") {
      nodes.push(element("bulletList", {}, b.items.map((i) => element("listItem", {}, [para(i)]))))
      html.push(`<ul>${b.items.map((i) => `<li><p>${runsHtml(i)}</p></li>`).join("")}</ul>`)
    } else if (b.type === "todos") {
      nodes.push(element("taskList", {}, b.items.map((i) => element("taskItem", { checked: !!i.checked }, [para(i.text)]))))
      html.push(`<ul data-type="taskList">${b.items.map((i) => `<li data-type="taskItem" data-checked="${!!i.checked}"><p>${runsHtml(i.text)}</p></li>`).join("")}</ul>`)
    } else if (b.type === "quote") {
      nodes.push(element("blockquote", {}, [para(b.text)]))
      html.push(`<blockquote><p>${runsHtml(b.text)}</p></blockquote>`)
    } else if (b.type === "code") {
      nodes.push(element("codeBlock", { language: b.language || null }, [textNode(b.text)]))
      html.push(`<pre><code class="language-${esc(b.language || "plaintext")}">${esc(b.text)}</code></pre>`)
    } else {
      nodes.push(para(b.text))
      html.push(`<p>${runsHtml(b.text)}</p>`)
    }
  }
  doc.transact(() => {
    doc.getXmlFragment("default").insert(0, nodes)
    if (epoch) doc.getMap("meta").set("epoch", epoch)
  })
  return { update: Y.encodeStateAsUpdate(doc), html: html.join("") }
}

const LOREM = "the launch plan names an owner for each step and a date it is due so the team can see what is late and who to ask about it before the review on Friday".split(" ")
const words = (i, n) => Array.from({ length: n }, (_, k) => LOREM[(i * 7 + k) % LOREM.length]).join(" ")

/** The 2,000-block doc of the perf report (perf-data/docperf.mjs bigHtml): headings, paragraphs, lists, to-dos, quotes, code. */
export function bigDocBlocks(n = 2000) {
  const out = []
  for (let i = 0; i < n; i++) {
    const id = `Block ${String(i + 1).padStart(4, "0")}`
    if (i % 40 === 0) out.push({ type: "heading", level: 2, text: `${id} section heading` })
    else if (i % 10 === 5) out.push({ type: "bullets", items: [`${id} ${words(i, 8)}`, words(i + 1, 10), words(i + 2, 6)] })
    else if (i % 15 === 7) out.push({ type: "todos", items: [{ text: `${id} ${words(i, 9)}`, checked: i % 2 === 1 }, { text: words(i + 3, 7) }] })
    else if (i % 100 === 50) out.push({ type: "code", language: "js", text: `// ${id}\nconst due = plan.steps.filter((s) => s.late)\nconsole.log(due.length)` })
    else if (i % 25 === 12) out.push({ type: "quote", text: `${id} ${words(i, 20)}` })
    else out.push({ type: "paragraph", text: [{ text: `${id} ${words(i, 35)}. ` }, { text: words(i + 4, 3), bold: true }, { text: " and " }, { text: words(i + 5, 2), link: "https://example.com" }, { text: "." }] })
  }
  return out
}

/** A 12-block doc like the demo's "Q4 launch plan". */
export function launchPlanBlocks() {
  return [
    { type: "heading", level: 1, text: "Q4 launch plan" },
    { type: "paragraph", text: "We launch on the last Tuesday of the quarter, with the pilot customers a week before." },
    { type: "heading", level: 2, text: "Owners" },
    { type: "bullets", items: ["Sam: the checklist and the review", "Ann: the pilot customers", "Vic: the launch notes"] },
    { type: "heading", level: 2, text: "Dates" },
    { type: "todos", items: [{ text: "Pilot customers get the checklist", checked: true }, { text: "Review on Friday" }, { text: "Launch notes out" }] },
    { type: "quote", text: "Ship it when the checklist is green, not before." },
    { type: "paragraph", text: [{ text: "Risks are tracked in " }, { text: "the board", link: "https://example.com/board" }, { text: "." }] },
    { type: "heading", level: 3, text: "Open questions" },
    { type: "paragraph", text: "Who signs off the pricing page?" },
    { type: "paragraph", text: "Do we need a second review for the phone app?" },
    { type: "paragraph", text: "Anything else goes in the comments." },
  ]
}
