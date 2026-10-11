import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// One floating material in a conversation (design v3 chat, rule 5 and §4.3):
// every popover, menu, picker, suggestion list and hover toolbar is the pop
// surface at e3 (r12, r10 for a toolbar). Five layers once had five radius and
// shadow pairs.
const FILES = [
  "components/popover/reactionPickerPopover.tsx",
  // The @ list and the slash menu are content's CommandList (content.md D24),
  // which is the pop surface; the integration (11 Oct) moved the check there.
  "components/ui/CommandList.tsx",
  "components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel.tsx",
  "components/MessageDesktopHover/MessageDesktopDropdown.tsx",
  "components/textInput/composerTools.tsx",
  "components/channel/conversationHeaderParts.tsx",
]

describe("the floating material in a conversation", () => {
  it.each(FILES)("%s floats on the pop surface", (f) => {
    const src = readFileSync(f, "utf8")
    expect(src).toContain("pop-surface")
    expect(src).not.toMatch(/zoom-in-95|shadow-md\b|border bg-popover/)
  })

  it("draws the @ list and the slash menu with the CommandList", () => {
    for (const f of ["components/minimal-tiptap/extensions/mention-list/mentionList.tsx", "components/minimal-tiptap/extensions/slash-command/slashCommand.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<CommandList\b/)
    }
  })

  it("selects a list's row on the press overlay, never the canvas colour", () => {
    for (const f of ["components/ui/CommandList.tsx"]) {
      const src = readFileSync(f, "utf8")
      expect(src, f).toContain("bg-press")
      expect(src, f).not.toMatch(/"bg-accent text-accent-foreground"/)
    }
  })
})
