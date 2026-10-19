import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

// The doc AI bar on a phone is a sheet (DocAiOverlay), and the sheet heard
// Esc first: a question went back to the actions on a computer, and on a
// phone the sheet closed with the bar. Its keys are the bar's in the sheet
// too (one press, one thing; lib/keys/escapeOwn).

vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: vi.fn() }))
vi.mock("@/lib/ai/docAIApi", () => ({
  getDocAIModel: vi.fn(async () => ({ name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true })),
  getDocAIStarters: vi.fn(async () => null),
  recordAppliedEdit: vi.fn(async () => undefined),
  findDocTasks: vi.fn(),
  makeDocTasks: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false }), useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isTablet: false, isDesktop: false }) }))

import { Proposals } from "@/components/minimal-tiptap/extensions/proposals"
import { DocAiMarkers } from "./docAiPlugin"
import { aiBarOf, openAiBar } from "./docAiStore"
import DocAiOverlay from "./DocAiOverlay"

// The bar loads the first time it opens (React.lazy): here once, before the
// test, so its first sight of the sheet waits on nothing a busy machine slows.
beforeAll(async () => {
  await import("./DocAiBar")
}, 60_000)

let editor: Editor
beforeEach(() => {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Proposals, DocAiMarkers.configure({ docId: "d1" })],
    content: "<p>We ship on Thursday.</p><p></p>",
  })
})
afterEach(() => {
  cleanup()
  editor.destroy()
})

describe("the doc AI bar on a phone", () => {
  it("takes a question back to the actions with Esc, and the sheet stays; the next Esc closes it", async () => {
    openAiBar(editor, { docId: "d1", from: 1, to: 1, mode: "actions", source: "action" })
    render(<DocAiOverlay editor={editor} docId="d1" />)
    await screen.findByRole("combobox")
    fireEvent.click(screen.getByText("Ask about this doc…"))
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Ask about this doc…")
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    expect(aiBarOf(editor).open).toBe(true)
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Ask AI to write, or pick an action…")
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    expect(aiBarOf(editor).open).toBe(false)
  })
})
