import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * No dashes used as punctuation in anything a person reads.
 *
 * WHY. The house style joins clauses with a colon, a comma or parentheses,
 * never an em dash or a spaced double hyphen. A sweep fixed every instance
 * once, and a few crept back in the places a sweep reads least well: text that
 * begins after a JSX expression, a select's placeholder option, a log line.
 * This keeps it fixed.
 *
 * WHAT COUNTS. Every string literal, template piece and JSX text in the app's
 * source, and every value in the English messages. Comments are not read, so
 * they may say what they like. A dash standing alone ("—" in an empty table
 * cell) is a sign for "nothing here", not punctuation, and is allowed.
 */

const ROOT = process.cwd()
const SOURCE_DIRS = ["app", "components", "hooks", "lib", "services", "store", "context"]
const DASH = /—|\s--\s/

function sourceFiles(dir: string): string[] {
  let out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

/** Dashed copy in one file's strings and JSX text, as "file:line: text". */
export function dashedCopy(file: string, src: string): string[] {
  if (!DASH.test(src)) return []
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    let text: string | null = null
    if (ts.isJsxText(n)) text = n.text
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    if (text !== null && text.trim() !== "—" && DASH.test(text)) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
      found.push(`${relative(ROOT, file)}:${line}: ${text.trim().slice(0, 100)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

function dashedMessages(value: unknown, path: string): string[] {
  if (typeof value === "string") return DASH.test(value) ? [`${path}: ${value.slice(0, 100)}`] : []
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => dashedMessages(v, path ? `${path}.${k}` : k))
  }
  return []
}

describe("visible copy", () => {
  it("uses no em dash or spaced double hyphen as punctuation", () => {
    const found = SOURCE_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).flatMap((f) =>
      dashedCopy(f, readFileSync(f, "utf8")),
    )
    expect(found).toEqual([])
  })

  it("keeps the English messages free of them too", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "lib/utils/i18n/locales/en/en.json"), "utf8"))
    expect(dashedMessages(en, "")).toEqual([])
  })

  it("reads strings and JSX text, not comments, and allows a lone dash for an empty value", () => {
    const src = [
      "// a comment — is not copy",
      'const a = "fine: this is copy"',
      'const empty = <td>—</td>',
      'const bad = <p>{n} — slower</p>',
      "const t = `x ${y} — z`",
      'const flag = "run it -- now"',
    ].join("\n")
    expect(dashedCopy(join(ROOT, "x.tsx"), src).map((s) => s.split(": ")[0])).toEqual(["x.tsx:4", "x.tsx:5", "x.tsx:6"])
  })
})
