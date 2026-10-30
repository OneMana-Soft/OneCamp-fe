import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type Rule } from "postcss"
import { afterEach, describe, expect, it } from "vitest"

/**
 * AN OPEN TRIGGER IS ENGAGED IN INK, NOT THE ACCENT (DESIGN-BUILD-5, approved
 * 22 Oct 2026). app/interaction.css draws an open menu's trigger at the press
 * alpha, and the tint was the brand's, so every open button, icon, chip, row
 * and nav item turned orange while its menu, popover or dialog was up: the
 * Connected trigger, the calendar's View options. Open is a state, not a
 * choice, so its tint is ink. A trigger that carries a tone (danger, success)
 * keeps it, and a menu's own items keep the brand: their highlight is where
 * the pointer or the keyboard is.
 *
 * A fold that opens in place (aria-expanded with no popup, a tree row) is not
 * an open trigger: it keeps its hue, and nothing tints it at rest.
 */
const rules: Rule[] = []
postcss.parse(readFileSync(join(__dirname, "interaction.css"), "utf8")).walkRules((r) => {
  rules.push(r)
})
const decl = (r: Rule, prop: string) => r.nodes.find((n) => n.type === "decl" && n.prop === prop)?.toString().split(":").slice(1).join(":").trim()

const made: Element[] = []
afterEach(() => made.splice(0).forEach((n) => n.remove()))
function el(attrs: Record<string, string>): Element {
  const b = document.createElement("button")
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v)
  document.body.append(b)
  made.push(b)
  return b
}

describe("an open trigger's tint", () => {
  // The rule for the open state: a neutral tone (a pick, an open row's toggle)
  // takes the ink at rest in a rule of its own.
  const ink = rules.filter((r) => decl(r, "--ix-tint") === "var(--ink)" && r.selector.includes('[data-state="open"]'))

  it("is ink, in one rule that sets the mark to ink too", () => {
    expect(ink).toHaveLength(1)
    expect(decl(ink[0], "--ix-mark")).toBe("var(--ink)")
  })

  it("comes after the layer's own brand tint, so it wins on the elements it names", () => {
    const base = rules.findIndex((r) => r.selector === "[data-interactive]" && decl(r, "--ix-tint") !== undefined)
    expect(base).toBeGreaterThan(-1)
    expect(rules.indexOf(ink[0])).toBeGreaterThan(base)
  })

  it("covers the five kinds that open something, open by Radix's state or by a popup's aria-expanded", () => {
    const sel = ink[0].selector
    for (const kind of ["button", "icon", "chip", "row", "nav"]) {
      expect(el({ "data-interactive": kind, "data-state": "open" }).matches(sel), kind).toBe(true)
      expect(el({ "data-interactive": kind, "aria-expanded": "true", "aria-haspopup": "menu" }).matches(sel), `${kind}, a popup's`).toBe(true)
    }
  })

  it("leaves a closed trigger, a toned one, a menu's items and a fold that opens in place alone", () => {
    const sel = ink[0].selector
    expect(el({ "data-interactive": "button", "data-state": "closed" }).matches(sel)).toBe(false)
    expect(el({ "data-interactive": "button", "aria-expanded": "false", "aria-haspopup": "menu" }).matches(sel)).toBe(false)
    expect(el({ "data-interactive": "icon", "data-state": "open", "data-tone": "danger" }).matches(sel)).toBe(false)
    expect(el({ "data-interactive": "item", "data-state": "open" }).matches(sel)).toBe(false)
    expect(el({ "data-interactive": "item", "data-highlighted": "" }).matches(sel)).toBe(false)
    // A tree row or a section's fold: open in place, its own hue kept.
    expect(el({ "data-interactive": "nav", "aria-expanded": "true" }).matches(sel)).toBe(false)
    expect(el({ "data-interactive": "row", "aria-expanded": "true", "aria-current": "page" }).matches(sel)).toBe(false)
  })
})
