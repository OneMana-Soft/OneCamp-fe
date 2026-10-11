import { describe, expect, it } from "vitest"
import data from "@emoji-mart/data"
import type { EmojiMartData } from "@emoji-mart/data"
import { searchEmoji } from "./emojiSuggest"
import { isEmojiOnly } from "@/lib/chat/emojiOnly"

// Design v3 chat, C43: ":" and two letters offer up to eight emoji; a message
// of one to three emoji and nothing else is drawn large.
describe("emoji in the composer", () => {
  it("offers 🚀 for :ro within the first eight", () => {
    const hits = searchEmoji(data as EmojiMartData, "ro")
    expect(hits.length).toBeLessThanOrEqual(8)
    expect(hits.map((h) => h.native)).toContain("🚀")
  })
  it("waits for two letters", () => {
    expect(searchEmoji(data as EmojiMartData, "r")).toEqual([])
  })
})

describe("an emoji-only message", () => {
  it("is one to three emoji and nothing else", () => {
    expect(isEmojiOnly("<p>🚀</p>")).toBe(true)
    expect(isEmojiOnly("<p>🎉 👍🏽 🚀</p>")).toBe(true)
    expect(isEmojiOnly("<p>🎉🎉🎉🎉</p>")).toBe(false)
    expect(isEmojiOnly("<p>ship it 🚀</p>")).toBe(false)
  })
})
