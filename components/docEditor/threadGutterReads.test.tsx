import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import type { ThreadView } from "@/components/threads/types"
import { TEST_TODAY } from "@/lib/testing/testClock"

// I20, no layout read per key (docs perf budget bigLayoutReadsPerKey, B1). The
// margin's markers are placed again after typing pauses; a doc with no thread
// to mark has nothing to place, and still read the page's layout each time
// (review, 15 Oct 2026: 0.1 reads a key on the 2,000-block doc).

const threads: { current: ThreadView[] } = { current: [] }
const resolved: { current: Map<string, { state: string; from: number; to: number }> } = { current: new Map() }

vi.mock("@/components/docComments/useDocThreads", () => ({ useDocThreads: () => ({ threads: threads.current }) }))
vi.mock("@/components/docComments/commentsUi", () => ({
    useOpenComments: () => () => {},
    useUi: () => null,
    uiOf: () => ({ hovered: null }),
    setUi: () => {},
}))
vi.mock("@/components/minimal-tiptap/extensions/anchor-decorations/anchorDecorations", () => ({
    anchorDecorationsKey: { getState: () => ({ resolved: resolved.current }) },
}))

import ThreadGutter from "./ThreadGutter"

const thread = (id: string): ThreadView => ({
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: id },
    status: "open",
    created_by: "u",
    created_at: "2026-10-12T09:00:00Z",
    updated_at: "2026-10-12T09:00:00Z",
    comments: [],
    participants: [],
    unread: false,
    can_reply: true,
    can_resolve: true,
})

/** An editor as the gutter uses one: its state, its view's box and carets, and its transactions. */
function fakeEditor() {
    const handlers = new Set<() => void>()
    const dom = document.createElement("div")
    const editor = {
        isDestroyed: false,
        state: {},
        view: { dom, coordsAtPos: () => ({ top: 40, bottom: 60, left: 0, right: 0 }) },
        on: (_: string, fn: () => void) => void handlers.add(fn),
        off: (_: string, fn: () => void) => void handlers.delete(fn),
    }
    return { editor: editor as unknown as Editor, typed: () => handlers.forEach((fn) => fn()) }
}

let reads = 0
let restore: () => void = () => {}
beforeEach(() => {
    // The threads are dated: the clock is the suite's today (lib/testing/testClock).
    vi.useFakeTimers({ now: TEST_TODAY })
    reads = 0
    const orig = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
        reads++
        return orig.call(this)
    }
    restore = () => (Element.prototype.getBoundingClientRect = orig)
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never
    globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
    } as never
})
afterEach(() => {
    cleanup()
    restore()
    vi.useRealTimers()
})

/** Types a few keys, then lets the gutter's pause and frame pass. */
async function typeAndPause(typed: () => void) {
    for (let i = 0; i < 5; i++) {
        act(() => typed())
        await act(async () => void vi.advanceTimersByTime(45))
    }
    await act(async () => void vi.advanceTimersByTime(500))
}

describe("the margin's markers, placed as typing pauses", () => {
    it("read no layout in a doc with no thread to mark", async () => {
        threads.current = []
        resolved.current = new Map()
        const { editor, typed } = fakeEditor()
        render(<ThreadGutter docId="d1" editor={editor} />)
        await act(async () => void vi.advanceTimersByTime(500))
        reads = 0
        await typeAndPause(typed)
        expect(reads).toBe(0)
    })

    it("read none for threads that are resolved or not on the doc's words", async () => {
        threads.current = [{ ...thread("done"), status: "resolved" }, thread("lost")]
        resolved.current = new Map([
            ["done", { state: "attached", from: 3, to: 6 }],
            ["lost", { state: "orphaned", from: 0, to: 0 }],
        ])
        const { editor, typed } = fakeEditor()
        render(<ThreadGutter docId="d1" editor={editor} />)
        await act(async () => void vi.advanceTimersByTime(500))
        reads = 0
        await typeAndPause(typed)
        expect(reads).toBe(0)
    })

    it("still place an open thread's marker, once typing pauses", async () => {
        threads.current = [thread("open")]
        resolved.current = new Map([["open", { state: "attached", from: 3, to: 6 }]])
        const { editor, typed } = fakeEditor()
        const { container } = render(<ThreadGutter docId="d1" editor={editor} />)
        await act(async () => void vi.advanceTimersByTime(500))
        expect(container.querySelectorAll("[data-thread-marker]")).toHaveLength(1)
        reads = 0
        await typeAndPause(typed)
        // One pass after the pause, not one a key.
        expect(reads).toBe(1)
    })
})
