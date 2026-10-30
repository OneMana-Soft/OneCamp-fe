import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// content.md D23: a table, a poll and a diff in a doc are one embed card
// (raised, e1, r12, a 40 px header with a tile); D10: the block handle is
// "+" and a grip, for a hovering pointer only.
const read = (p: string) => readFileSync(`components/minimal-tiptap/${p}`, "utf8")

describe("doc embeds", () => {
  it("draws the card once: raised, e1 lifting to e2, r12, a tiled header", () => {
    const card = read("components/embed-card.tsx")
    expect(card).toMatch(/data-embed-card=\{kind\}/)
    expect(card).toMatch(/rounded-\[12px\] bg-raised shadow-e1[^"]*hover:shadow-e2/)
    expect(card).toMatch(/flex h-10 items-center/)
  })

  it.each(["extensions/table-embed/components/table-embed-view.tsx", "extensions/poll/poll-view.tsx", "extensions/diff-embed/diff-embed-view.tsx"])(
    "%s uses it",
    (file) => {
      expect(read(file)).toMatch(/<EmbedCard\b/)
    },
  )

  it("grows a poll's bars by scaling, not by animating their width", () => {
    // The bars are the shared poll choices', a message's poll's and a call's.
    expect(read("extensions/poll/poll-view.tsx")).toMatch(/<PollChoices\b/)
    const poll = read("../poll/PollChoices.tsx")
    expect(poll).not.toMatch(/transition-\[width\]/)
    expect(poll).toMatch(/scaleX\(/)
  })
})

describe("the block handle", () => {
  const handle = read("extensions/block-handle/block-handle.ts")
  const css = read("styles/index.css")
  it("offers + and a grip, and glides by transform", () => {
    // Their names (content.md D10): "Add block", "Drag to move or click for options".
    expect(handle).toMatch(/"Add block"/)
    expect(handle).toMatch(/"Drag to move or click for options"/)
    expect(handle).toMatch(/translate3d\(/)
    expect(handle).not.toMatch(/handle\.style\.(left|top) =/)
  })

  it("hides on a phone or any touch screen", () => {
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\), \(max-width: 767px\) \{\s*\.block-handle-floating \{\s*display: none;/)
  })
})
