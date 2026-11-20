import { readFileSync } from "node:fs"

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AiMark as AiEditionMark } from "@/components/ai/AiMark"
import { AiMark } from "@/components/ui/graphics/AiMark"

/**
 * One mark for the AI (UX-PROGRAM foundation 2): the agent square for its
 * identity, and the same square breathing beside words while it works (inside
 * a control the AI is motifs' Spark). components/ai/AiMark is the same function.
 */
describe("the AI mark", () => {
  it("AiMark is the agent square with the white spark, decorative unless it is given a name", () => {
    const { container } = render(<AiMark size={32} />)
    const mark = container.querySelector("[data-ai-mark]") as HTMLElement
    expect(mark.className).toContain("avatar-agent")
    expect(mark.className).toContain("rounded-[32%]")
    expect(mark.style.width).toBe("32px")
    expect(mark.getAttribute("aria-hidden")).toBe("true")
    expect(mark.querySelector("svg")?.getAttribute("class")).toContain("fill-white")
    expect(mark.querySelector("svg")?.style.width).toBe(`${32 * 0.55}px`)

    const named = render(<AiMark label="OneCamp AI" />).getByRole("img", { name: "OneCamp AI" })
    expect(named.hasAttribute("data-ai-mark")).toBe(true)
    expect(named.hasAttribute("aria-hidden")).toBe(false)
  })

  it("the AI edition's AiMark is the same mark", () => {
    expect(AiEditionMark).toBe(AiMark)
  })

  it("at work it is the same mark breathing, the spark and not the square, and never a spinner", () => {
    const { container } = render(<AiMark size={20} breathing />)
    const mark = container.querySelector("[data-ai-mark]") as HTMLElement
    expect(mark.hasAttribute("data-breathing")).toBe(true)
    expect(mark.className).not.toContain("hub-breathe")
    expect(mark.querySelector("svg")?.getAttribute("class")).toContain("hub-breathe")
    expect(container.querySelector(".animate-spin, .lucide-loader-circle, .lucide-loader-2")).toBeNull()
    expect(render(<AiMark />).container.querySelector("[data-breathing], .hub-breathe")).toBeNull()
  })

  it("is still under reduced motion: the breath stops and the words lose their shimmer", () => {
    const globals = readFileSync("app/globals.css", "utf8")
    const hub = readFileSync("app/hub.css", "utf8")
    // Every animation runs once in 0.01 ms, so the spark rests at full size.
    expect(globals).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{\s*animation-duration: 0\.01ms !important;\s*animation-iteration-count: 1 !important;/)
    expect(hub).toMatch(/\.hub-breathe \{[^}]*animation: hub-breathe/)
    expect(hub).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hub-shimmer \{\s*background: none;\s*color: var\(--ink-3\);/)
  })
})
