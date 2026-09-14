import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// A suggestion that fills the box and stops is a two-step instruction nobody
// asked for: the reader has to notice the text appeared somewhere else and then
// find the send button. The panel needs Redux, the router, a toast provider,
// voice dictation and eight dialogs before it renders a single chip, so the
// wiring is checked at the source; the decision it makes is tested properly in
// lib/ai/sendTarget.test.ts.
const PANEL = join(__dirname, "AiChatPanel.tsx")

describe("an AI suggestion chip", () => {
    it("asks the question rather than typing it for you", () => {
        const src = readFileSync(PANEL, "utf8")
        expect(src).toContain("handleSend(suggestion)")
    })

    it("does not go back to only filling the box", () => {
        const src = readFileSync(PANEL, "utf8")
        expect(src).not.toMatch(/onClick=\{\(\)\s*=>\s*\{\s*setInput\(suggestion\)/)
    })
})
