import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// A tap on a person's name or face in a phone conversation opens their
// profile sheet, as a click does on a desktop (chanelMessage). It went to the
// member page instead, a whole screen away from the conversation.
describe("a name tapped on a phone", () => {
  it.each([
    "components/channel/channelMessageMobile.tsx",
    "components/chat/chatMessageMobile.tsx",
    "components/groupChat/groupChatMessageMobile.tsx",
  ])("in %s opens the profile sheet, not the member page", (file) => {
    const src = readFileSync(file, "utf8")
    const handler = src.slice(src.indexOf("const handleUserClick"), src.indexOf("},[", src.indexOf("const handleUserClick")))
    expect(handler).toMatch(/openUI\(\{ key: "otherUserProfile", data: \{ userUUID: /)
    expect(handler).not.toMatch(/router\.push/)
    expect(src).not.toMatch(/\bapp_user\b/)
  })
})
