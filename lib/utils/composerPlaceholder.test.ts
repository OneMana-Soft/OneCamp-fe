import { describe, expect, it } from "vitest"
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder"

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
