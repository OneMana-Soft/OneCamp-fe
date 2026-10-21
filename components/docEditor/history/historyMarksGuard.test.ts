import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A VERSION'S MARKS ARE DRAWN WHOLE (18 Oct 2026).
 *
 * The preview paints only the blocks near the screen (content-visibility:
 * auto on each block, history.css), which contains a block's paint: whatever
 * a mark draws past a block's box is cut. A list item's bar and the ring on
 * the change stepped to, inside a list, an ordered list or a quote, showed as
 * an edge or two (dfc672a05, born so; e2e/docs/historyMarks.spec.ts measures
 * it in three browsers). A block holding a mark gives up the skipping.
 *
 * It fails when a rule in history-diff.css draws past its element (an outline,
 * a box shadow that isn't inset) for a mark attribute that the override
 * (.history-preview > :has(…) { content-visibility: visible }) doesn't name,
 * or when the override is gone while history.css still skips blocks. Each is
 * shown biting on a fixture.
 */

const DIR = join(process.cwd(), "components/docEditor/history")

/** The rules of a stylesheet: selector and body, comments dropped, @media opened. */
function rules(css: string): { selector: string; body: string }[] {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: { selector: string; body: string }[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(flat); m; m = re.exec(flat)) out.push({ selector: m[1].trim().replace(/^@media[^{]*\{/, "").trim(), body: m[2] })
  return out
}

/** Mark attributes drawn past their element, and the ones the override covers. */
export function marksFindings(diffCss: string, historyCss: string): string[] {
  const all = rules(diffCss)
  const skips = rules(historyCss).some((r) => /content-visibility\s*:\s*auto/.test(r.body))
  const override = all.find((r) => /^\.history-preview\s*>\s*:has\(/.test(r.selector) && /content-visibility\s*:\s*visible/.test(r.body))
  const covered = new Set(override ? override.selector.match(/\[data-[\w-]+/g) ?? [] : [])
  const out: string[] = []
  if (skips && !override) out.push("history.css skips blocks (content-visibility: auto) and no .history-preview > :has(…) { content-visibility: visible } lets a marked block draw its marks")
  for (const r of all) {
    const outline = /(^|;)\s*outline\s*:(?!\s*none)[^;]*\d/.test(r.body)
    const shadow = /box-shadow\s*:(?!\s*none)[^;]+/.exec(r.body)
    const past = outline || (shadow && !/inset/.test(shadow[0]))
    if (!past) continue
    for (const attr of new Set(r.selector.match(/\[data-[\w-]+/g) ?? [])) {
      if (!covered.has(attr)) out.push(`"${r.selector}" draws past its element, and ${attr}] is not in the override`)
    }
  }
  return out
}

describe("a version's marks are drawn whole", () => {
  it("every mark drawn past its element is in a block that paints it", () => {
    const found = marksFindings(readFileSync(join(DIR, "diff/history-diff.css"), "utf8"), readFileSync(join(DIR, "history.css"), "utf8"))
    expect(found, found.join("\n")).toEqual([])
  })

  it("bites: a mark the override doesn't name, and no override", () => {
    const skip = ".history-preview > * { content-visibility: auto; }"
    const withOverride = `.history-preview > :has([data-history-change]) { content-visibility: visible; }
.history-preview [data-history-change] { box-shadow: -3px 0 0 0 red; }
.history-preview [data-history-current] { outline: 2px solid blue; outline-offset: 3px; }
.history-preview [data-history-quiet] { box-shadow: inset 0 0 0 1px red; }`
    expect(marksFindings(withOverride, skip)).toEqual([expect.stringContaining("[data-history-current] is not in the override")])
    expect(marksFindings(".history-preview [data-history-change] { box-shadow: -3px 0 0 0 red; }", skip)).toEqual([
      expect.stringContaining("no .history-preview > :has"),
      expect.stringContaining("[data-history-change] is not in the override"),
    ])
    expect(marksFindings(".history-preview img[data-history-change] { box-shadow: none; outline: 2px solid red; }", "")).toEqual([expect.stringContaining("[data-history-change] is not in the override")])
  })
})
