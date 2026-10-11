import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Y from "yjs"

// The provider is replaced by a stand-in that records its configuration, so
// the tests can play the server's side: refusing a doc, saying the editor is
// out of date, or saying the doc is now another copy.
type Fake = {
  config: Record<string, any>
  document: Y.Doc
  hasUnsyncedChanges: boolean
  destroy: ReturnType<typeof vi.fn>
  setAwarenessField: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
}
const created: Fake[] = []
vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: vi.fn().mockImplementation((config: Record<string, any>) => {
    const fake: Fake = { config, document: new Y.Doc(), hasUnsyncedChanges: false, destroy: vi.fn(), setAwarenessField: vi.fn(), connect: vi.fn() }
    created.push(fake)
    return fake
  }),
}))
vi.mock("@/lib/collabToken", () => ({ memberCollabToken: async () => "token", forgetCollabToken: vi.fn() }))

import { useCollaborationProvider, collabUrl, UNAVAILABLE_REASON } from "@/hooks/useCollaborationProvider"
import { SCHEMA_MANIFEST_HASH } from "@/components/minimal-tiptap/schemaManifest"
import { isSchemaOutdated, resetSchemaOutdated } from "@/lib/schemaOutdated"

const latest = () => created[created.length - 1]
const stamp = (doc: Y.Doc, epoch: string) => doc.getMap("meta").set("epoch", epoch)

beforeEach(() => {
  created.length = 0
  vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "wss://collab.example.test")
})
afterEach(() => {
  cleanup()
  resetSchemaOutdated()
  vi.unstubAllEnvs()
})

function open(keepEdits?: () => { html: string; text: string } | null) {
  return renderHook(() =>
    useCollaborationProvider({ enabled: true, documentId: "doc-1", username: "Sam", userId: "u-1", keepEdits }),
  )
}

describe("the collaboration connection", () => {
  it("sends the schema manifest hash this build was made with", () => {
    open()
    expect(latest().config.url).toBe(`wss://collab.example.test?schema=${SCHEMA_MANIFEST_HASH}`)
    expect(collabUrl("")).toBe("")
    expect(collabUrl("wss://x/?a=1")).toBe(`wss://x/?a=1&schema=${SCHEMA_MANIFEST_HASH}`)
  })

  it("says a doc the server could not read couldn't be opened, and Retry opens it afresh", () => {
    const { result } = open()
    act(() => latest().config.onAuthenticationFailed({ reason: UNAVAILABLE_REASON }))
    expect(result.current.openError).toBe("unavailable")
    expect(result.current.synced).toBe(false)
    act(() => result.current.retry())
    expect(created).toHaveLength(2)
    expect(created[0].destroy).toHaveBeenCalled()
    expect(result.current.openError).toBeNull()
  })

  it("stops editing and asks for a reload when the server says the editor is out of date", () => {
    const { result } = open()
    act(() => latest().config.onStateless({ payload: JSON.stringify({ type: "schema-outdated" }) }))
    expect(result.current.readOnly).toBe(true)
    expect(isSchemaOutdated()).toBe(true)
  })

  it("is read-only when the server opened it read-only", () => {
    const { result } = open()
    act(() => latest().config.onAuthenticated({ scope: "readonly" }))
    expect(result.current.readOnly).toBe(true)
    act(() => latest().config.onAuthenticated({ scope: "read-write" }))
    expect(result.current.readOnly).toBe(false)
  })

  // The demo's "Q4 launch plan" gained a full copy of itself per reconnect:
  // the tab merged its copy with the server's rebuilt one. A tab whose copy is
  // not the server's drops it and opens the doc again.
  it("drops its copy, instead of merging, when the server says the doc is another copy", () => {
    const keepEdits = vi.fn(() => ({ html: "<p>mine</p>", text: "mine" }))
    const { result } = open(keepEdits)
    const first = latest()
    act(() => first.config.onStateless({ payload: JSON.stringify({ type: "epoch-changed" }) }))
    expect(created).toHaveLength(2)
    expect(first.destroy).toHaveBeenCalled()
    expect(latest().document).not.toBe(first.document)
    // Nothing unsent: nothing kept.
    expect(keepEdits).not.toHaveBeenCalled()
    expect(result.current.recovered).toBeNull()
  })

  it("keeps edits the server never confirmed aside, for the person to copy back", () => {
    const keepEdits = vi.fn(() => ({ html: "<p>typed offline</p>", text: "typed offline" }))
    const { result } = open(keepEdits)
    const first = latest()
    first.hasUnsyncedChanges = true
    act(() => first.config.onStateless({ payload: JSON.stringify({ type: "epoch-changed" }) }))
    expect(result.current.recovered?.text).toBe("typed offline")
    expect(result.current.recovered?.html).toBe("<p>typed offline</p>")
    // The fresh copy holds none of it: it was not merged.
    expect(latest().document.getXmlFragment("default").length).toBe(0)
    act(() => result.current.dismissRecovered())
    expect(result.current.recovered).toBeNull()
  })

  it("notices on a later sync that the doc is another copy (a different epoch)", () => {
    const { result } = open()
    const first = latest()
    stamp(first.document, "epoch-1")
    act(() => first.config.onSynced())
    expect(result.current.synced).toBe(true)
    // Reconnected: the server's copy came from another body.
    stamp(first.document, "epoch-2")
    act(() => first.config.onSynced())
    expect(created).toHaveLength(2)
    expect(first.destroy).toHaveBeenCalled()
  })

  it("does not spin when a server keeps asking", () => {
    open()
    for (let i = 0; i < 10; i++) act(() => latest().config.onStateless({ payload: JSON.stringify({ type: "epoch-changed" }) }))
    expect(created.length).toBeLessThanOrEqual(4)
  })
})
