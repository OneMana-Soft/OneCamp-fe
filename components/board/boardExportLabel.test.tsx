import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

// The board's label is read by its key, as the server answers it.
const reads = vi.hoisted(() => ({ byKey: {} as Record<string, unknown> }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => ({ data: url ? reads.byKey[url] : undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import BoardExport from "./boardExport"

const api = { getSceneElements: () => [] } as unknown as ExcalidrawImperativeAPI
const provider = { document: new Y.Doc() } as unknown as HocuspocusProvider
const exportButton = () => document.querySelector("[data-board-export-run]") as HTMLButtonElement

afterEach(() => {
  cleanup()
  reads.byKey = {}
})

describe("a board's Export dialog while its sensitivity label holds exports back (miro-44 L)", () => {
  it("says the label and the rule, and makes nothing to export", () => {
    reads.byKey["/labels/items/board/b-1"] = { data: { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_guest_links", "no_export"] } }
    render(<BoardExport api={api} provider={provider} title="Launch retro" boardId="b-1" onClose={() => {}} />)
    const note = document.querySelector("[data-label-held='no_export']")!
    expect(note.textContent).toContain("Labelled Confidential · No exports")
    expect(exportButton().disabled).toBe(true)
  })

  it("exports as it always did under a label without the rule, or none", () => {
    reads.byKey["/labels/items/board/b-1"] = { data: { id: "l-i", name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] } }
    const { unmount } = render(<BoardExport api={api} provider={provider} title="Launch retro" boardId="b-1" onClose={() => {}} />)
    expect(document.querySelector("[data-label-held]")).toBeNull()
    expect(exportButton().disabled).toBe(false)
    unmount()
    reads.byKey = {}
    render(<BoardExport api={api} provider={provider} title="Launch retro" boardId="b-1" onClose={() => {}} />)
    expect(screen.getByText("Export this board")).toBeTruthy()
    expect(exportButton().disabled).toBe(false)
  })
})
