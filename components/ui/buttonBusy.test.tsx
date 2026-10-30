import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type AtRule } from "postcss"
import type { FormEvent } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Button } from "@/components/ui/button"

// A primary busy with its own action keeps its brand fill (main's ruling, 23
// Oct 2026): disabled turned it to the field's look mid-press, which read as
// unavailable or failed. busy says so to assistive tech, blocks the second
// press, and keeps the button where focus left it.
afterEach(cleanup)

describe("a busy button", () => {
  it("says it's busy and stays enabled and focusable", () => {
    render(<Button busy>Save</Button>)
    const save = screen.getByRole("button", { name: "Save" })
    expect(save.getAttribute("aria-busy")).toBe("true")
    expect((save as HTMLButtonElement).disabled).toBe(false)
    save.focus()
    expect(document.activeElement).toBe(save)
  })

  it("takes no second press", () => {
    const press = vi.fn()
    render(<Button busy onClick={press}>Save</Button>)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(press).not.toHaveBeenCalled()
  })

  it("doesn't submit its form again", () => {
    const submit = vi.fn((e: FormEvent) => e.preventDefault())
    render(
      <form onSubmit={submit}>
        <Button type="submit" busy>Create</Button>
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(submit).not.toHaveBeenCalled()
  })

  it("presses again once its action is done", () => {
    const press = vi.fn()
    const { rerender } = render(<Button busy onClick={press}>Save</Button>)
    rerender(<Button busy={false} onClick={press}>Save</Button>)
    const save = screen.getByRole("button", { name: "Save" })
    fireEvent.click(save)
    expect(press).toHaveBeenCalledTimes(1)
    expect(save.hasAttribute("aria-busy")).toBe(false)
  })
})

// The interaction layer as a browser applies it to one element, or to its
// ::after: the declarations of every rule whose selector matches it, in the
// sheet's order, whichever media query holds the rule.
const LAYER = postcss.parse(readFileSync(join(process.cwd(), "app/interaction.css"), "utf8"))

// Nothing is under a pointer here, so a rule that needs one (a :hover outside
// any parentheses) draws nothing, and it isn't handed to jsdom, which can't
// parse some that a browser takes: the moving-list rule's :not(:has(…))
// followed by :where(…).
function needsPointer(selector: string): boolean {
  let depth = 0
  for (let i = 0; i < selector.length; i++) {
    if (selector[i] === "(") depth++
    else if (selector[i] === ")") depth--
    else if (depth === 0 && selector.startsWith(":hover", i)) return true
  }
  return false
}

function drawn(el: Element, pseudo: "" | "::after" = ""): Record<string, string> {
  const got: Record<string, string> = {}
  LAYER.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && (rule.parent as AtRule).name === "keyframes") return
    for (const selector of rule.selectors) {
      const own = pseudo ? selector.endsWith(pseudo) && selector.slice(0, -pseudo.length) : !selector.includes("::") && selector
      if (own && !needsPointer(own) && el.matches(own)) rule.walkDecls((d) => void (got[d.prop] = d.value))
    }
  })
  return got
}

// Dimmed to 70% with nothing turning, a busy "Make a link" read as
// unavailable: its label fell to 2.94:1 on the brand (DESIGN-BUILD-10, 24 Oct
// 2026). Busy keeps the fill and the label at full strength, and a spinner
// takes the leading icon's place, or stands before the label.
describe("a busy button's look", () => {
  for (const size of ["default", "icon"] as const) {
    it(`keeps its fill and label at full strength and spins in its icon's place (${size})`, () => {
      render(<Button size={size} busy aria-label="Send"><svg /></Button>)
      const send = screen.getByRole("button", { name: "Send" })
      expect(send.className).not.toMatch(/(?:^|\s)\S*aria-busy:\S*opacity-/)
      expect(drawn(send).opacity ?? "1").toBe("1")
      const spinner = drawn(send, "::after")
      expect(spinner.content).toBe('""')
      expect(spinner.animation).toMatch(/\binfinite\b/)
      expect(drawn(send.querySelector("svg")!).display).toBe("none")
    })
  }

  it("stands its spinner before a label with no icon", () => {
    render(<Button busy>Make a link</Button>)
    expect(drawn(screen.getByRole("button", { name: "Make a link" }), "::after").order).toBe("-1")
  })

  it("draws no spinner, and keeps its icon, once its action is done", () => {
    render(<Button aria-label="Send"><svg /></Button>)
    const send = screen.getByRole("button", { name: "Send" })
    expect(drawn(send, "::after").content).toBeUndefined()
    expect(drawn(send.querySelector("svg")!).display).toBeUndefined()
  })
})
