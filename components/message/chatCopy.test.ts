import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// CHAT'S WORDS (UX-CHAT-H2, the audit's CHAT-23). A phone's copy toasts read
// "Copied · copied post text", "copied chat text", "copied body text" and
// "copied link", in lowercase and in words nobody uses, while a computer's
// said "Text copied" and "Link copied". An announcement channel told a phone
// and a computer that "moderators" post there, a role OneCamp doesn't have:
// its details sheet and the server say channel admins. Both widths now say
// the same, from one table of words.

const read = (path: string) => readFileSync(path, "utf8")

/** Every chat surface that copies a message's text or link and says so. */
const COPIERS = [
  "components/channel/channelMessageMobile.tsx",
  "components/chat/chatMessageMobile.tsx",
  "components/groupChat/groupChatMessageMobile.tsx",
  "components/mobileMessage/mobileMessage.tsx",
  // The phone thread page's drawers are its wrappers now (UX-CHAT-H1): it copies their links.
  "components/drawers/messageActionSheet.tsx",
]
// A computer's More menu already said them; its labels join the table with the rest of its actions (UX-CHAT-H10).
const DESK_MORE = "components/MessageDesktopHover/MessageDesktopDropdown.tsx"

describe("chat's copy toasts", () => {
  it("chat's copy toasts say Text copied and Link copied, and an announcement channel names channel admins at every width", () => {
    for (const file of COPIERS) {
      const src = read(file)
      // Each copy says what it copied with the table's words, never words of its own.
      const calls = [...src.matchAll(/\bcopy(?:ToClipboard\.copy)?\(([^\n]*)\)/g)].map((m) => m[1])
      expect(calls.length, `${file} copies nothing`).toBeGreaterThan(0)
      for (const call of calls) expect(call, `${file}: ${call}`).toMatch(/COPIED\.(text|link)\s*\)*$/)
      expect(src, file).not.toMatch(/["']copied [a-z]/)
    }
    const desk = [...read(DESK_MORE).matchAll(/\bcopy\(([^\n]*)\)/g)].map((m) => m[1])
    expect(desk.map((call) => call.match(/"(\w+ copied)"\)*$/)?.[1]).sort()).toEqual(["Link copied", "Text copied"])

    for (const file of ["components/channel/chanelIdDesktop.tsx", "components/channel/channelIdMobile.tsx"]) {
      const src = read(file)
      expect(src, file).toContain("Only channel admins can post here.")
      expect(src, file).not.toMatch(/moderators/i)
    }

    // One table of words for the computer's and the phone's message actions.
    const table = Object.values(import.meta.glob("/lib/chat/messageActionLabels.ts", { eager: true }) as Record<string, { COPIED?: unknown }>)[0]
    expect(table?.COPIED).toEqual({ text: "Text copied", link: "Link copied" })
  })
})
