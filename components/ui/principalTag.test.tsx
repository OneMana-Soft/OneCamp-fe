import { describe, expect, it } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { PrincipalTag, botTagKind } from "./principalTag"

/**
 * These assert the two things the tag exists for, not its appearance.
 *
 * First, that it renders IDENTICALLY per kind. The whole reason the component
 * exists is that six hand-rolled "AI" markers disagreed on radius, padding and
 * font size, so a member saw a slightly different trust signal depending on the
 * surface. If two renders of the same kind can ever differ, the component has
 * failed at its only job.
 *
 * Second, that the signal exists non-visually. Four of the six original tags had
 * no title and no expansion, so a screen reader announced a bare "AI" beside a
 * human-looking name — the marker that distinguishes an agent from a colleague
 * was simply absent. The short form must be hidden from readers and the spoken
 * form present, never both.
 */
describe("PrincipalTag", () => {
  it("renders identical markup for the same kind, wherever it is used", () => {
    const a = render(<PrincipalTag kind="ai" />).container.innerHTML
    cleanup()
    const b = render(<PrincipalTag kind="ai" />).container.innerHTML
    expect(a).toBe(b)
  })

  it("shows the short form to the eye and hides it from readers", () => {
    const { container } = render(<PrincipalTag kind="ai" />)
    const short = container.querySelector('[aria-hidden="true"]')
    expect(short?.textContent).toBe("Agent")
  })

  it("gives a reader the expanded meaning, which four call sites never did", () => {
    const { container } = render(<PrincipalTag kind="ai" />)
    const spoken = container.querySelector(".sr-only")
    // "AI" alone does not answer the trust question out of context; "AI agent"
    // does.
    expect(spoken?.textContent).toBe("AI agent")
  })

  it("says a guest is outside the workspace, since that is the whole point", () => {
    const { container } = render(<PrincipalTag kind="guest" />)
    expect(container.querySelector(".sr-only")?.textContent).toBe("Guest user")
    expect(container.firstElementChild?.getAttribute("title")).toContain("outside")
  })

  it("uses the named type token, so it cannot drift off the scale", () => {
    const { container } = render(<PrincipalTag kind="ai" />)
    const cls = container.firstElementChild?.className || ""
    expect(cls).toContain("text-3xs")
    // An arbitrary pixel size here would reintroduce exactly the bypass the
    // type-scale ratchet is draining.
    expect(cls).not.toMatch(/text-\[\d+px\]/)
  })

  it("distinguishes the kinds — an agent must not look like a guest", () => {
    const ai = render(<PrincipalTag kind="ai" />).container.innerHTML
    cleanup()
    const guest = render(<PrincipalTag kind="guest" />).container.innerHTML
    expect(ai).not.toBe(guest)
  })

  it("says a plain bot is automated, and claims no AI for it", () => {
    const { container } = render(<PrincipalTag kind="bot" />)
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("Bot")
    expect(container.querySelector(".sr-only")?.textContent).toBe("Automated account")
    expect(container.innerHTML).not.toMatch(/\bAI\b|agent/i)
  })

  it("tags only the assistant and agents as agents", () => {
    expect(botTagKind("assistant")).toBe("ai")
    expect(botTagKind("agent")).toBe("ai")
    expect(botTagKind("guest")).toBe("guest")
    // The Check-in, Slack and AI-free automation bots, a kind this build
    // doesn't know, and a list still loading: never "Agent".
    for (const kind of ["checkin", "bridge", "automation", "bot", "something-new", undefined]) {
      expect(botTagKind(kind)).toBe("bot")
    }
  })
})
