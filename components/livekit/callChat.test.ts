import { describe, expect, it } from "vitest"
import { callChatAction, conversationOf } from "./callChat"

// Step 3, part 2: the dock's Chat is the conversation the call belongs to,
// beside it in split view. CallDock had the button; nothing wired it.

describe("the dock's Chat", () => {
  const channel = conversationOf("channel", "chan-one")

  it("is the call's own conversation: a channel's, a DM's or a group's", () => {
    expect(channel).toEqual({ kind: "channel", id: "chan-one" })
    expect(conversationOf("chat", "user-two")).toEqual({ kind: "chat", id: "user-two" })
    expect(conversationOf("group", "grp-three")).toEqual({ kind: "group", id: "grp-three" })
  })

  it("goes to the conversation's composer when it is the page the call sits beside", () => {
    expect(callChatAction(channel, "/app/channel/chan-one", [{ kind: "call-channel", id: "chan-one" }])).toEqual({ action: "focus", open: true, index: -1 })
  })

  it("closes the conversation when it is open beside the call", () => {
    expect(callChatAction(channel, "/app/meet/ch/chan-one", [{ kind: "doc", id: "doc-one" }, { kind: "channel", id: "chan-one" }])).toEqual({ action: "close", open: true, index: 1 })
  })

  it("opens it beside the call otherwise, and never another conversation's", () => {
    expect(callChatAction(channel, "/app/meet/ch/chan-one", [])).toEqual({ action: "open", open: false, index: -1 })
    expect(callChatAction(channel, "/app/channel/chan-two", [{ kind: "channel", id: "chan-nine" }])).toEqual({ action: "open", open: false, index: -1 })
  })
})
