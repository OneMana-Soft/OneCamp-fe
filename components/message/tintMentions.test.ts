import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { mentionHue, tintMentions } from "./tintMentions"

// A mention is drawn in the mentioned person's hue, the colour their avatar
// is (the playful layer of 10 Oct 2026): it was one neutral grey chip for
// everyone.

const mention = (label: string, extra = "") =>
  `<span data-type="mention" data-id="u1@0x1" data-label="${label}"${extra}>@${label}</span>`

describe("tintMentions", () => {
  it("gives each person mention that person's hue class", () => {
    const out = tintMentions(`<p>${mention("Sam Rivera")} and ${mention("Maya Chen")}</p>`)
    expect(out).toContain(`class="${HUE_CLASS[hueFor("Sam Rivera")]}"`)
    expect(out).toContain(`class="${HUE_CLASS[hueFor("Maya Chen")]}"`)
  })

  it("is the same hue the person's avatar is drawn in", () => {
    // Avatars are seeded by the display name (lib/utils/getAvatarColor).
    expect(mentionHue("Jonas Weber")).toBe(hueFor("Jonas Weber"))
    expect(mentionHue("@Jonas Weber")).toBe(hueFor("Jonas Weber"))
  })

  it("keeps the classes a mention already has, and reads an escaped name", () => {
    const out = tintMentions(mention("Seán O&#39;Neil", ' class="mention"'))
    expect(out).toContain(`class="mention ${HUE_CLASS[hueFor("Seán O'Neil")]}"`)
  })

  it("leaves channel and work-item references, and bodies without a mention, alone", () => {
    const channel = `<span data-type="channelMention" data-id="c1" data-label="design">#design</span>`
    expect(tintMentions(channel)).toBe(channel)
    expect(tintMentions("<p>No one here</p>")).toBe("<p>No one here</p>")
  })
})

describe("the mention chip's style", () => {
  it("draws in the current hue, with the neutral chip only as a fallback", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    const rule = /\.static-rich span\[data-type="mention"\] \{([^}]*)\}/.exec(css)?.[1] ?? ""
    expect(rule).toMatch(/background-color:\s*var\(--hue-tint,/)
    expect(rule).toMatch(/color:\s*var\(--hue-ink,/)
  })
})
