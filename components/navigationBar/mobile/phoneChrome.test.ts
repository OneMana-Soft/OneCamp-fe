import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Small pieces of phone chrome that were saying a thing twice, or with an emoji.

describe("phone chrome", () => {
  it("says a channel is archived in words, in the moderators-only notice's form", () => {
    const src = readFileSync("components/channel/channelIdMobile.tsx", "utf8")
    // The desktop's words (chat's de653845), so both say the same thing.
    expect(src).toContain("This channel is archived. You can read it, but not post in it.")
    expect(src, "DESIGN.md: no emoji as decoration").not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it("leaves a settings page's way back to the top bar on a phone", () => {
    // The phone's top bar has Back, which returns to the settings list; the
    // "‹ Settings" link under it said the same thing again.
    const src = readFileSync("app/app/settings/layout.tsx", "utf8")
    expect(src).toMatch(/inSection && \(\s*<div className="[^"]*\bhidden sm:block\b/)
  })
})
