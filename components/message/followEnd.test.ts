import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AT_END_PX, followAfterScroll } from "./followEnd"

// Opening a channel with images, link cards and older messages arriving
// together, the virtualiser's own correction moved the view ~500px up, and the
// list took that scroll for the reader's: the channel opened mid-conversation
// with "Jump to latest" showing. Only the reader leaves the end now.

describe("followAfterScroll", () => {
  it("keeps a following reader at the end when the layout moves them off it", () => {
    expect(followAfterScroll({ fromBottom: 747, wasFollowing: true, readerInput: false, contentResized: true })).toEqual({
      following: true,
      repin: true,
    })
  })

  it("lets the reader leave the end by scrolling up", () => {
    expect(followAfterScroll({ fromBottom: 300, wasFollowing: true, readerInput: true, contentResized: false })).toEqual({
      following: false,
      repin: false,
    })
    // Even while the content is still growing under them.
    expect(followAfterScroll({ fromBottom: 300, wasFollowing: true, readerInput: true, contentResized: true }).following).toBe(false)
  })

  it("leaves the end for a scroll that moved the view without the content changing size (find in page, a jump)", () => {
    expect(followAfterScroll({ fromBottom: 900, wasFollowing: true, readerInput: false, contentResized: false })).toEqual({
      following: false,
      repin: false,
    })
  })

  it("follows again at the end, and never pulls back a reader who had scrolled up", () => {
    expect(followAfterScroll({ fromBottom: AT_END_PX, wasFollowing: false, readerInput: true, contentResized: false }).following).toBe(true)
    expect(followAfterScroll({ fromBottom: 600, wasFollowing: false, readerInput: false, contentResized: true })).toEqual({
      following: false,
      repin: false,
    })
  })

  it("is what the message list decides by, not the position alone", () => {
    const src = readFileSync(join(__dirname, "MessaageListVirtua.tsx"), "utf8")
    expect(src).toContain("followAfterScroll(")
    expect(src).not.toMatch(/atBottomRef\.current\s*=\s*fromBottom\s*<=/)
  })
})
