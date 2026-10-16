import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

// The real Hocuspocus provider and socket, over a WebSocket answered by an
// in-memory server that speaks the same protocol (scripts/fluidity/fakeCollab).
const tokenNow = { value: "editor" }
vi.mock("@/lib/collabToken", () => ({
  memberCollabToken: async () => tokenNow.value,
  forgetCollabToken: vi.fn(),
}))

import { createFakeCollab, docUpdate, fakeWebSocketClass } from "@/scripts/fluidity/fakeCollab.mjs"
import {
  MAX_IDLE_SESSIONS,
  SESSION_TIMING,
  collabSession,
  liveSessionNames,
  prefetchCollabSession,
  resetCollabSessionsForTests,
  type CollabSession,
} from "@/lib/collabSession"
import { SOCKET_TIMING, collabSocket, collabSocketConnections, resetCollabSocketForTests, reviveCollabSocket } from "@/lib/collabSocket"
import { SCHEMA_MANIFEST_HASH } from "@/components/minimal-tiptap/schemaManifest"
import { isSchemaOutdated, resetSchemaOutdated } from "@/lib/schemaOutdated"

type Fake = ReturnType<typeof createFakeCollab>
let server: Fake
let sockets: Array<{ url: string; close(): void; readyState: number }>
const levels = new Map<string, string>()
const denials = new Map<string, string>()
const saved = { ...SESSION_TIMING, retryDelaysMs: [...SESSION_TIMING.retryDelaysMs] }
const savedSocket = { ...SOCKET_TIMING }

function start(options: Record<string, unknown> = {}) {
  server = createFakeCollab({
    docs: { "doc-1": docUpdate(["We launch on the last Tuesday."], { epoch: "E1" }), "doc-2": docUpdate(["Two"]), ...(options.docs as object) },
    policy: (token: string) => {
      const deny = denials.get(token)
      if (deny) return { deny }
      return { level: levels.get(token) ?? "edit" }
    },
    ...options,
  })
  sockets = []
  vi.stubGlobal("WebSocket", fakeWebSocketClass(server, sockets))
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "wss://collab.example.test")
  Object.assign(SESSION_TIMING, { lingerMs: 400, prefetchLingerMs: 300, legacyWaitMs: 150, sessionWaitMs: 2_000, legacyDetectMs: 150, retryDelaysMs: [30, 30, 30] })
  Object.assign(SOCKET_TIMING, { idleMs: 300, closeWaitMs: 500 })
  tokenNow.value = "editor"
  levels.clear()
  denials.clear()
  start()
})

afterEach(() => {
  resetCollabSessionsForTests()
  resetCollabSocketForTests()
  resetSchemaOutdated()
  Object.assign(SESSION_TIMING, saved)
  Object.assign(SOCKET_TIMING, savedSocket)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const text = (doc: Y.Doc) => doc.getXmlFragment("default").toString()
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1
const until = (fn: () => void, timeout = 3000) => vi.waitFor(fn, { timeout, interval: 10 })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function paragraph(doc: Y.Doc, words: string) {
  const p = new Y.XmlElement("paragraph")
  p.insert(0, [new Y.XmlText(words)])
  doc.getXmlFragment("default").push([p])
}

async function open(name: string, opts: { keepEdits?: () => { html: string; text: string } | null } = {}) {
  const s = collabSession(name)
  const release = s.acquire(opts)
  await until(() => expect(s.getSnapshot().synced).toBe(true))
  return { s, release, doc: s.getSnapshot().provider!.document }
}

/** Drops the browser's connection, as a network blip would, and brings it back. */
async function blip(during?: () => void) {
  sockets.at(-1)!.close()
  await until(() => expect(collabSocket().status).toBe("disconnected"))
  during?.()
  reviveCollabSocket()
}

describe("one socket per tab", () => {
  it("opens five docs, and one of them again, over one connection that carries the schema hash", async () => {
    const names = ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"]
    for (const name of names) {
      const { release } = await open(name)
      release()
    }
    const again = await open("doc-1")
    expect(text(again.doc)).toContain("last Tuesday")
    expect(sockets).toHaveLength(1)
    expect(collabSocketConnections()).toBe(1)
    expect(sockets[0].url).toBe(`wss://collab.example.test?schema=${SCHEMA_MANIFEST_HASH}`)
  })

  it("closes the socket once nothing has held it for a while", async () => {
    const { release } = await open("doc-2")
    release()
    await until(() => expect(liveSessionNames()).toEqual([]), 2000)
    await until(() => expect(collabSocket().status).toBe("disconnected"), 2000)
  })
})

describe("what the server decided", () => {
  it("connects a reader read-only: told so, sees edits at once, writes nothing", async () => {
    tokenNow.value = "viewer"
    levels.set("viewer", "view")
    const { s, doc } = await open("doc-1")
    const snap = s.getSnapshot()
    expect(snap.access).toEqual({ level: "view", canEdit: false, locked: false })
    expect(snap.scope).toBe("readonly")
    expect(snap.readOnly).toBe(true)
    expect(snap.lineage).toBe("E1")
    await until(() => expect(s.getSnapshot().provider!.awareness!.getLocalState()?.mode).toBe("viewing"))

    const t0 = performance.now()
    server.edit("doc-1", (d: Y.Doc) => paragraph(d, "typed by the owner"))
    await until(() => expect(text(doc)).toContain("typed by the owner"), 1000)
    expect(performance.now() - t0).toBeLessThan(1000)

    paragraph(doc, "the reader's own")
    await sleep(50)
    expect(text(server.doc("doc-1"))).not.toContain("the reader's own")
  })

  it("lets an editor edit, and says so in presence", async () => {
    const { s } = await open("doc-1")
    expect(s.getSnapshot().access).toEqual({ level: "edit", canEdit: true, locked: false })
    expect(s.getSnapshot().scope).toBe("read-write")
    expect(s.getSnapshot().provider!.awareness!.getLocalState()?.mode).toBe("editing")
  })

  it("takes a final refusal as final", async () => {
    tokenNow.value = "stranger"
    denials.set("stranger", "forbidden")
    const s = collabSession("doc-1")
    s.acquire()
    await until(() => expect(s.getSnapshot().refused).toBe("forbidden"))
    expect(s.getSnapshot().access).toEqual({ level: "none", canEdit: false, locked: false })
    await sleep(200)
    expect(server.stats.auths).toBe(1)
    expect(s.getSnapshot().synced).toBe(false)
  })

  it("tries a refusal that may pass again, on a connection that can take it", async () => {
    tokenNow.value = "late"
    denials.set("late", "unauthenticated")
    const s = collabSession("doc-1")
    s.acquire()
    await until(() => expect(s.getSnapshot().refused).toBe("unauthenticated"))
    denials.delete("late")
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    expect(s.getSnapshot().refused).toBeNull()
    // The server keeps a refused doc refused on its socket: the retry took a new one.
    expect(sockets.length).toBeGreaterThan(1)
  })

  it("says a doc the server could not read couldn't be opened, and Retry opens it", async () => {
    tokenNow.value = "flaky"
    denials.set("flaky", "document-unavailable")
    const s = collabSession("doc-1")
    s.acquire()
    await until(() => expect(s.getSnapshot().openError).toBe("unavailable"))
    await sleep(100)
    expect(server.stats.auths).toBe(1) // no retry on its own
    denials.delete("flaky")
    s.retry()
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    expect(s.getSnapshot().openError).toBeNull()
  })

  it("stops editing and asks for a reload when the server says the editor is out of date", async () => {
    const { s } = await open("doc-1")
    server.tell("doc-1", { type: "schema-outdated" })
    await until(() => expect(s.getSnapshot().readOnly).toBe(true))
    expect(isSchemaOutdated()).toBe(true)
  })

  it("relays when the server stored the doc, for this copy only", async () => {
    const { s } = await open("doc-1")
    server.tell("doc-1", { type: "persisted", at: 1_700_000_000_000 })
    await until(() => expect(s.getSnapshot().persistedAt).toBe(1_700_000_000_000))
    server.tell("doc-1", { type: "persisted", at: 1_800_000_000_000, lineage: "another" })
    await sleep(50)
    expect(s.getSnapshot().persistedAt).toBe(1_700_000_000_000)
  })
})

describe("one copy (I3)", () => {
  it("a doc closed and opened again at once still syncs: it waits for the server to close it", async () => {
    const first = await open("doc-1")
    first.s.destroy()
    const second = await open("doc-1")
    expect(second.s).not.toBe(first.s)
    expect(count(text(second.doc), "last Tuesday")).toBe(1)
    expect(sockets).toHaveLength(1)
  })

  it("a copy coming back to the same doc sends what was typed while away, once", async () => {
    const { s, doc } = await open("doc-1")
    const provider = s.getSnapshot().provider
    await blip(() => paragraph(doc, "typed offline"))
    await until(() => expect(text(server.doc("doc-1"))).toContain("typed offline"))
    await sleep(50)
    expect(count(text(server.doc("doc-1")), "typed offline")).toBe(1)
    expect(count(text(server.doc("doc-1")), "last Tuesday")).toBe(1)
    expect(s.getSnapshot().provider).toBe(provider) // the same copy, not reopened
  })

  it("a copy coming back to a replaced doc never syncs it: it opens the server's, keeping its edits aside", async () => {
    const keepEdits = vi.fn(() => ({ html: "<p>typed offline</p>", text: "typed offline" }))
    const { s, doc } = await open("doc-1", { keepEdits })
    const old = s.getSnapshot().provider
    const updatesBefore = server.stats.updates
    await blip(() => {
      paragraph(doc, "typed offline")
      // Restored underneath while it was away: a new body, a new lineage.
      server.setDoc("doc-1", docUpdate(["Restored: we launch in March."], { epoch: "E2" }))
    })
    await until(() => expect(s.getSnapshot().provider).not.toBe(old))
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    const fresh = s.getSnapshot().provider!.document
    expect(text(fresh)).toContain("Restored: we launch in March.")
    expect(text(fresh)).not.toContain("last Tuesday")
    // Nothing of the old copy reached the server, its edits included.
    const onServer = text(server.doc("doc-1"))
    expect(onServer).not.toContain("last Tuesday")
    expect(onServer).not.toContain("typed offline")
    expect(server.stats.updates).toBe(updatesBefore)
    expect(s.getSnapshot().lineage).toBe("E2")
    expect(s.getSnapshot().recovered?.text).toBe("typed offline")
    s.dismissRecovered()
    expect(s.getSnapshot().recovered).toBeNull()
  })

  it("drops its copy when the server says it holds another (epoch-changed)", async () => {
    const { s } = await open("doc-1")
    const old = s.getSnapshot().provider
    server.tell("doc-1", { type: "epoch-changed" })
    await until(() => expect(s.getSnapshot().provider).not.toBe(old))
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    expect(s.getSnapshot().recovered).toBeNull() // nothing unsent, nothing kept
  })

  it("does not spin when a server keeps asking", async () => {
    const { s } = await open("doc-1")
    const seen = new Set()
    for (let i = 0; i < 10; i++) {
      seen.add(s.getSnapshot().provider)
      server.tell("doc-1", { type: "epoch-changed" })
      await sleep(30)
    }
    expect(seen.size).toBeLessThanOrEqual(4)
  })

  it("against a server that sends no session, a returning copy waits briefly, then syncs as before", async () => {
    resetCollabSessionsForTests()
    resetCollabSocketForTests()
    start({ speaksSession: false })
    const { s, doc } = await open("doc-1")
    await until(() => expect(s.getSnapshot().legacy).toBe(true))
    expect(s.getSnapshot().access).toBeNull()
    await blip(() => paragraph(doc, "typed offline"))
    await until(() => expect(text(server.doc("doc-1"))).toContain("typed offline"))
    expect(count(text(server.doc("doc-1")), "last Tuesday")).toBe(1)
  })

  it("a board has no lineage to wait for", async () => {
    resetCollabSessionsForTests()
    resetCollabSocketForTests()
    start({ speaksSession: false, docs: { "board:b1": new Uint8Array() } })
    const { s, doc } = await open("board:b1")
    doc.getMap("elements").set("a", 1)
    const t0 = performance.now()
    await blip(() => doc.getMap("elements").set("b", 2))
    await until(() => expect(server.doc("board:b1").getMap("elements").get("b")).toBe(2))
    expect(performance.now() - t0).toBeLessThan(SESSION_TIMING.legacyWaitMs + 1000)
    expect(s.getSnapshot().legacy).toBe(false)
  })
})

describe("opening ahead, and again", () => {
  it("keeps a doc left a moment ago live, so opening it again is the same synced copy", async () => {
    const first = await open("doc-1")
    const provider = first.s.getSnapshot().provider
    first.release()
    // Nobody is shown as present in a doc nobody looks at.
    expect(provider!.awareness!.getLocalState()).toEqual({})
    const again = first.s.acquire()
    expect(first.s.getSnapshot().provider).toBe(provider)
    expect(first.s.getSnapshot().synced).toBe(true)
    again()
    await until(() => expect(liveSessionNames()).not.toContain("doc-1"), 2000)
  })

  it("prefetches a doc on intent once a minute, and the view adopts it", async () => {
    expect(prefetchCollabSession("doc-2")).toBe(true)
    expect(prefetchCollabSession("doc-2")).toBe(false)
    const s = collabSession("doc-2")
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    const provider = s.getSnapshot().provider
    const release = s.acquire()
    expect(s.getSnapshot().provider).toBe(provider)
    expect(server.stats.auths).toBe(1)
    release()
  })

  it("keeps at most a few sessions live with nobody looking", async () => {
    const sessions: CollabSession[] = []
    for (let i = 0; i < MAX_IDLE_SESSIONS + 3; i++) {
      const s = collabSession(`doc-x${i}`)
      sessions.push(s)
      s.acquire()()
      // Left a while ago (a session asked for in the last second is spared).
      s.lastUsed = Date.now() - 5_000 + i
    }
    collabSession("doc-last").acquire()()
    expect(liveSessionNames().length).toBeLessThanOrEqual(MAX_IDLE_SESSIONS + 1)
    expect(sessions[0].destroyed).toBe(true)
    expect(liveSessionNames()).toContain("doc-last")
  })

  it("renders presence only when someone actually changed", async () => {
    const { s } = await open("doc-1")
    const users = s.getSnapshot().users
    s.getSnapshot().provider!.setAwarenessField("refresh", Date.now())
    await sleep(30)
    expect(s.getSnapshot().users).toBe(users)
    s.getSnapshot().provider!.setAwarenessField("user", { id: "u-1", name: "Sam", color: "#123456" })
    await until(() => expect(s.getSnapshot().users).toEqual([{ id: "u-1", name: "Sam", color: "#123456", profileKey: undefined, mode: "editing" }]))
  })
})

describe("a fresh copy", () => {
  it("keeps the person's access while the new copy connects: the editor isn't made read-only and back", async () => {
    const { s } = await open("doc-1")
    const old = s.getSnapshot().provider
    const seen: boolean[] = []
    const stop = s.subscribe(() => seen.push(s.getSnapshot().access?.canEdit ?? false))
    server.tell("doc-1", { type: "epoch-changed" })
    await until(() => expect(s.getSnapshot().provider).not.toBe(old))
    await until(() => expect(s.getSnapshot().synced).toBe(true))
    stop()
    expect(seen.every(Boolean)).toBe(true)
  })
})

describe("access that changes while the doc is open (A5, I10)", () => {
  it("signs the same copy in again when the server closes the doc, and takes the new access", async () => {
    const { s, doc } = await open("doc-1")
    expect(s.getSnapshot().access?.canEdit).toBe(true)
    const provider = s.getSnapshot().provider
    levels.set("editor", "view")
    server.kick("doc-1")
    await until(() => expect(s.getSnapshot().access).toEqual({ level: "view", canEdit: false, locked: false }))
    expect(s.getSnapshot().provider).toBe(provider) // the same copy, still live
    expect(sockets).toHaveLength(1) // on the same socket
    server.edit("doc-1", (d: Y.Doc) => paragraph(d, "after the downgrade"))
    await until(() => expect(text(doc)).toContain("after the downgrade"))
    paragraph(doc, "a write after the downgrade")
    await sleep(50)
    expect(text(server.doc("doc-1"))).not.toContain("a write after the downgrade")
  })

  it("takes a revoke as a refusal", async () => {
    const { s } = await open("doc-1")
    denials.set("editor", "forbidden")
    server.kick("doc-1")
    await until(() => expect(s.getSnapshot().refused).toBe("forbidden"))
    expect(s.getSnapshot().access).toEqual({ level: "none", canEdit: false, locked: false })
  })
})
