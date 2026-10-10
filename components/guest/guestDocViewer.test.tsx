import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A guest doc whose live connection opened but never synced (the link turned
// off between the check and the connect, or the collaboration service down)
// used to show the editor at once: an empty document, with nothing to say the
// guest wasn't looking at the real thing.
const collab = vi.hoisted(() => ({ provider: null as unknown, synced: false }))
vi.mock("@/hooks/useCollaborationProvider", () => ({ useCollaborationProvider: () => ({ provider: collab.provider, synced: collab.synced }) }))
vi.mock("@/components/minimal-tiptap/hooks/use-minimal-tiptap", () => ({ useMinimalTiptapEditor: () => ({}) }))
vi.mock("@tiptap/react", () => ({ EditorContent: () => <div>The document</div> }))

import { GuestDocViewer, GUEST_DOC_SLOW_MS } from "./GuestDocViewer"

const view = () => render(<GuestDocViewer documentName="doc-1" tokenFetcher={async () => "jwt"} />)

describe("a guest's live document", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    collab.provider = {}
    collab.synced = false
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("holds the document's shape until it has the document, not an empty page", () => {
    view()
    expect(screen.queryByText("The document")).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Opening the document…")
  })

  it("says so when the document doesn't come, and keeps trying", () => {
    view()
    act(() => vi.advanceTimersByTime(GUEST_DOC_SLOW_MS + 10))
    expect(screen.getByRole("status")).toHaveTextContent("Can't reach the document right now; still trying.")
  })

  it("shows the document once it has synced", () => {
    collab.synced = true
    view()
    expect(screen.getByText("The document")).toBeInTheDocument()
  })

  // A blip in the network sets the hook's synced flag back to false, and the
  // provider never says "synced" again while its socket survived the blip. The
  // document used to be swapped for the skeleton, then "Can't reach the
  // document", for good, though it was connected all along.
  it("keeps showing the document once it has arrived, through a network blip", () => {
    collab.synced = true
    const { rerender } = view()
    expect(screen.getByText("The document")).toBeInTheDocument()
    collab.synced = false
    rerender(<GuestDocViewer documentName="doc-1" tokenFetcher={async () => "jwt"} />)
    act(() => vi.advanceTimersByTime(GUEST_DOC_SLOW_MS + 10))
    expect(screen.getByText("The document")).toBeInTheDocument()
  })
})
