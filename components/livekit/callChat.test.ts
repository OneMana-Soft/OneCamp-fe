import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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
    expect(callChatAction(channel, "/app/doc/doc-one", [{ kind: "call-channel", id: "chan-one" }, { kind: "channel", id: "chan-one" }])).toEqual({ action: "close", open: true, index: 1 })
  })

  it("opens it beside the call otherwise, and never another conversation's", () => {
    expect(callChatAction(channel, "/app/doc/doc-one", [{ kind: "call-channel", id: "chan-one" }])).toEqual({ action: "open", open: false, index: -1 })
    expect(callChatAction(channel, "/app/channel/chan-two", [{ kind: "channel", id: "chan-nine" }])).toEqual({ action: "open", open: false, index: -1 })
  })

  // A call's own page draws its conversation beside it (MeetingSplit, the
  // release fix of 18 Oct), so Chat is offered there as anywhere else.
  it("is offered on a call's own page, whose frame draws the conversation beside the call", () => {
    const shell = readFileSync(resolve(__dirname, "../../app/app/LayoutContent.tsx"), "utf8")
    expect(shell).toMatch(/if\s*\(inMeeting\)\s*\{\s*return\s*<MeetingSplit\b/)
  })
})
