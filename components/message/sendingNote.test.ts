import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Every message row that can hold an unconfirmed message says "Sending…" where
// its time is: by the time on a turn's first message, in the gutter on a
// continued one. SendStatus no longer draws it (it sat over the row's corner,
// a screen's width from the words), so a row that drew SendStatus alone would
// go quiet while sending.
const ROWS = [
  "components/message/baseMessageCard.tsx",
  "components/channel/channelMessageMobile.tsx",
  "components/chat/chatMessageMobile.tsx",
  "components/groupChat/groupChatMessageMobile.tsx",
]

describe("rows that draw a send status", () => {
  it.each(ROWS)("%s says Sending… by its time and in its gutter", (file) => {
    const src = readFileSync(join(__dirname, "..", "..", file), "utf8")
    expect(src).toContain("<SendStatus")
    expect(src).toMatch(/=== "sending" && <SendingNote \/>/)
    expect(src).toMatch(/<ContinuedGutter[^>]*sending=\{/)
  })

  it("draws nothing over the row's corner", () => {
    const src = readFileSync(join(__dirname, "sendStatus.tsx"), "utf8")
    expect(src).not.toMatch(/absolute bottom-1 right-4/)
  })
})
