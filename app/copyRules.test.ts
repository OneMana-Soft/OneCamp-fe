import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { SHORTCUT_GROUPS } from "@/components/docEditor/shortcuts"

/**
 * The copy rules (docs PROGRAM I22, G-COPY), in everything a person reads:
 * no version numbers, and never "compliant", "compliance" or "certified"
 * (say "recorded", "you can check it"). Every string literal, template piece
 * and JSX text in the app's source, and the English messages; comments may
 * say what they like. And the doc's own labels are in sentence case.
 */

const ROOT = process.cwd()
const DIRS = ["app", "components", "hooks", "lib", "services", "store", "context"]
const VERSION = /\bv\d+(?:\.\d+)+\b|\b\d+\.\d+\.\d+\b|\bversion\s+\d/i
const CLAIM = /complian|certified/i
/** SVG path data reads like version numbers ("M12 5.38c1.62…"). */
const PATH_DATA = /^[Mm][\d\s.,+-]/
/** Not shown to anyone: words people search the admin by (lib/adminSections keywords). */
const ALLOWED = new Set(["lib/adminSections.ts: compliance"])

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== "node_modules") sourceFiles(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

/** Copy in one file that breaks the rules, as "file: text". */
export function brokenCopy(file: string, src: string): string[] {
  if (!VERSION.test(src) && !CLAIM.test(src)) return []
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    let text: string | null = null
    if (ts.isJsxText(n)) text = n.text
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    if (text && !PATH_DATA.test(text.trim()) && (VERSION.test(text) || CLAIM.test(text))) {
      const entry = `${relative(ROOT, file)}: ${text.trim().slice(0, 80)}`
      if (!ALLOWED.has(entry)) found.push(entry)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

function brokenMessages(value: unknown, path: string): string[] {
  if (typeof value === "string") return VERSION.test(value) || CLAIM.test(value) ? [`${path}: ${value.slice(0, 80)}`] : []
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => brokenMessages(v, path ? `${path}.${k}` : k))
  return []
}

describe("copy rules", () => {
  it("has no version numbers and claims no compliance, in any copy", () => {
    const found = DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).flatMap((f) => brokenCopy(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })

  it("keeps the English messages to the same rules", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "lib/utils/i18n/locales/en/en.json"), "utf8"))
    expect(brokenMessages(en, "")).toEqual([])
  })

  it("reads strings, not comments, and skips drawing paths", () => {
    const src = ['// compliant in a comment', 'const a = "Now compliant"', 'const b = <p>New in v2.3</p>', 'const d = "M12 5.38c1.62 0 3.06.56"'].join("\n")
    expect(brokenCopy(join(ROOT, "x.tsx"), src)).toEqual(["x.tsx: Now compliant", "x.tsx: New in v2.3"])
  })

  it("writes the doc's shortcut labels in sentence case", () => {
    const proper = new Set(["AI", "OneCamp", "Markdown"])
    for (const row of SHORTCUT_GROUPS.flatMap((g) => g.rows)) {
      const [first, ...rest] = row.label.split(" ")
      expect(first[0], row.label).toBe(first[0].toUpperCase())
      for (const w of rest) if (!proper.has(w)) expect(w, row.label).toBe(w.toLowerCase())
    }
  })
})
