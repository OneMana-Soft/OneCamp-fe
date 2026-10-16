import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import * as Y from "yjs"

// The hook over the real provider and socket, against an in-memory server
// speaking the collaboration service's protocol (scripts/fluidity/fakeCollab).
const tokenNow = { value: "editor" }
vi.mock("@/lib/collabToken", () => ({ memberCollabToken: async () => tokenNow.value, forgetCollabToken: vi.fn() }))

import { createFakeCollab, docUpdate, fakeWebSocketClass } from "@/scripts/fluidity/fakeCollab.mjs"
import { useCollaborationProvider, collabUrl, UNAVAILABLE_REASON } from "@/hooks/useCollaborationProvider"
import { SESSION_TIMING, resetCollabSessionsForTests } from "@/lib/collabSession"
import { SOCKET_TIMING, collabSocket, resetCollabSocketForTests, reviveCollabSocket } from "@/lib/collabSocket"
import { SCHEMA_MANIFEST_HASH } from "@/components/minimal-tiptap/schemaManifest"
import { isSchemaOutdated, resetSchemaOutdated } from "@/lib/schemaOutdated"

let server: ReturnType<typeof createFakeCollab>
let sockets: Array<{ url: string }>
const denials = new Map<string, string>()
const saved = { ...SESSION_TIMING }
const savedSocket = { ...SOCKET_TIMING }

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "wss://collab.example.test")
  Object.assign(SESSION_TIMING, { lingerMs: 200, legacyDetectMs: 100, legacyWaitMs: 100 })
  Object.assign(SOCKET_TIMING, { idleMs: 200 })
  tokenNow.value = "editor"
  denials.clear()
  server = createFakeCollab({
    docs: { "doc-1": docUpdate(["We launch on the last Tuesday."], { epoch: "E1" }) },
    policy: (token: string) => (denials.has(token) ? { deny: denials.get(token) } : { level: token === "guest-token" ? "view" : "edit" }),
  })
  sockets = []
  vi.stubGlobal("WebSocket", fakeWebSocketClass(server, sockets))
})
afterEach(() => {
  cleanup()
  resetCollabSessionsForTests()
  resetCollabSocketForTests()
  resetSchemaOutdated()
  Object.assign(SESSION_TIMING, saved)
  Object.assign(SOCKET_TIMING, savedSocket)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const text = (doc: Y.Doc) => doc.getXmlFragment("default").toString()
const config = (extra: Record<string, unknown> = {}) => ({ enabled: true, documentId: "doc-1", username: "Sam", userId: "u-1", ...extra })

describe("the collaboration connection", () => {
  it("sends the schema manifest hash this build was made with", async () => {
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(sockets[0].url).toBe(`wss://collab.example.test?schema=${SCHEMA_MANIFEST_HASH}`)
    expect(collabUrl("")).toBe("")
    expect(collabUrl("wss://x/?a=1")).toBe(`wss://x/?a=1&schema=${SCHEMA_MANIFEST_HASH}`)
    expect(text(result.current.provider!.document)).toContain("last Tuesday")
    expect(result.current.status).toBe("synced")
  })

  it("is disconnected, with no provider, when there is nothing to connect", () => {
    const { result } = renderHook(() => useCollaborationProvider(undefined))
    expect(result.current.provider).toBeNull()
    expect(result.current.status).toBe("disconnected")
    expect(sockets).toHaveLength(0)
  })

  it("says a doc the server could not read couldn't be opened, and Retry opens it", async () => {
    denials.set("editor", UNAVAILABLE_REASON)
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.openError).toBe("unavailable"))
    expect(result.current.synced).toBe(false)
    denials.clear()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(result.current.openError).toBeNull()
  })

  it("stops editing and asks for a reload when the server says the editor is out of date", async () => {
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    act(() => server.tell("doc-1", { type: "schema-outdated" }))
    await waitFor(() => expect(result.current.readOnly).toBe(true))
    expect(isSchemaOutdated()).toBe(true)
  })

  it("is read-only when the server opened it read-only (a guest, through its own token)", async () => {
    const tokenFetcher = vi.fn(async () => "guest-token")
    const { result } = renderHook(() => useCollaborationProvider(config({ tokenFetcher })))
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(tokenFetcher).toHaveBeenCalled()
    expect(result.current.readOnly).toBe(true)
  })

  // The demo's "Q4 launch plan" gained a full copy of itself per reconnect:
  // the tab merged its copy with the server's rebuilt one.
  it("drops its copy, instead of merging, when the server says the doc is another copy", async () => {
    const keepEdits = vi.fn(() => ({ html: "<p>mine</p>", text: "mine" }))
    const { result } = renderHook(() => useCollaborationProvider(config({ keepEdits })))
    await waitFor(() => expect(result.current.synced).toBe(true))
    const first = result.current.provider
    act(() => server.tell("doc-1", { type: "epoch-changed" }))
    await waitFor(() => expect(result.current.provider).not.toBe(first))
    expect(result.current.provider!.document).not.toBe(first!.document)
    // Nothing unsent: nothing kept.
    expect(keepEdits).not.toHaveBeenCalled()
    expect(result.current.recovered).toBeNull()
  })

  it("keeps edits the server never confirmed aside, for the person to copy back", async () => {
    const keepEdits = vi.fn(() => ({ html: "<p>typed offline</p>", text: "typed offline" }))
    const { result } = renderHook(() => useCollaborationProvider(config({ keepEdits })))
    await waitFor(() => expect(result.current.synced).toBe(true))
    result.current.provider!.incrementUnsyncedChanges()
    act(() => server.tell("doc-1", { type: "epoch-changed" }))
    await waitFor(() => expect(result.current.recovered?.text).toBe("typed offline"))
    expect(result.current.recovered?.html).toBe("<p>typed offline</p>")
    await waitFor(() => expect(result.current.synced).toBe(true))
    // The fresh copy holds none of it: it was not merged.
    expect(text(result.current.provider!.document)).not.toContain("typed offline")
    act(() => result.current.dismissRecovered())
    expect(result.current.recovered).toBeNull()
  })

  // A service too old to send a session: the copy coming back after the doc was
  // replaced is refused by the service's own guard, and the tab reloads it.
  it("against an older server, a copy coming back to a replaced doc is dropped, never doubled", async () => {
    resetCollabSocketForTests()
    server = createFakeCollab({ speaksSession: false, docs: { "doc-1": docUpdate(["We launch on the last Tuesday."], { epoch: "E1" }) } })
    sockets = []
    vi.stubGlobal("WebSocket", fakeWebSocketClass(server, sockets))
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    const first = result.current.provider!
    ;(sockets.at(-1) as unknown as { close(): void }).close()
    await waitFor(() => expect(collabSocket().status).toBe("disconnected"))
    server.setDoc("doc-1", docUpdate(["Restored: we launch in March."], { epoch: "E2" }))
    reviveCollabSocket()
    await waitFor(() => expect(result.current.provider).not.toBe(first), { timeout: 3000 })
    await waitFor(() => expect(text(result.current.provider!.document)).toContain("Restored"))
    expect(text(result.current.provider!.document)).not.toContain("last Tuesday")
    expect(text(server.doc("doc-1"))).not.toContain("last Tuesday")
    // Whichever caught it first (the tab's epoch check on syncing, or the
    // service's guard), the old copy never landed on the server.
    expect(server.stats.secondCopies).toBeLessThanOrEqual(1)
  })

  it("lets go when the view goes, and the doc stays live a moment for a quick return", async () => {
    const { result, unmount } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    const provider = result.current.provider
    unmount()
    const again = renderHook(() => useCollaborationProvider(config()))
    expect(again.result.current.provider).toBe(provider)
    expect(again.result.current.synced).toBe(true)
    expect(sockets).toHaveLength(1)
  })
})

// A brief offline/online blip while the socket stayed open left a live doc
// read-only until reload: `offline` dropped `synced` (the frame swapped in the
// saved copy) and `online` called provider.connect(), which does nothing on an
// open socket, so nothing re-synced (journey probe, 12 Oct: not back after
// 80 s). The frame shows the editor while `synced` holds (docInput: the saved
// copy stands in only while a provider has not synced), so `synced` is what
// keeps the doc editable.
describe("an offline blip with the socket still open", () => {
  const paragraph = (text: string) => {
    const p = new Y.XmlElement("paragraph")
    p.insert(0, [new Y.XmlText(text)])
    return p
  }

  it("keeps the doc editable, and live again within a few seconds of coming back", async () => {
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    act(() => { window.dispatchEvent(new Event("offline")) })
    expect(result.current.status).toBe("offline")
    expect(result.current.synced).toBe(true) // the frame keeps the editor, not the saved copy
    act(() => { window.dispatchEvent(new Event("online")) })
    await waitFor(() => expect(result.current.status).toBe("synced"), { timeout: 3000 })
    expect(result.current.synced).toBe(true)
    expect(result.current.readOnly).toBe(false)
    // Live: someone else's typing arrives, and this tab's reaches the server.
    act(() => server.edit("doc-1", (d: Y.Doc) => d.getXmlFragment("default").push([paragraph("Ann was here.")])))
    await waitFor(() => expect(text(result.current.provider!.document)).toContain("Ann was here."))
    act(() => { result.current.provider!.document.getXmlFragment("default").push([paragraph("Sam was here.")]) })
    await waitFor(() => expect(text(server.doc("doc-1"))).toContain("Sam was here."))
    expect(sockets).toHaveLength(1)
  })

  it("compares states with the server on coming back, so what the blip lost arrives", async () => {
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    const socket = sockets.at(-1) as unknown as { losing: boolean }
    act(() => { window.dispatchEvent(new Event("offline")) })
    socket.losing = true
    // Someone else's edit and one of this tab's, both lost on the way.
    act(() => server.edit("doc-1", (d: Y.Doc) => d.getXmlFragment("default").push([paragraph("Ann typed in the blip.")])))
    act(() => { result.current.provider!.document.getXmlFragment("default").push([paragraph("Sam typed in the blip.")]) })
    socket.losing = false
    act(() => { window.dispatchEvent(new Event("online")) })
    await waitFor(() => expect(text(result.current.provider!.document)).toContain("Ann typed in the blip."), { timeout: 3000 })
    await waitFor(() => expect(text(server.doc("doc-1"))).toContain("Sam typed in the blip."), { timeout: 3000 })
    await waitFor(() => expect(result.current.provider!.hasUnsyncedChanges).toBe(false))
    expect(result.current.synced).toBe(true)
    expect(sockets).toHaveLength(1)
    expect(server.stats.secondCopies).toBe(0)
  })

  it("re-syncs over a socket that really dropped while offline", async () => {
    const { result } = renderHook(() => useCollaborationProvider(config()))
    await waitFor(() => expect(result.current.synced).toBe(true))
    act(() => { window.dispatchEvent(new Event("offline")) })
    ;(sockets.at(-1) as unknown as { close(): void }).close()
    await waitFor(() => expect(collabSocket().status).toBe("disconnected"))
    act(() => { window.dispatchEvent(new Event("online")) })
    await waitFor(() => expect(result.current.status).toBe("synced"), { timeout: 3000 })
    act(() => server.edit("doc-1", (d: Y.Doc) => d.getXmlFragment("default").delete(0, 1)))
    await waitFor(() => expect(text(result.current.provider!.document)).not.toContain("last Tuesday"))
  })
})
