import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder"

describe("channelComposerPlaceholder", () => {
  it("is the plain prompt with no agents", () => {
    expect(channelComposerPlaceholder("engineering")).toBe("Message #engineering")
    expect(channelComposerPlaceholder("engineering", ["  "])).toBe("Message #engineering")
  })
  it("drops the channel name on a phone, where the header shows it", () => {
    expect(channelComposerPlaceholder("engineering", ["Release Captain"], { compact: true })).toBe(
      "Message or ask @Release Captain",
    )
    expect(channelComposerPlaceholder("engineering", [], { compact: true })).toBe("Message #engineering")
  })
  it("offers the channel's agent", () => {
    expect(channelComposerPlaceholder("engineering", ["Release Captain", "Triage"])).toBe(
      "Message #engineering, or ask @Release Captain",
    )
  })

  // Both channel composers. The other composers' placeholders, and the check
  // on their callers, are in composerPlaceholders(.test).ts, which every
  // edition carries.
  const ROOT = join(__dirname, "..", "..")
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
  it.each([
    ["components/channel/chanelIdDesktop.tsx", /placeholder=\{channelComposerPlaceholder\(/],
    ["components/textInput/mobileChannelTextInput.tsx", /placeholder=\{channelComposerPlaceholder\(/],
  ])("%s uses the shared placeholder", (file, pattern) => {
    const src = read(file)
    expect(src).toMatch(pattern)
    expect(src).not.toMatch(/Type a message/)
  })
})
