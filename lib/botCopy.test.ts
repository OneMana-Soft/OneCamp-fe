import { describe, expect, it } from "vitest"

import { BOT_PROFILE_COPY, type BotKind, botProfileCopy } from "./botCopy"

const KINDS = Object.keys(BOT_PROFILE_COPY) as BotKind[]

describe("botProfileCopy", () => {
    it("never falls back to the assistant", () => {
        // The whole bug was every bot wearing the assistant's identity. A kind
        // this build has not heard of, or a server too old to send one, must
        // land on neutral wording rather than back on the assistant.
        for (const unknown of [undefined, null, "", "kind-from-a-newer-server", "ASSISTANT"]) {
            const copy = botProfileCopy(unknown)
            expect(copy).not.toBe(BOT_PROFILE_COPY.assistant)
            expect(copy.bio).not.toMatch(/recap|assistant/i)
            expect(copy.action).not.toMatch(/AI/)
        }
    })

    it("resolves a known kind exactly", () => {
        for (const kind of KINDS) {
            expect(botProfileCopy(kind)).toBe(BOT_PROFILE_COPY[kind])
        }
    })

    it("only the assistant is described as one", () => {
        for (const kind of KINDS.filter((k) => k !== "assistant")) {
            const copy = BOT_PROFILE_COPY[kind]
            expect(copy.bio).not.toMatch(/assistant/i)
            expect(copy.badge).not.toMatch(/^AI$/)
            expect(copy.action).not.toMatch(/AI/)
            // Only the assistant answers, so only it invites you to write to it.
            expect(copy.invite).toBeUndefined()
        }
    })

    it("gives every kind the fields both profile views render", () => {
        for (const kind of KINDS) {
            const copy = BOT_PROFILE_COPY[kind]
            for (const field of ["title", "badge", "subtitle", "bio", "action", "defaultName"] as const) {
                expect(copy[field], `${kind}.${field}`).toBeTruthy()
            }
        }
    })
})
