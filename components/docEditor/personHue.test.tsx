import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { collaboratorHue, identityHue } from "@/lib/identityHue"
import { mentionHue } from "@/components/message/tintMentions"
import { collaboratorCaret, collaboratorSelection } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"

// One colour per person, on every surface (design v3). Avatars everywhere key
// a person's hue by their name (getAvatarFallbackClass), and so do @mention
// chips; a doc keyed carets, name flags and the presence stack by the user id,
// so Sam was gold in a doc and teal everywhere else. Agents keep the agent
// tint and their square.

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))

import { ActiveUsersBar } from "./ActiveUsersBar"
import { MentionAvatar } from "@/components/minimal-tiptap/extensions/mention-list/mentionMember"

afterEach(cleanup)

// An id whose own hash lands on another hue than the name's, so the test
// tells the two keys apart.
const sam = { id: "289b6b5d-c30c-427a-bcec-634cb294f285", name: "Sam Rivera" }

const shell = (ui: React.ReactNode) =>
  render(
    <MediaQueryProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </MediaQueryProvider>,
  )

describe("a person's colour in a doc", () => {
  const hue = identityHue({ name: sam.name, id: sam.id })

  it("falls back to the id only when there's no name, and a colour the person picked wins", () => {
    expect(identityHue({ name: "", id: sam.id })).toBe(hueFor(sam.id))
    const picked = hueFor(sam.name) === "berry" ? "moss" : "berry"
    expect(identityHue({ name: sam.name, id: sam.id, chosen: picked })).toBe(picked)
  })

  it("comes through awareness: a remote caret and face wear the hue the person's own tab sent", () => {
    // Sam picked a colour: only Sam's tab knows it, so it travels with Sam.
    const picked = hueFor(sam.name) === "berry" ? "moss" : "berry"
    const sent = { ...sam, color: "#ff00ff", hue: identityHue({ name: sam.name, id: sam.id, chosen: picked }) }
    expect(collaboratorHue(sent)).toBe(picked)
    expect(collaboratorCaret(sent).classList.contains(HUE_CLASS[picked])).toBe(true)
    const { container } = shell(<ActiveUsersBar users={[sent]} />)
    expect(container.querySelector("[data-presence-stack] [data-hue]")?.getAttribute("data-hue")).toBe(picked)
    // An older tab sends no hue: its display name decides, the same way.
    const older = { ...sam, color: "#ff00ff" }
    expect(collaboratorHue(older)).toBe(hue)
  })

  it("is not the id's hash (the doc's old key)", () => {
    expect(hueFor(sam.id)).not.toBe(hue)
  })

  it("is their avatar's, everywhere: the avatar, the @mention chip, the @ picker row", () => {
    expect(getAvatarFallbackClass(sam.name)).toContain(HUE_CLASS[hue])
    expect(mentionHue(`@${sam.name}`)).toBe(hue)
    const { container } = shell(<MentionAvatar person={{ user_uuid: sam.id, user_full_name: sam.name } as never} />)
    expect(container.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hue)
  })

  it("is their caret's, their name flag's and their selection's", () => {
    const caret = collaboratorCaret(sam)
    expect(caret.classList.contains(HUE_CLASS[hue])).toBe(true)
    expect(collaboratorSelection(sam).class).toContain(HUE_CLASS[hue])
  })

  it("is drawn for the eye only: a screen reader doesn't read their name mid-sentence (A7)", () => {
    const caret = collaboratorCaret(sam)
    expect(caret.getAttribute("aria-hidden")).toBe("true")
    expect(caret.textContent).toContain(sam.name.split(" ")[0])
  })

  it("is their face's in the presence stack, and the bar beside their name in Here now", () => {
    const { container } = shell(<ActiveUsersBar users={[{ ...sam, color: "#ff00ff" }]} />)
    expect(container.querySelector("[data-presence-stack] [data-hue]")?.getAttribute("data-hue")).toBe(hue)
  })

  it("leaves an agent in the agent tint, square: never a person's hue", () => {
    const agent = { id: "agent-1", name: "Release Captain", kind: "agent" }
    const caret = collaboratorCaret(agent)
    expect(caret.classList.contains("caret-agent")).toBe(true)
    expect([...caret.classList].some((c) => c.startsWith("hue-"))).toBe(false)
    expect(collaboratorSelection(agent).class).toContain("caret-agent")
    const { container } = shell(<ActiveUsersBar users={[{ id: agent.id, name: agent.name, color: "", agent: true }]} />)
    const face = container.querySelector("[data-presence-stack] [data-agent]")
    expect(face?.className).toContain("rounded-[32%]")
    expect(face?.querySelector("[data-hue]")).toBeNull()
  })
})
