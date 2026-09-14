import { describe, expect, it } from "vitest"

import { sendTarget } from "@/lib/ai/sendTarget"

describe("what a send submits", () => {
    it("is the box when nothing else is named", () => {
        expect(sendTarget(undefined, "  what is due today?  ")).toEqual({
            text: "what is due today?",
            clearDraft: true,
        })
    })

    it("is the question asked for, when one is", () => {
        expect(sendTarget("summarise #design", "half a thought")).toEqual({
            text: "summarise #design",
            clearDraft: false,
        })
    })

    // The same callback is handed to onClick, where React calls it with a
    // MouseEvent. Asking the model about "[object Object]" is the failure this
    // prevents.
    it("ignores anything that is not text", () => {
        for (const notText of [{ type: "click" }, 42, null, [], true]) {
            expect(sendTarget(notText, "the real question")).toEqual({
                text: "the real question",
                clearDraft: true,
            })
        }
    })

    // Clicking a suggestion must not discard what someone had started typing.
    it("leaves the draft alone when it sent something else", () => {
        expect(sendTarget("a suggestion", "my own half-typed question").clearDraft).toBe(false)
    })

    it("has nothing to send when the box is empty", () => {
        expect(sendTarget(undefined, "   ").text).toBe("")
    })
})
