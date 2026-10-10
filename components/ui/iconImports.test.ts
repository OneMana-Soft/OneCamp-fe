import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve, relative } from "node:path"

/**
 * ICON RULE: icons come from @/lib/icons, one Lucide registry, drawn at a 1.5
 * stroke (globals.css sets it for every icon left at Lucide's default).
 *
 * A file that imports a glyph straight from lucide-react skips the registry,
 * which is how one meaning ends up with two glyphs on two screens and how a
 * second icon family could slip in unnoticed. Types (LucideIcon, LucideProps)
 * are fine from the package. This counts the files that import glyphs
 * directly; it may fall freely and must not rise. Move a file to @/lib/icons
 * and lower the number.
 */
const root = resolve(__dirname, "../..")
/** 59 recorded before wave 2, 51 when wave 2 was merged, 50 after its QA pass. */
const DIRECT_GLYPH_IMPORT_BASELINE = 50

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (/\.(tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const TYPE_NAMES = new Set(["LucideIcon", "LucideProps", "IconNode"])

function importsGlyphs(src: string): boolean {
  const re = /import\s+(type\s+)?(\*\s+as\s+\w+|\w+|\{([^}]*)\})\s+from\s+["']lucide-react["']/g
  for (const m of src.matchAll(re)) {
    if (m[1]) continue
    if (!m[3]) return true
    const names = m[3].split(",").map((n) => n.trim()).filter(Boolean)
    if (names.some((n) => !n.startsWith("type ") && !TYPE_NAMES.has(n.split(/\s+as\s+/)[0]))) return true
  }
  return false
}

describe("icon imports", () => {
  it("does not add direct glyph imports from lucide-react outside the registry", () => {
    const dirs = ["components", "app", "hooks", "lib", "context", "store"].map((d) => resolve(root, d))
    const offenders = dirs
      .flatMap((d) => walk(d))
      .filter((f) => !f.endsWith("lib/icons.ts"))
      .filter((f) => importsGlyphs(readFileSync(f, "utf8")))
      .map((f) => relative(root, f))
    expect(
      offenders.length,
      `direct lucide-react glyph imports went up (${offenders.length} > ${DIRECT_GLYPH_IMPORT_BASELINE}); import from @/lib/icons instead`,
    ).toBeLessThanOrEqual(DIRECT_GLYPH_IMPORT_BASELINE)
  })

  it("makes 1.5 the stroke for every icon left at Lucide's default", () => {
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
    expect(css).toMatch(/svg\.lucide\[stroke-width="2"\]\s*\{\s*stroke-width:\s*1\.5;/)
  })
})
