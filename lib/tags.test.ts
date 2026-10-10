import { describe, expect, it } from "vitest"
import { MAX_TAGS, hasTag, joinTags, splitTags, tagTone } from "./tags"

describe("tags", () => {
  it("split a label into its tags", () => {
    expect(splitTags(" frontend ,  needs   review, ,")).toEqual(["frontend", "needs review"])
    expect(splitTags("")).toEqual([])
    expect(splitTags(undefined)).toEqual([])
  })
  it("join as the server stores them", () => {
    expect(joinTags(["Bug", "bug", " a,b ", "x".repeat(40)])).toBe(`Bug, a b, ${"x".repeat(32)}`)
    expect(splitTags(joinTags(Array.from({ length: 15 }, (_, i) => `t${i}`)))).toHaveLength(MAX_TAGS)
  })
  it("find a tag whatever its case, and colour it the same", () => {
    expect(hasTag("Frontend, bug", "BUG")).toBe(true)
    expect(hasTag("frontend", "front")).toBe(false)
    expect(tagTone("Bug")).toBe(tagTone("bug"))
  })
})

describe("a tag's colour", () => {
  it("is a camp hue's tint with its ink, never a raw palette colour", () => {
    for (const t of ["bug", "frontend", "needs review", "launch", "Q4"]) {
      expect(tagTone(t)).toMatch(/^hue-(sky|moss|sun|dusk|berry|lake) bg-hue-tint text-hue-ink$/)
      expect(tagTone(t)).not.toMatch(/-[0-9]{3}/)
    }
  })
})
