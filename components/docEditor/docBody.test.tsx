import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

// What links here has its own tests (B6); the title region's don't fetch it.
vi.mock("@/components/entityLink/LinkedFromSection", () => ({ LinkedFromSection: () => null }))

import "@/components/docEditor/registry"
import { registerSlot, slotFor } from "@/components/docEditor/registry/registry"
import { DocBusContext, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { DocBodyLayer, isBlankDoc } from "./DocBodyLayer"
import { DocTitle } from "./DocTitle"
import { createTitleStore } from "./docTitleStore"

// The doc's host after the platform split (PROGRAM.md A1): the title region in
// DocTitle.tsx, the meta line in DocMetaLine.tsx, and the body's layer where
// the gutter and empty-starter slots draw. A package registers; the host
// draws it, and draws nothing for a slot no one filled.

const GATE = { ai: false }
const editors: Editor[] = []
afterEach(() => {
    cleanup()
    while (editors.length) editors.pop()!.destroy()
})

function editor(html: string, editable = true) {
    const e = new Editor({ extensions: [StarterKit], content: html, editable })
    editors.push(e)
    return e
}

describe("a blank doc", () => {
    it("is one empty paragraph, whatever its block id", () => {
        expect(isBlankDoc(editor("<p></p>").state.doc)).toBe(true)
        expect(isBlankDoc(editor("<p>a</p>").state.doc)).toBe(false)
        expect(isBlankDoc(editor("<p></p><p></p>").state.doc)).toBe(false)
        expect(isBlankDoc(editor("<h2></h2>").state.doc)).toBe(false)
        expect(isBlankDoc(editor("<ul><li><p></p></li></ul>").state.doc)).toBe(false)
    })
})

describe("the body's layer", () => {
    it("draws only the slots packages fill: the margin's comment markers (B7), and B5's starter only for someone who may edit", () => {
        expect(slotFor("gutter", GATE).map((c) => c.id)).toEqual(["comments"])
        // B5 fills the empty starter (components/docTemplates/register.ts):
        // templates at 10, a file at 15. A reader is never offered them.
        expect(slotFor("emptyStarter", GATE).map((c) => [c.id, c.order])).toEqual([["templates", 10], ["import", 15]])
        const { container } = render(<DocBodyLayer gate={GATE} docId="d" editor={editor("<p></p>")} canEdit={false} padded="px-5" />)
        expect(container.querySelector("[data-doc-body-layer] [data-doc-gutter]")).toBeTruthy()
        expect(container.querySelector("[data-doc-empty-starter]")).toBeNull()
    })

    it("offers the empty starter under a blank doc someone can edit, and takes it away at the first keystroke", async () => {
        registerSlot({
            slot: "emptyStarter",
            id: "test.starter",
            edition: "both",
            load: async () => ({ default: ({ docId }) => <button type="button">Start {docId} from a template</button> }),
        })
        const e = editor("<p></p>")
        const { rerender } = render(<DocBodyLayer gate={GATE} docId="d1" editor={e} canEdit padded="px-5" />)
        expect(await screen.findByRole("button", { name: "Start d1 from a template" })).toBeTruthy()

        await act(async () => {
            e.commands.insertContent("Hello")
        })
        expect(screen.queryByRole("button", { name: /from a template/ })).toBeNull()

        await act(async () => {
            e.commands.clearContent(true)
        })
        expect(await screen.findByRole("button", { name: "Start d1 from a template" })).toBeTruthy()

        // A reader can't start it.
        rerender(<DocBodyLayer gate={GATE} docId="d1" editor={e} canEdit={false} padded="px-5" />)
        expect(screen.queryByRole("button", { name: /from a template/ })).toBeNull()
    })

    it("draws the gutter's marks at the top of the body, given the editor", async () => {
        registerSlot({
            slot: "gutter",
            id: "test.gutter",
            edition: "both",
            load: async () => ({ default: ({ editor: ed }) => <span>{ed ? "marks beside the text" : "no editor"}</span> }),
        })
        const { container } = render(<DocBodyLayer gate={GATE} docId="d" editor={editor("<p>Text</p>")} canEdit={false} padded="px-5" />)
        expect(await screen.findByText("marks beside the text")).toBeTruthy()
        expect(container.querySelector("[data-doc-body-layer] [data-doc-gutter]")).toBeTruthy()
    })
})

describe("the editor overlay", () => {
    // Edit proposals are made by the AI edition's Ask AI bar alone (A9): this
    // edition draws no review bar for them.
    it("carries no review bar of edit proposals on this edition", () => {
        expect(slotFor("editorOverlay", GATE).map((c) => c.id)).not.toContain("proposals.review")
    })
})

describe("the title region", () => {
    function title(editable: boolean) {
        const bus = createDocCommandBus("d")
        const store = createTitleStore("Launch plan")
        const titleRef = React.createRef<HTMLTextAreaElement>()
        render(
            <DocBusContext.Provider value={bus}>
                <div className="doc-scroll">
                    <DocTitle store={store} titleRef={titleRef} id="t" editor={editor("<p>Body</p>")} editable={editable} authorName="Sam Rivera" />
                </div>
            </DocBusContext.Provider>,
        )
        return { bus, field: screen.getByRole("textbox", { name: "Title" }) as HTMLTextAreaElement }
    }

    it("is a heading holding the title, with the meta line under it, inside the doc's scroller", () => {
        const { field } = title(true)
        expect(field.value).toBe("Launch plan")
        expect(field.closest("h1")).toBeTruthy()
        expect(field.closest(".doc-scroll")).toBeTruthy()
        expect(field.matches("[data-doc-title]")).toBe(true)
        expect(screen.getByText("Sam Rivera").closest("[data-doc-meta]")).toBeTruthy()
    })

    it("takes the caret to the end of the title when the doc's bus asks (focusTitle)", () => {
        const { bus, field } = title(true)
        act(() => bus.emit("focusTitle", {}))
        expect(document.activeElement).toBe(field)
        expect(field.selectionStart).toBe("Launch plan".length)
    })

    it("stays put for a reader", () => {
        const { bus, field } = title(false)
        act(() => bus.emit("focusTitle", {}))
        expect(document.activeElement).not.toBe(field)
    })
})
