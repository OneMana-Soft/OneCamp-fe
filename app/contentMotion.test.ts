import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The content area's motion (content.md §1.3 and §1.6.1): docs, tables,
 * boards, the calendar, booking and files move with one set of tokens, and
 * what floats there enters the same way (`float-in`).
 *
 *   - every --content-* token exists with the duration and curve the spec
 *     gives it;
 *   - FloatingBar and CommandList use float-in (the content-float utility);
 *   - nothing in the area's folders transitions `all`, or animates width,
 *     height, top or left, outside the allow list.
 */

const ROOT = process.cwd()
const css = readFileSync(join(ROOT, "app/content.css"), "utf8")

const TOKENS: Array<[string, string, string]> = [
  // name, duration, curve
  ["float-in", "180ms", "var(--ease-out)"],
  ["float-follow", "120ms", "var(--ease-out)"],
  ["menu-cursor", "90ms", "var(--ease-out)"],
  ["period", "220ms", "var(--ease-out)"],
  ["event-in", "240ms", "var(--ease-spring)"],
  ["ghost", "90ms", "var(--ease-out)"],
  ["caret-flag", "160ms", "var(--ease-out)"],
  ["row-in", "200ms", "var(--ease-out)"],
  ["cell-commit", "600ms", "var(--ease-out)"],
  ["width-step", "240ms", "var(--ease-in-out)"],
  ["save-dot", "1.2s", "var(--ease-in-out)"],
]

function files(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

const AREA = ["components/docEditor", "components/minimal-tiptap", "components/calendar", "components/table", "components/board"]

// Layout motion the spec allows in the area: the booking card's width-step
// and the poll's bar (each counted by app/motionCost.test.ts as well).
const ALLOW: Record<string, number> = {
  "components/minimal-tiptap/extensions/poll/poll-view.tsx": 1,
}

describe("content motion", () => {
  it("defines every --content-* token with its duration and curve", () => {
    for (const [name, duration, curve] of TOKENS) {
      expect(css, `--content-${name}-duration`).toMatch(new RegExp(`--content-${name}-duration:\\s*${duration.replace(".", "\\.")};`))
      expect(css, `--content-${name}-ease`).toContain(`--content-${name}-ease: ${curve};`)
    }
    expect(css).toContain("--content-float-out-duration: 120ms;")
  })

  it("floats in: FloatingBar and CommandList use the float-in utility", () => {
    for (const f of ["components/ui/FloatingBar.tsx", "components/ui/CommandList.tsx"]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toMatch(/\bcontent-float\b/)
    }
    expect(css).toMatch(/@utility content-float \{[\s\S]*content-float-in var\(--content-float-in-duration\)/)
  })

  it("never transitions `all`, or animates width, height, top or left, in the area", () => {
    const bad: string[] = []
    for (const dir of AREA) {
      for (const f of files(join(ROOT, dir))) {
        const rel = relative(ROOT, f)
        const src = readFileSync(f, "utf8")
        if (/\btransition-all\b|transition:\s*all\b/.test(src)) bad.push(`${rel}: transition all`)
        const layout = [
          ...src.matchAll(/transition-\[([^\]]*\b(?:width|height|top|left)\b[^\]]*)\]/g),
          ...src.matchAll(/transition(?:Property)?:\s*["'`][^"'`]*\b(?:width|height|top|left)\b/g),
        ].length
        if (layout > (ALLOW[rel] ?? 0)) bad.push(`${rel}: ${layout} layout transition(s)`)
      }
    }
    expect(bad).toEqual([])
  })
})
