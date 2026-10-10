import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dmComposerPlaceholder, GROUP_COMPOSER_PLACEHOLDER, THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders"

describe("the DM, group and thread composers' placeholders", () => {
  it("names who a direct message goes to, and waits politely for the name", () => {
    expect(dmComposerPlaceholder("Maya Chen")).toBe("Message Maya Chen")
    expect(dmComposerPlaceholder("  ")).toBe("Message…")
    expect(dmComposerPlaceholder(undefined)).toBe("Message…")
  })

  it("says the group and the thread plainly", () => {
    expect(GROUP_COMPOSER_PLACEHOLDER).toBe("Message the group")
    expect(THREAD_COMPOSER_PLACEHOLDER).toBe("Reply…")
  })

  // Every caller, so a new composer cannot bring back "Type a message…". They
  // are in every edition, so they take the placeholders from this module: the
  // channel's (composerPlaceholder.ts) is only in the AI edition, and an
  // import of it broke the build of the edition without it.
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
  ])("%s uses the shared placeholder, from the module every edition has", (file, pattern) => {
    const src = read(file)
    expect(src).toMatch(pattern)
    expect(src).not.toMatch(/Type a message/)
    expect(src).toMatch(/from "@\/lib\/utils\/composerPlaceholders"/)
    expect(src).not.toMatch(/from "@\/lib\/utils\/composerPlaceholder"/)
  })
})
