import { describe, expect, it } from "vitest"
import "@/components/docEditor/actions/text"
import { actionById } from "@/components/docEditor/registry/registry"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import type { ActionContext, DocShellState } from "@/components/docEditor/registry/types"

// Comment, the action (A1's, B7's payload): from the block menu it names the
// blocks it ran on by id, in the doc's order, so the comment is on those blocks
// and never on what lies between blocks chosen apart (B1's ctx.state.blocks).

const AI = { ai: true }

function run(state: DocShellState, selection = { empty: true, from: 3, to: 3 }) {
    const bus = createDocCommandBus("doc-1")
    const heard: unknown[] = []
    bus.on("comment", (asked) => {
        heard.push({ ...asked })
    })
    const editor = { state: { selection } } as unknown as ActionContext["editor"]
    const ctx: ActionContext = { docId: "doc-1", editor, canEdit: true, bus, gate: AI, state }
    const action = actionById("text.comment", AI)!
    const visible = action.isVisible?.(ctx) ?? true
    if (visible) void action.run(ctx)
    return { visible, heard }
}

describe("Comment", () => {
    it("from the block menu, names the blocks it ran on as well as their range", () => {
        expect(run({ range: { from: 0, to: 20 }, blocks: ["b1", "b3"] }).heard).toEqual([{ from: 0, to: 20, blocks: ["b1", "b3"] }])
        // The blocks alone are enough.
        expect(run({ blocks: ["b2"] }).heard).toEqual([{ from: 3, to: 3, blocks: ["b2"] }])
    })

    it("on a selection, is on the selection; a block list that isn't ids is left out", () => {
        const words = { empty: false, from: 4, to: 9 }
        expect(run({}, words).heard).toEqual([{ from: 4, to: 9 }])
        expect(run({ blocks: [] }, words).heard).toEqual([{ from: 4, to: 9 }])
        expect(run({ blocks: ["b1", 7] }, words).heard).toEqual([{ from: 4, to: 9 }])
    })

    it("isn't offered in a bar with nothing chosen, but its key works at a caret, on the caret's block", () => {
        expect(run({}).visible).toBe(false)
        const bus = createDocCommandBus("doc-1")
        const heard: unknown[] = []
        bus.on("comment", (asked) => {
            heard.push({ ...asked })
        })
        const editor = { state: { selection: { empty: true, from: 3, to: 3 } } } as unknown as ActionContext["editor"]
        const ctx: ActionContext = { docId: "doc-1", editor, canEdit: true, bus, gate: AI, state: {} }
        const action = actionById("text.comment", AI)!
        expect(action.shortcut).toBe("Mod-Shift-m")
        expect(action.shortcutScope ?? "page").toBe("page")
        expect(action.isEnabled?.(ctx)).toBe(true)
        void action.run(ctx)
        expect(heard).toEqual([{ from: 3, to: 3 }])
    })
})
