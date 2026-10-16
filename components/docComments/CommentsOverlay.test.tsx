import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Editor, Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import type { ThreadView } from "@/components/threads/types"

// A doc's comments in its editor (B7): Comment is claimed for whoever may
// comment and starts a thread on what was chosen; the open threads are drawn
// on their words, and choosing them opens the thread; a reader who may
// comment has a Comment button. (⌘⇧M is the Comment action's page key:
// commentAction.test.ts.)

const open = vi.fn()
let doc = { threads: [] as ThreadView[], canComment: true }
vi.mock("./useDocThreads", () => ({ useDocThreads: () => doc }))
vi.mock("./commentsUi", async (original) => ({
    ...(await original<typeof import("./commentsUi")>()),
    useOpenComments: () => open,
}))
vi.mock("@/lib/collabSession", () => ({
    collabSession: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ synced: true }) }),
}))
// The reader's Comment bubble is the phone's: on a computer the selection bar
// offers a reader Comment (docs incident, 14 Oct 2026). These read as a phone.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false, isTablet: false }) }))
// The bubble's floating shell only, in place (lib/testing/bubbleMenu).
vi.mock("@/components/minimal-tiptap/components/bubble-menu/bubble-menu", () => import("@/lib/testing/bubbleMenu"))

const { AnchorDecorations } = await import("@/components/minimal-tiptap/extensions/anchor-decorations/anchorDecorations")
const { DocBusContext, createDocCommandBus } = await import("@/components/docEditor/registry/commandBus")
const { default: CommentsOverlay } = await import("./CommentsOverlay")
const { useMatches, usePlaces } = await import("./commentsUi")

let restoreRects = () => {}
beforeAll(() => {
    restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const BlockIds = Extension.create({
    name: "testBlockIds",
    addGlobalAttributes: () => [
        {
            types: ["paragraph"],
            attributes: {
                blockId: {
                    default: null,
                    parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
                    renderHTML: (a: { blockId?: string | null }) => (a.blockId ? { "data-block-id": a.blockId } : {}),
                },
            },
        },
    ],
})

const editors: Editor[] = []
afterEach(() => {
    cleanup()
    editors.splice(0).forEach((e) => e.destroy())
    open.mockClear()
    doc = { threads: [], canComment: true }
})

function mount(editable = true) {
    const editor = new Editor({
        element: document.createElement("div"),
        editable,
        extensions: [StarterKit.configure({ history: false }), BlockIds, AnchorDecorations],
        content: '<p data-block-id="b1">Ship on Thursday</p><p data-block-id="b2">Second</p>',
    })
    editors.push(editor)
    document.body.appendChild(editor.view.dom)
    const bus = createDocCommandBus("d1")
    render(
        <DocBusContext.Provider value={bus}>
            <CommentsOverlay docId="d1" editor={editor} />
        </DocBusContext.Provider>,
    )
    return { editor, bus }
}

const thread = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    anchor: { kind: "block", block_id: "b1", quote: "Ship on Thursday" },
    status: "open",
    created_by: "u",
    created_at: "2026-10-12T09:00:00Z",
    updated_at: "2026-10-12T09:00:00Z",
    comments: [],
    participants: [],
    unread: false,
    can_reply: true,
    can_resolve: true,
    ...over,
})

describe("Comment, in the doc", () => {
    it("is claimed for whoever may comment, and starts a thread on what was chosen", () => {
        const { bus } = mount()
        const asked: { from: number; to: number; claimed?: boolean } = { from: 21, to: 21 } // a caret in "Second"
        act(() => bus.emit("comment", asked))
        expect(asked.claimed).toBe(true)
        expect(open).toHaveBeenCalledWith({ start: { kind: "block", block_id: "b2", quote: "Second" } })
    })

    it("is on the blocks the block menu names, never what lies between, and on the range when none is there", () => {
        const { bus } = mount()
        act(() => bus.emit("comment", { from: 0, to: 26, blocks: ["b1", "b2"] }))
        expect(open).toHaveBeenLastCalledWith({
            start: { kind: "block", block_id: "b1", quote: "Ship on Thursday\nSecond", meta: { block_ids: ["b1", "b2"] } },
        })
        act(() => bus.emit("comment", { from: 21, to: 21, blocks: ["gone"] }))
        expect(open).toHaveBeenLastCalledWith({ start: { kind: "block", block_id: "b2", quote: "Second" } })
    })

    it("is left to the page for someone who may only read", () => {
        doc = { threads: [], canComment: false }
        const { bus } = mount(false)
        const asked: { from: number; to: number; claimed?: boolean } = { from: 2, to: 5 }
        act(() => bus.emit("comment", asked))
        expect(asked.claimed).toBeUndefined()
        expect(open).not.toHaveBeenCalled()
        expect(document.querySelector("[data-reader-comment]")).toBeNull()
    })
})

describe("the threads in the doc", () => {
    it("are drawn on their words while open, and choosing them opens the thread", async () => {
        doc = { threads: [thread("t1"), thread("t2", { status: "resolved", anchor: { kind: "block", block_id: "b2" } })], canComment: true }
        const { editor } = mount()
        await waitFor(() => expect(editor.view.dom.querySelector('[data-thread-id="t1"]')).not.toBeNull())
        expect(editor.view.dom.querySelector('[data-thread-id="t2"]')).toBeNull()
        fireEvent.click(editor.view.dom.querySelector('[data-thread-id="t1"]')!)
        expect(open).toHaveBeenCalledWith({ thread: "t1" })
    })
})

describe("a thread whose words were changed", () => {
    it("tells the panel it is lost, and how many exact matches of its words the doc has, once typing pauses", async () => {
        doc = { threads: [thread("lost", { anchor: { kind: "block", block_id: "gone", quote: "Second" } })], canComment: true }
        const { editor } = mount()
        function Probe() {
            const place = usePlaces("d1").get("lost")
            const matches = useMatches("d1").get("lost")
            return <span data-testid="probe">{`${place?.state ?? "none"}:${matches ?? 0}`}</span>
        }
        render(<Probe />)
        await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("detached:1"))
        // The words typed again elsewhere: two matches now, counted after the pause.
        act(() => {
            editor.commands.insertContentAt(editor.state.doc.content.size, "<p>Second</p>")
        })
        await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("detached:2"))
    })

    it("is never offered words for a block it named by its kind (a picture's \"Image\")", async () => {
        doc = { threads: [thread("pic", { anchor: { kind: "block", block_id: "gone", quote: "Second", meta: { named: true } } })], canComment: true }
        mount()
        function Probe() {
            const place = usePlaces("d1").get("pic")
            const matches = useMatches("d1").get("pic")
            return <span data-testid="probe">{`${place?.state ?? "none"}:${matches ?? 0}`}</span>
        }
        render(<Probe />)
        await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("detached:0"))
    })
})

describe("a reader who may comment", () => {
    it("has a Comment button over what they select", () => {
        const { editor } = mount(false)
        act(() => {
            editor.commands.setTextSelection({ from: 1, to: 5 })
        })
        // The bubble follows the selection: drawn again for it.
        cleanup()
        const bus = createDocCommandBus("d1")
        render(
            <DocBusContext.Provider value={bus}>
                <CommentsOverlay docId="d1" editor={editor} />
            </DocBusContext.Provider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "Comment" }))
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][0].start).toMatchObject({ kind: "block", block_id: "b1" })
    })
})
