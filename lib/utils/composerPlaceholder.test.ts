import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { channelComposerPlaceholder, dmComposerPlaceholder, GROUP_COMPOSER_PLACEHOLDER, THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholder"

describe("channelComposerPlaceholder", () => {
  it("is the plain prompt with no agents", () => {
    expect(channelComposerPlaceholder("engineering")).toBe("Message #engineering")
    expect(channelComposerPlaceholder("engineering", ["  "])).toBe("Message #engineering")
  })
  it("drops the channel name on a phone, where the header shows it", () => {
    expect(channelComposerPlaceholder("engineering", ["Release Captain"], { compact: true })).toBe(
      "Message, or ask @Release Captain",
    )
    expect(channelComposerPlaceholder("engineering", [], { compact: true })).toBe("Message #engineering")
  })
  it("offers the channel's agent", () => {
    expect(channelComposerPlaceholder("engineering", ["Release Captain", "Triage"])).toBe(
      "Message #engineering, or ask @Release Captain",
    )
  })
})


describe("the other composers' placeholders", () => {
  it("names who a direct message goes to, and waits politely for the name", () => {
    expect(dmComposerPlaceholder("Maya Chen")).toBe("Message Maya Chen")
    expect(dmComposerPlaceholder("  ")).toBe("Message…")
    expect(dmComposerPlaceholder(undefined)).toBe("Message…")
  })

  it("says the group and the thread plainly", () => {
    expect(GROUP_COMPOSER_PLACEHOLDER).toBe("Message the group")
    expect(THREAD_COMPOSER_PLACEHOLDER).toBe("Reply…")
  })

  // Every caller, so a new composer cannot bring back "Type a message…".
  const ROOT = join(__dirname, "..", "..")
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
  it.each([
    ["components/chat/chatIdDesktop.tsx", /placeholder=\{dmComposerPlaceholder\(/],
    ["components/textInput/mobileChatTextInput.tsx", /placeholder=\{dmComposerPlaceholder\(/],
    ["components/groupChat/chatGrpIdDesktop.tsx", /placeholder=\{GROUP_COMPOSER_PLACEHOLDER\}/],
    ["components/textInput/mobileGroupChatTextInput.tsx", /placeholder=\{GROUP_COMPOSER_PLACEHOLDER\}/],
    ["components/rightPanel/channelComments.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/rightPanel/chatComments.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/rightPanel/groupChatComments.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/textInput/mobileChannelPostTextInput.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/textInput/mobileChatMessageTextInput.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/textInput/mobileGroupChatMessageTextInput.tsx", /placeholder=\{THREAD_COMPOSER_PLACEHOLDER\}/],
    ["components/channel/chanelIdDesktop.tsx", /placeholder=\{channelComposerPlaceholder\(/],
    ["components/textInput/mobileChannelTextInput.tsx", /placeholder=\{channelComposerPlaceholder\(/],
  ])("%s uses the shared placeholder", (file, pattern) => {
    const src = read(file)
    expect(src).toMatch(pattern)
    expect(src).not.toMatch(/Type a message/)
  })
})
