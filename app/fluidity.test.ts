import { readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

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
const TSX = sourceFiles(["app", "components"], /\.tsx$/)

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
    for (const f of [...TSX, ...sourceFiles(["hooks", "lib", "services"], /\.tsx?$/)]) {
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

  // Design v3 (shell §R): navigation stays instant. The one route transition
  // is the sheet content's crossfade, CSS or Web Animations, never a motion
  // library, at most 200ms, and only after a pointer.
  it("keeps route transitions short, library-free and off after a key", () => {
    const src = readFileSync(join(ROOT, "components/ui/PageTransition.tsx"), "utf8")
    expect(src).not.toMatch(/framer-motion|from "motion|AnimatePresence/)
    const ms = Number(src.match(/SHEET_CROSSFADE_MS = (\d+)/)?.[1])
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(200)
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    const fade = css.match(/\.sheet-crossfade\s*\{[^}]*?(\d+)ms/)
    expect(Number(fade?.[1])).toBeLessThanOrEqual(200)
    const shell = ["app/app/LayoutContent.tsx", "components/navigationBar/desktop/desktopNavigationBar.tsx"]
    for (const f of shell) expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/framer-motion|from "motion\//)
  })
})
