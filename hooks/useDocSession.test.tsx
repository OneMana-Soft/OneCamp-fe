import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type * as Y from "yjs"

// The doc session over the real provider and socket, against an in-memory
// server speaking the collaboration service's protocol, with and without the
// session message (an older service).
const tokenNow = { value: "editor" }
vi.mock("@/lib/collabToken", () => ({ memberCollabToken: async () => tokenNow.value, forgetCollabToken: vi.fn() }))

import { createFakeCollab, docUpdate, fakeWebSocketClass } from "@/scripts/fluidity/fakeCollab.mjs"
import { useDocSession, type DocSessionInput } from "@/hooks/useDocSession"
import { SESSION_TIMING, resetCollabSessionsForTests } from "@/lib/collabSession"
import { SOCKET_TIMING, resetCollabSocketForTests } from "@/lib/collabSocket"

let server: ReturnType<typeof createFakeCollab>
let sockets: unknown[]
const levels: Record<string, string> = { editor: "edit", owner: "full", viewer: "view", commenter: "comment" }
const denials = new Map<string, string>()
const saved = { ...SESSION_TIMING }
const savedSocket = { ...SOCKET_TIMING }

function serve(speaksSession = true) {
  server = createFakeCollab({
    speaksSession,
    docs: { "doc-1": docUpdate(["We launch on the last Tuesday."], { epoch: "E1" }) },
    policy: (token: string) => {
      if (denials.has(token)) return { deny: denials.get(token) }
      // An older service signs in editors only (the API answered others 403).
      if (!speaksSession && !["editor", "owner"].includes(token)) return { deny: "permission-denied" }
      return { level: levels[token] ?? "none" }
    },
  })
  sockets = []
  vi.stubGlobal("WebSocket", fakeWebSocketClass(server, sockets))
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "wss://collab.example.test")
  Object.assign(SESSION_TIMING, { lingerMs: 200, legacyDetectMs: 100, retryDelaysMs: [] })
  Object.assign(SOCKET_TIMING, { idleMs: 200 })
  tokenNow.value = "editor"
  denials.clear()
  serve()
})
afterEach(() => {
  cleanup()
  resetCollabSessionsForTests()
  resetCollabSocketForTests()
  Object.assign(SESSION_TIMING, saved)
  Object.assign(SOCKET_TIMING, savedSocket)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const sam = { id: "u-1", name: "Sam", color: "#123456" }
const text = (doc: Y.Doc) => doc.getXmlFragment("default").toString()

describe("the doc session", () => {
  it("connects from the doc id at once: no profile, no details", async () => {
    // The doc's details haven't loaded (level none) and nor has the person.
    const { result } = renderHook(() => useDocSession({ docId: "doc-1", level: "none" }))
    expect(result.current.provider).not.toBeNull()
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(result.current.access).toEqual({ level: "edit", canEdit: true, locked: false })
    expect(result.current.lineage).toBe("E1")
  })

  it("edits nothing until the server has said", () => {
    const { result } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "full" }))
    expect(result.current.access.canEdit).toBe(false)
  })

  it("connects readers and commenters live and read-only, and they see edits", async () => {
    for (const who of ["viewer", "commenter"] as const) {
      tokenNow.value = who
      const { result, unmount } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "edit" }))
      await waitFor(() => expect(result.current.synced).toBe(true))
      // The server's word, not the details': a reader never gets an editable editor.
      expect(result.current.access).toEqual({ level: who === "viewer" ? "view" : "comment", canEdit: false, locked: false })
      act(() =>
        server.edit("doc-1", (d: Y.Doc) => {
          const fragment = d.getXmlFragment("default")
          fragment.delete(0, fragment.length)
        }),
      )
      await waitFor(() => expect(text(result.current.provider!.document)).not.toContain("last Tuesday"))
      unmount()
      resetCollabSessionsForTests()
      serve()
    }
  })

  it("reads someone with no access, or a deleted doc, as no access at all", async () => {
    for (const reason of ["forbidden", "gone"]) {
      tokenNow.value = "stranger"
      denials.set("stranger", reason)
      const { result, unmount } = renderHook(() => useDocSession({ docId: "doc-1", level: "view" }))
      await waitFor(() => expect(result.current.refused).toBe(reason))
      expect(result.current.access).toEqual({ level: "none", canEdit: false, locked: false })
      expect(result.current.synced).toBe(false)
      unmount()
      resetCollabSessionsForTests()
      resetCollabSocketForTests()
      serve()
    }
  })

  it("relays when the server stored the doc", async () => {
    const { result } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "edit" }))
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(result.current.persistedAt).toBeNull()
    act(() => server.tell("doc-1", { type: "persisted", at: 1_700_000_000_000 }))
    await waitFor(() => expect(result.current.persistedAt).toBe(1_700_000_000_000))
  })

  it("keeps one connection while the page re-renders with the same input", async () => {
    const input: DocSessionInput = { docId: "doc-1", user: sam, level: "edit" }
    const { result, rerender } = renderHook(() => useDocSession(input))
    await waitFor(() => expect(result.current.synced).toBe(true))
    const provider = result.current.provider
    rerender()
    expect(result.current.provider).toBe(provider)
    expect(sockets).toHaveLength(1)
  })

  describe("against a collaboration service from before sessions", () => {
    beforeEach(() => serve(false))

    it("lets an editor edit as the doc's details say", async () => {
      const { result } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "edit" }))
      await waitFor(() => expect(result.current.access.canEdit).toBe(true))
      await waitFor(() => expect(result.current.legacy).toBe(true))
    })

    it("never lets details that say view edit, even on a read-write connection", async () => {
      const { result } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "view" }))
      await waitFor(() => expect(result.current.synced).toBe(true))
      expect(result.current.access.canEdit).toBe(false)
    })

    it("leaves a reader on the saved body: refused, read-only", async () => {
      tokenNow.value = "viewer"
      const { result } = renderHook(() => useDocSession({ docId: "doc-1", user: sam, level: "view" }))
      await waitFor(() => expect(result.current.refused).toBe("permission-denied"))
      expect(result.current.access.canEdit).toBe(false)
      expect(result.current.synced).toBe(false)
    })
  })
})
