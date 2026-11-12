import { readFileSync } from "node:fs"
import postcss, { type AtRule, type Declaration, type Node, type Rule } from "postcss"
import { describe, expect, it } from "vitest"

// V-889: the toast's action (Undo, Retry, View) looks 26px tall, under the 44px a finger needs, so a phone's
// "Moved, Undo" or "Deleted, Undo" missed as often as it hit. On a coarse pointer a ::before reaches out from the
// action into its card; the look, and a mouse's target, stay as they are. The card clips the reach, so it never
// covers the next toast in the stack or grows the card, and it stops short of the ×'s column at the top right.
// globals.css draws the toast; phone.css makes it a 44px pill with 6px padding under 640px.
const sheets = ["app/globals.css", "app/phone.css"].map((f) => postcss.parse(readFileSync(f, "utf8")))
const tsx = readFileSync("components/ui/toast.tsx", "utf8")

/** Every rule naming `selector`, with the @media params it sits under (innermost first). */
function rules(selector: string): { rule: Rule; media: string[] }[] {
  const out: { rule: Rule; media: string[] }[] = []
  for (const css of sheets) css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return
    const media: string[] = []
    for (let p = rule.parent as Node | undefined; p && p.type !== "root"; p = p.parent as Node | undefined) {
      if (p.type === "atrule" && (p as AtRule).name === "media") media.push((p as AtRule).params)
    }
    out.push({ rule, media })
  })
  return out
}
const value = (rule: Rule, prop: string) => (rule.nodes.find((n) => n.type === "decl" && n.prop === prop) as Declaration | undefined)?.value
const pxs = (v: string | undefined) => (v ?? "").split(/\s+/).map((s) => parseFloat(s))
/** A Tailwind class's px in the component's class list: h-[26px] or size-5 (4px a step). */
const classPx = (component: string, re: RegExp) => {
  const m = tsx.match(new RegExp(`"${component}\\b[^"]*`))?.[0].match(re)
  return m ? (m[1].endsWith("px") ? parseFloat(m[1]) : parseFloat(m[1]) * 4) : NaN
}

const COARSE = "(pointer: coarse)"
const reach = rules(".toast-action::before")
const look = classPx("toast-action", /\bh-\[(\d+px)\]/)

describe("the toast's action on a finger (V-889)", () => {
  it("keeps its 26px look", () => {
    expect(look).toBe(26)
  })

  it("reaches out to a 44px tap on a coarse pointer, and only there", () => {
    expect(reach.map((r) => r.media)).toEqual([[COARSE]])
    const [{ rule }] = reach
    expect(value(rule, "content")).toBe('""')
    expect(value(rule, "position")).toBe("absolute")
    const [top, , bottom] = pxs(value(rule, "inset"))
    expect(look - top - bottom).toBeGreaterThanOrEqual(44)
    // The reach is placed from the action itself, under the same query.
    const anchor = rules(".toast-action").filter((r) => r.media.includes(COARSE))
    expect(anchor.map((r) => value(r.rule, "position"))).toEqual(["relative"])
    expect(rules(".toast-action::after")).toEqual([])
  })

  it("is not covered by the timer line, which takes no taps", () => {
    // The 2px line at the card's foot comes after the action, so it would lie over the reach's last 2px on a 44px pill.
    expect(rules(".toast-timer").map((r) => value(r.rule, "pointer-events"))).toContain("none")
  })

  it("stays inside its card, which is tall enough for it, and clear of the ×", () => {
    const card = rules(".toast-card")
    const base = card.find((r) => r.media.length === 0)!.rule
    expect(value(base, "overflow")).toBe("hidden")
    const [top, right, bottom] = pxs(value(reach[0].rule, "inset"))
    // The shortest card, the phone's pill, holds the whole reach.
    const heights = card.map((r) => parseFloat(value(r.rule, "min-height") ?? "")).filter((h) => !isNaN(h))
    expect(heights.length).toBeGreaterThan(1)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(look - top - bottom)
    // The × sits over the card's top right corner: its left edge is (its width + its right) in from the card's right,
    // and the action's right edge is the card's right padding in. The reach ends where the × begins, or before.
    const close = rules(".toast-close").find((r) => r.media.length === 0 && value(r.rule, "right"))!.rule
    const xLeftIn = classPx("toast-close", /\bsize-(\d+)/) + parseFloat(value(close, "right")!)
    // The action's right edge is the card's right padding in: 10px, or the pill's 6px.
    const pads = card.map((r) => pxs(value(r.rule, "padding"))[1]).filter((p) => !isNaN(p))
    expect(pads.length).toBeGreaterThan(1)
    expect(right).toBeGreaterThanOrEqual(xLeftIn - Math.min(...pads))
  })
})
