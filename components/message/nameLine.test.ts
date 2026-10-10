import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A message's name line is 20px whatever sits on it: an "Agent", "Bot",
// "Guest" or "Slack" tag stretched the baseline-aligned line, so those rows
// were 56px among 54px ones.
const ROWS = [
  "components/message/baseMessageCard.tsx",
  "components/channel/channelMessageMobile.tsx",
  "components/chat/chatMessageMobile.tsx",
  "components/groupChat/groupChatMessageMobile.tsx",
  "components/rightPanel/messageContent.tsx",
]
describe("a message's name line", () => {
  it.each(ROWS)("%s holds it at 20px", (f) => {
    const src = readFileSync(join(__dirname, "..", "..", f), "utf8")
    expect(src).toContain('data-name-line="" className="flex h-5 items-center gap-2"')
  })
})
