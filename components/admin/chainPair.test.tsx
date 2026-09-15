import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ChainPair, shortHash } from "@/components/admin/ChainPair"
import { AIActivityRow } from "@/components/admin/AIActivityCard"
import type { AIActivityItem } from "@/services/aiActivityService"

afterEach(cleanup)

const PREV = "9f2c41ab9f2c41ab9f2c41ab"
const THIS = "7d10c8e57d10c8e57d10c8e5"

describe("a row's place in the chain", () => {
    // A single fingerprint demonstrates nothing: anyone can hash a row they
    // just wrote. The link is the claim.
    it("shows both hashes, never one", () => {
        const { container } = render(<ChainPair seq={1412} prevHash={PREV} entryHash={THIS} />)
        const text = container.textContent || ""
        expect(text).toContain("prev")
        expect(text).toMatch(/→/)
        expect(text).toContain("this")
    })

    it("says where it sits in the log", () => {
        const { container } = render(<ChainPair seq={1412} prevHash={PREV} entryHash={THIS} />)
        expect(container.textContent).toContain("#1412")
    })

    // The first row of a chain genuinely has nothing behind it, and that is a
    // fact worth stating rather than an empty space.
    it("says so when there is nothing behind it", () => {
        const { container } = render(<ChainPair seq={1} entryHash={THIS} />)
        expect(container.textContent).toMatch(/first entry/)
    })

    // An agent run is not a chain entry. Inventing a position would point a
    // reader at a row that does not exist.
    it("renders nothing for something that never entered the chain", () => {
        const { container } = render(<ChainPair />)
        expect(container.textContent).toBe("")
    })

    it("keeps both ends of a hash, which is what identifies it", () => {
        const short = shortHash(THIS)
        expect(short.startsWith(THIS.slice(0, 8))).toBe(true)
        expect(short.endsWith(THIS.slice(-8))).toBe(true)
    })
})

const item = (over: Partial<AIActivityItem> = {}): AIActivityItem => ({
    kind: "audit",
    title: "mcp.tool_call.refused",
    summary: "you are not a member of this channel",
    at: new Date().toISOString(),
    ...over,
})

describe("the activity feed and the audit log", () => {
    // They were two accounts of one event: the feed said an agent was stopped,
    // the log held the proof, and nothing connected them. A member cannot open
    // the log at all, so a claim made to them about their own agent was
    // unverifiable by them.
    it("tell one story: a refusal carries the row that proves it", () => {
        const { container } = render(
            <AIActivityRow item={item({ status: "refused", seq: 1412, prev_hash: PREV, entry_hash: THIS })} />,
        )
        const text = container.textContent || ""
        expect(text).toContain("refused by permissions")
        expect(text, "the refusal does not carry its evidence").toContain("#1412")
        // The arrow is rendered only by ChainPair, so it is the precise signal
        // that the evidence is present. An earlier version of this looked for
        // "this <hex>" and matched the word "channel" in the summary, because c
        // is a hex digit: a test that passed on the wrong text.
        expect(text).toContain("→")
        expect(text).toMatch(/prev .+→.*this /)
    })

    it("shows no chain position for an agent run", () => {
        const { container } = render(
            <AIActivityRow item={item({ kind: "agent_run", title: "Release Captain", status: "succeeded" })} />,
        )
        expect(container.textContent, "an agent run is showing a chain position").not.toContain("→")
    })
})
