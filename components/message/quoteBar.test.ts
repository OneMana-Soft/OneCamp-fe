import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { quoteBarClass } from "./quoteBar"

// A quoted message's bar is in the quoted person's hue, their avatar's colour.
// It was the brand orange in seven places, decoration spending the accent.

describe("the bar beside a quoted message", () => {
  it("is in the quoted person's hue", () => {
    expect(quoteBarClass({ user_name: "Maya Chen" })).toContain(HUE_CLASS[hueFor("Maya Chen")])
    expect(quoteBarClass("Jonas Weber")).toContain(HUE_CLASS[hueFor("Jonas Weber")])
    expect(quoteBarClass("Jonas Weber")).toContain("border-hue")
  })

  it("is never the accent, anywhere a message is quoted", () => {
    for (const f of [
      "components/message/baseMessageCard.tsx",
      "components/message/composerReplyPill.tsx",
      "components/channel/channelMessageMobile.tsx",
      "components/chat/chatMessageMobile.tsx",
      "components/groupChat/groupChatMessageMobile.tsx",
      "components/rightPanel/messageContent.tsx",
      "components/mobileMessage/mobileMessage.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/border-l-2 border-primary/)
    }
  })
})
