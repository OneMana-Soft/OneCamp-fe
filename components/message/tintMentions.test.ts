import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { hueFor } from "@/lib/campHue"
import { agentIdsOf, mentionHue, mentionKind, mentionsUser, tintMentions } from "./tintMentions"

// chat.md C14 / content.md D24: only a mention of you is coloured (brand);
// anyone else is a neutral chip whose hue moves to a dot; an agent is on the
// agent tint with the spark where the "@" was. It was every chip in the
// mentioned person's hue.

const mention = (label: string, id = "u1@0x1", extra = "") =>
  `<span data-type="mention" data-id="${id}" data-label="${label}"${extra}>@${label}</span>`

describe("tintMentions", () => {
  it("marks only a mention of the reader as mention-me", () => {
    const out = tintMentions(`<p>${mention("Sam Rivera", "me-uuid@0x2")} and ${mention("Maya Chen")}</p>`, { me: "me-uuid" })
    expect(out).toContain(`data-id="me-uuid@0x2" data-label="Sam Rivera" class="mention-me"`)
    expect(out.match(/mention-me/g)).toHaveLength(1)
  })

  it("gives anyone else the neutral chip with a dot in their hue, and no hue class on the chip", () => {
    const out = tintMentions(`<p>${mention("Maya Chen")}</p>`)
    expect(out).toContain(`class="mention-person" data-hue="${hueFor("Maya Chen")}"`)
    expect(out).not.toMatch(/class="[^"]*\bhue-/)
  })

  it("puts an agent on the agent tint, with the spark for the @", () => {
    const out = tintMentions(`<p>${mention("Release Captain", "bot-1")}</p>`, { agentIds: ["bot-1"] })
    expect(out).toContain(`class="mention-agent"`)
    expect(out).toContain('class="mention-spark"')
    expect(out).not.toContain(">@Release")
    expect(mentionKind("bot-1@0x9", { agentIds: new Set(["bot-1"]) })).toBe("agent")
  })

  it("reads the agents out of a bot-kind map, and only the AI ones", () => {
    const ids = agentIdsOf({ rc: "agent", gh: "github" })
    expect(ids).toContain("rc")
    expect(ids).not.toContain("gh")
    expect(agentIdsOf(undefined)).toEqual([])
  })

  it("draws the dot in the colour the person's avatar is", () => {
    expect(mentionHue("Jonas Weber")).toBe(hueFor("Jonas Weber"))
    expect(mentionHue("@Jonas Weber")).toBe(hueFor("Jonas Weber"))
  })

  it("keeps the classes a mention already has, and reads an escaped name", () => {
    const out = tintMentions(mention("Seán O&#39;Neil", "u1", ' class="mention"'))
    expect(out).toContain(`class="mention mention-person" data-hue="${hueFor("Seán O'Neil")}"`)
  })

  it("leaves channel and work-item references, and bodies without a mention, alone", () => {
    const channel = `<span data-type="channelMention" data-id="c1" data-label="design">#design</span>`
    expect(tintMentions(channel)).toBe(channel)
    expect(tintMentions("<p>No one here</p>")).toBe("<p>No one here</p>")
  })

  it("tells whether a body mentions the reader", () => {
    expect(mentionsUser(`<p>${mention("Sam", "me@0x1")}</p>`, "me")).toBe(true)
    expect(mentionsUser(`<p>${mention("Maya", "maya@0x1")}</p>`, "me")).toBe(false)
    expect(mentionsUser("<p>hi</p>", undefined)).toBe(false)
  })
})

describe("the mention chip's style", () => {
  const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
  it("is neutral, with the hue only on the dot", () => {
    const base = /:is\(\.static-rich, \.minimal-tiptap-editor\) span\[data-type="mention"\],\s*\.chat-mention \{([^}]*)\}/.exec(css)?.[1] ?? ""
    expect(base).toMatch(/background-color:\s*var\(--hover\)/)
    expect(base).not.toMatch(/--hue-tint/)
    expect(css).toMatch(/\.mention-person::before \{[^}]*var\(--mention-dot/)
  })
  it("spends the accent on the reader's own mention, and the agent tint on an agent's", () => {
    expect(css).toMatch(/\.chat-mention\.mention-me \{[^}]*var\(--brand-muted\)/)
    expect(css).toMatch(/\.chat-mention\.mention-agent \{[^}]*var\(--agent-muted\)/)
  })
})
