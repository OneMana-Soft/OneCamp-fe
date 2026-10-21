import { describe, expect, it } from "vitest"
import { pinLabel, pinsKeyOf, rowConversation } from "./pins"
import type { ConversationRef } from "./types"

const channel: ConversationRef = { kind: "channel", id: "c-1" }
const dm: ConversationRef = { kind: "dm", id: "aaaa bbbb", other: "bbbb" }

describe("pins", () => {
  it("are read at the conversation's own path, a DM's id escaped", () => {
    expect(pinsKeyOf(channel)).toBe("/conversations/channel/c-1/pins")
    expect(pinsKeyOf(dm)).toBe("/conversations/dm/aaaa%20bbbb/pins")
  })

  it("say where they pin to", () => {
    expect(pinLabel(channel, false)).toBe("Pin to this channel")
    expect(pinLabel(channel, true)).toBe("Unpin from this channel")
    expect(pinLabel(dm, false)).toBe("Pin to this conversation")
    expect(pinLabel(dm, true)).toBe("Unpin from this conversation")
  })

  it("are of the conversation a row is shown in; in a thread, only its root's", () => {
    expect(rowConversation(channel, "m-1")).toEqual(channel)
    expect(rowConversation({ in: channel, root: "m-1" }, "m-1")).toEqual(channel)
    // A reply isn't pinned, and nothing outside a conversation is.
    expect(rowConversation({ in: channel, root: "m-1" }, "r-1")).toBeNull()
    expect(rowConversation(null, "m-1")).toBeNull()
    expect(rowConversation(channel, undefined)).toBeNull()
  })
})
