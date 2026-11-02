import { describe, expect, it } from "vitest"

import { AGENT_PEER_LINE, AGENT_ROLE, BOT_PROFILE_COPY, type BotKind, botProfileCopy, botSubtitle, isAgentPeer, isAIBot, mayCallPeer } from "./botCopy"

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

    it("counts only the assistant and agents as AI", () => {
        expect(isAIBot("assistant")).toBe(true)
        expect(isAIBot("agent")).toBe(true)
        for (const kind of ["automation", "bridge", "checkin", "guest", "bot", "unknown", "", null, undefined]) {
            expect(isAIBot(kind)).toBe(false)
        }
    })

    it("says what a bot is under its name, and only an AI one is an AI teammate", () => {
        expect(botSubtitle("agent")).toBe("AI teammate")
        expect(botSubtitle("checkin")).toBe(BOT_PROFILE_COPY.checkin.subtitle)
        expect(botSubtitle(undefined)).toBe(BOT_PROFILE_COPY.bot.subtitle)
        expect(botSubtitle("bridge")).not.toMatch(/AI/)
    })
})

// V-126: one rule for a DM's other on a computer and a phone.
describe("a DM's other, by one rule", () => {
    it("is an agent when it is a bot, by class", () => {
        expect(isAgentPeer({ is_bot: true })).toBe(true)
        for (const p of [{ is_bot: false }, {}, null, undefined]) expect(isAgentPeer(p)).toBe(false)
    })

    it("offers a huddle or a call with a known person only", () => {
        expect(mayCallPeer({ is_bot: false })).toBe(true)
        expect(mayCallPeer({})).toBe(true)
        for (const p of [{ is_bot: true }, null, undefined]) expect(mayCallPeer(p)).toBe(false)
    })

    it("says an agent's role in the same words on both: the phone's is the line's start", () => {
        expect(AGENT_PEER_LINE).toBe("Acts for you · can do only what you can")
        expect(AGENT_PEER_LINE.startsWith(`${AGENT_ROLE} · `)).toBe(true)
    })
})
