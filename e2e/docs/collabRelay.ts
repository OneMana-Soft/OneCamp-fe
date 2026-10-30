import type { Page, Route, WebSocketRoute } from "@playwright/test"
import * as Y from "yjs"

/**
 * A collaboration server for two-client doc tests, in the test process: the
 * doc pages' collaboration sockets are routed here (never to a real server),
 * and it speaks the Hocuspocus protocol the web app's provider speaks. Each doc
 * is a Y.Doc here: what one page writes reaches the others, as the
 * collaboration service would send it, and awareness (carets, names) is
 * passed between them as it comes.
 *
 * It accepts every token, as read-write, and keeps nothing after the test:
 * what is under test is the editor in two browsers, not the server (the
 * collaboration service has its own suite).
 */

const SYNC = 0
const AWARENESS = 1
const AUTH = 2
const QUERY_AWARENESS = 3
const SYNC_STATUS = 8
const STEP1 = 0
const STEP2 = 1
const UPDATE = 2
const AUTHENTICATED = 2

class Writer {
  bytes: number[] = []
  uint(n: number) {
    while (n > 0x7f) {
      this.bytes.push((n & 0x7f) | 0x80)
      n = Math.floor(n / 128)
    }
    this.bytes.push(n)
    return this
  }
  data(b: Uint8Array) {
    this.uint(b.length)
    for (const x of b) this.bytes.push(x)
    return this
  }
  string(s: string) {
    return this.data(new TextEncoder().encode(s))
  }
  done() {
    return Buffer.from(this.bytes)
  }
}

class Reader {
  private i = 0
  constructor(private b: Uint8Array) {}
  uint() {
    let n = 0
    let m = 1
    for (;;) {
      const x = this.b[this.i++]
      n += (x & 0x7f) * m
      if (x < 0x80) return n
      m *= 128
    }
  }
  data() {
    const n = this.uint()
    const v = this.b.subarray(this.i, this.i + n)
    this.i += n
    return v
  }
  string() {
    return new TextDecoder().decode(this.data())
  }
}

interface Connection {
  ws: WebSocketRoute
  who: string
  docs: Set<string>
  /** The last awareness update this connection sent, by doc. */
  awareness: Map<string, Uint8Array>
}

export class CollabRelay {
  readonly docs = new Map<string, Y.Doc>()
  private connections = new Set<Connection>()
  /** Every message the pages sent, for a test to read (type by doc). */
  readonly received: Array<{ who: string; doc: string; type: number }> = []
  /**
   * What a page's editor threw while taking an update, by who: y-protocols
   * catches it, logs it and goes on, leaving that editor behind its doc.
   */
  readonly updateErrors: string[] = []
  /** The network is gone (drop): open sockets were closed, and new ones close at once. */
  private down = false

  doc(name: string): Y.Doc {
    let d = this.docs.get(name)
    if (!d) this.docs.set(name, (d = new Y.Doc()))
    return d
  }

  /** Routes a page's collaboration socket here (the one that sends the schema hash). */
  async attach(page: Page, who: string) {
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().startsWith("Caught error while handling a Yjs update")) this.updateErrors.push(`${who}: ${m.text()}`)
    })
    await page.routeWebSocket(/[?&]schema=/, (ws) => {
      if (this.down) {
        void ws.close({ code: 4000, reason: "collab relay: the network is gone" }).catch(() => {})
        return
      }
      const connection: Connection = { ws, who, docs: new Set(), awareness: new Map() }
      this.connections.add(connection)
      ws.onMessage((message) => {
        if (typeof message === "string") return
        try {
          this.receive(connection, new Uint8Array(message))
        } catch (e) {
          console.error(`collab relay: a message from ${who} could not be read`, e)
        }
      })
      ws.onClose(() => {
        this.connections.delete(connection)
      })
    })
  }

  /**
   * The network goes (true) or comes back (false) for every page here: the
   * open sockets close, and a socket opened meanwhile closes at once, as on a
   * connection that's gone (Playwright's setOffline leaves a routed socket open).
   */
  drop(down: boolean) {
    this.down = down
    if (!down) return
    for (const c of [...this.connections]) {
      this.connections.delete(c)
      void c.ws.close({ code: 4000, reason: "collab relay: the network is gone" }).catch(() => {})
    }
  }

  private send(to: Connection, doc: string, write: (w: Writer) => void) {
    const w = new Writer().string(doc)
    write(w)
    to.ws.send(w.done())
  }

  private others(from: Connection, doc: string) {
    return [...this.connections].filter((c) => c !== from && c.docs.has(doc))
  }

  private receive(from: Connection, bytes: Uint8Array) {
    const r = new Reader(bytes)
    const name = r.string()
    const type = r.uint()
    this.received.push({ who: from.who, doc: name, type })
    const doc = this.doc(name)
    switch (type) {
      case AUTH: {
        r.uint() // a token
        r.string()
        from.docs.add(name)
        this.send(from, name, (w) => w.uint(AUTH).uint(AUTHENTICATED).string("read-write"))
        // Who is here already, as the server tells a tab that joins.
        for (const other of this.others(from, name)) {
          const update = other.awareness.get(name)
          if (update) this.send(from, name, (w) => w.uint(AWARENESS).data(update))
        }
        return
      }
      case SYNC: {
        const step = r.uint()
        const payload = r.data()
        if (step === STEP1) {
          // What it lacks, then what this side has, so it sends what it has.
          this.send(from, name, (w) => w.uint(SYNC).uint(STEP2).data(Y.encodeStateAsUpdate(doc, payload)))
          this.send(from, name, (w) => w.uint(SYNC).uint(STEP1).data(Y.encodeStateVector(doc)))
          return
        }
        if (step === STEP2 || step === UPDATE) {
          Y.applyUpdate(doc, payload, from)
          for (const to of this.others(from, name)) this.send(to, name, (w) => w.uint(SYNC).uint(UPDATE).data(payload))
          this.send(from, name, (w) => w.uint(SYNC_STATUS).uint(1))
        }
        return
      }
      case AWARENESS: {
        const update = r.data()
        from.awareness.set(name, update)
        for (const to of this.others(from, name)) this.send(to, name, (w) => w.uint(AWARENESS).data(update))
        return
      }
      case QUERY_AWARENESS: {
        for (const other of this.others(from, name)) {
          const update = other.awareness.get(name)
          if (update) this.send(from, name, (w) => w.uint(AWARENESS).data(update))
        }
        return
      }
    }
  }
}

/**
 * The network gone while the device still says it's online (Wi-Fi with no
 * internet, a dead cell link): every request fails, and the relay's sockets
 * close and can't come back. navigator.onLine stays true, which Playwright's
 * setOffline would not leave it. Returns the network's return.
 */
export async function networkDies(page: Page, relay: CollabRelay) {
  const dead = (route: Route) => route.abort("internetdisconnected")
  await page.route("**/*", dead)
  relay.drop(true)
  return async () => {
    await page.unroute("**/*", dead)
    relay.drop(false)
  }
}
