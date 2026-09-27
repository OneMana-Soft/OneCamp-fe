import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Fluidity rules from the Vercel Web Interface Guidelines, held by tests.
 *
 * WHY. An audit found 87 `transition-all` (it animates layout properties, so a
 * hover or state change can trigger reflow jank), 145 three-dot ellipses in
 * copy, no global reduced-motion fallback, no `touch-action: manipulation`
 * (a tap waited for a possible double-tap zoom) and no `color-scheme` (dark
 * mode kept light scrollbars). Each was fixed; these keep it that way.
 */

const ROOT = process.cwd()
function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, ext, out)
    else if (ext.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}
const TSX = ["app", "components"].flatMap((d) => files(join(ROOT, d), /\.tsx$/))

describe("fluid interface", () => {
  it("never transitions all properties", () => {
    const found = TSX.filter((f) => /\btransition-all\b/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f))
    expect(found).toEqual([])
  })

  it("keeps the global motion, tap and colour-scheme rules", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*transition-duration:\s*0\.01ms/)
    expect(css).toMatch(/touch-action:\s*manipulation/)
    expect(css).toMatch(/\.dark\s*\{\s*color-scheme:\s*dark/)
  })

  it("writes an ellipsis as one character in anything a person reads", () => {
    const RE = /[\p{L}\p{N})\]]\.\.\.(?=[\s"'`<)]|$)/u
    const found: string[] = []
    for (const f of [...TSX, ...["hooks", "lib", "services"].flatMap((d) => files(join(ROOT, d), /\.tsx?$/))]) {
      const src = readFileSync(f, "utf8")
      if (!src.includes("...")) continue
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (n: ts.Node) => {
        if ((ts.isJsxText(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && RE.test(n.getText(sf))) {
          found.push(`${relative(ROOT, f)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    expect(found).toEqual([])
  })
})
