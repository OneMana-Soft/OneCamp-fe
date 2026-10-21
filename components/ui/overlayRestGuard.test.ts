import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * AN OVERLAY'S ENTRANCE HOLDS NOTHING ONCE IT ENDS (18 Oct 2026).
 *
 * An animation that moves and fills forwards or both keeps its last frame, a
 * transform, and that makes the element the containing block of every fixed
 * box inside it (measured in Chromium, Firefox and WebKit, even when the last
 * frame is transform: none). The menus kept tw-animate-css's identity
 * transform, and a side menu inside one was clipped away whole. Entrances fill
 * backwards: the delay shows the first frame and nothing is held after.
 * e2e/overlayRest.spec.ts measures the computed styles in a browser; this is
 * the quick check of the same rule, on the sources:
 *   1. the animate-in token (every menu, popover, select, tooltip and sheet);
 *   2. each overlay's own entrance in the stylesheets (open state).
 */

const css = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

/** Each declaration `animation: <name> ... <fill>;` under a selector that matches. */
export function heldEntrances(source: string, selector: RegExp): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [sel, body] = [m[1].trim(), m[2]]
    if (!selector.test(sel)) continue
    for (const d of body.matchAll(/animation:\s*([^;]+);/g)) if (/\b(both|forwards)\b/.test(d[1])) out.push(`${sel.replace(/\s+/g, " ")} { animation: ${d[1].trim()} }`)
  }
  return out
}


describe("an overlay's entrance holds nothing once it ends", () => {
  it("fills animate-in backwards", () => {
    const token = css("app/globals.css").match(/--animate-in:\s*([^;]+);/)
    expect(token, "app/globals.css sets --animate-in over tw-animate-css's").not.toBeNull()
    expect(token![1].trim()).toMatch(/\bbackwards$/)
  })

  it("fills each overlay's own entrance backwards", () => {
    const held = [
      ...heldEntrances(css("app/globals.css"), /\.shell-pop\[data-[^\]]+\]/).filter((d) => !/closed/.test(d)),
      ...heldEntrances(css("app/styles/admin/feedback.css"), /\.v3-(?:dialog|sheet)[^{]*\[data-state="open"\]/),
    ]
    const float = css("app/content.css").match(/@utility content-float \{\s*[^}]*?animation:\s*([^;]+);/)
    if (!float || /\b(both|forwards)\b/.test(float[1])) held.push(`content-float { animation: ${float?.[1] ?? "?"} }`)
    expect(held, held.join("\n")).toEqual([])
  })

  it("bites on a held entrance", () => {
    expect(heldEntrances('.shell-pop[data-state="open"] { animation: a 1s ease both; }', /\.shell-pop/)).toHaveLength(1)
    expect(heldEntrances('.shell-pop[data-state="open"] { animation: a 1s ease backwards; }', /\.shell-pop/)).toHaveLength(0)
  })
})
