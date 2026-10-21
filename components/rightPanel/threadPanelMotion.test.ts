import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// Design v3 chat, C36: the column snaps, the panel's contents move. A thread
// opens with panel-in (x 16px and a fade), its first replies follow 40 ms
// apart, another thread fades in by its key; nothing transitions a width. The
// root is the subject on the sunken surface, and the composer is the chat
// composer at its compact size, at the panel's foot.
const panels = ["channelComments", "chatComments", "groupChatComments"].map((f) => [f, readFileSync(`components/rightPanel/${f}.tsx`, "utf8")] as const)

describe("the thread panel", () => {
  it.each(panels)("%s moves its contents, keyed by the thread, never a width", (_, src) => {
    expect(src).toMatch(/<div key=\{threadKey\} data-right-panel-thread="" className="flex h-full flex-col bg-panel animate-panel-in">/)
    expect(src).not.toMatch(/transition-\[width|transition-all/)
    expect(src).toMatch(/<MessageContent\n\s+root/)
    // Its reply box is every thread's one (components/conversation/ThreadReplyBox).
    expect(src).toMatch(/<ThreadReplyBox kind="(channel|dm|group)"/)
  })

  it("writes replies in the chat composer at its compact size", () => {
    const box = readFileSync("components/conversation/ThreadReplyBox.tsx", "utf8")
    expect(box).toMatch(/variant="chat"\n\s+compact/)
  })

  it("staggers the first six replies 40 ms apart, and lets a later one rise in", () => {
    const list = readFileSync("components/rightPanel/commentsList.tsx", "utf8")
    expect(list).toContain("animationDelay: `${idx * 40}ms`")
    expect(list).toContain('idx >= initialCount ? "animate-msg-in"')
  })

  it("uses the conversation's own toolbar for replies; the old thread toolbar is gone", () => {
    const row = readFileSync("components/rightPanel/messageContent.tsx", "utf8")
    expect(row).toContain("<MessageDesktopHoverOptionsForMainChatAndChannel")
    expect(row).not.toContain("RightPanelChatAndChannel")
  })
})
