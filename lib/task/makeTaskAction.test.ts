import { describe, expect, it } from "vitest"
import { makeTaskAction } from "./makeTaskAction"

const origin = "https://acme.test"

describe("makeTaskAction", () => {
  it("drafts from a channel post and replies under the post", () => {
    const a = makeTaskAction({ html: "<p>Ship it.</p>", channelUUID: "c1", postUUID: "p1", authorName: "Maya" }, origin)!
    expect(a.payload.key).toBe("createTask")
    expect(a.payload.data.source).toEqual({ postUUID: "p1", chatMessageID: undefined, link: "https://acme.test/app/channel/c1/p1", authorName: "Maya" })
    expect(a.payload.data.draft.name).toBe("Ship it")
  })

  it("replies under a group message by its message id", () => {
    const a = makeTaskAction({ html: "hi", groupUUID: "g1", chatMessageID: "m1" }, origin)!
    expect(a.payload.data.source.chatMessageID).toBe("m1")
    expect(a.payload.data.source.link).toBe("https://acme.test/app/chat/group/g1/m1")
  })

  it("replies under a direct message by its message id", () => {
    const a = makeTaskAction({ html: "hi", chatUUID: "u2", chatMessageID: "m2" }, origin)!
    expect(a.payload.data.source).toMatchObject({ chatMessageID: "m2", link: "https://acme.test/app/chat/u2/m2" })
  })

  it("is null for a message with no link back", () => {
    expect(makeTaskAction({ html: "hi", channelUUID: "c1" }, origin)).toBeNull()
  })
})
