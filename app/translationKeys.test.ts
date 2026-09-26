import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * A translation key must go through t(), never onto the screen.
 *
 * WHY. The task board's toolbar read "createTask", "priorities" and "view",
 * and its filters "clearFilters", "noResultFound" and
 * "searchMemberPlaceholder": in ten components someone had removed the t from
 * t('createTask') and left ('createTask'), which renders the key itself. It
 * type-checks and nothing fails, so this looks for it.
 *
 * WHAT COUNTS. A string written straight into what renders as text: a JSX
 * child, {'x'} or {('x')}, or a visible attribute (placeholder, title, label,
 * aria-label, alt). It counts when it is a key in the English messages with
 * different English, or shaped like a key (camelCase, no spaces). Other props
 * are left alone: titleKey="docComment" names an entry in a local map.
 */

const ROOT = process.cwd()
const DIRS = ["app", "components"]
const en = JSON.parse(readFileSync(join(ROOT, "lib/utils/i18n/locales/en/en.json"), "utf8")) as Record<string, unknown>
const KEY_SHAPE = /^[a-z]+[A-Z][A-Za-z0-9]*$/
const VISIBLE_ATTRS = new Set(["placeholder", "title", "label", "aria-label", "alt"])

function tsxFiles(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(tsxFiles(p))
    else if (e.name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

function looksLikeAKey(text: string): boolean {
  const english = en[text]
  return (typeof english === "string" && english !== text) || KEY_SHAPE.test(text)
}

/** Keys rendered raw in one file, as "file:line: key". */
export function rawKeys(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    const rendered =
      ts.isJsxExpression(n) &&
      (ts.isJsxElement(n.parent) ||
        ts.isJsxFragment(n.parent) ||
        (ts.isJsxAttribute(n.parent) && VISIBLE_ATTRS.has(n.parent.name.getText(sf))))
    if (rendered && n.expression) {
      let e: ts.Expression = n.expression
      while (ts.isParenthesizedExpression(e)) e = e.expression
      if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && looksLikeAKey(e.text)) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        found.push(`${relative(ROOT, file)}:${line}: ${e.text}`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe("translation keys", () => {
  it("are never rendered as text", () => {
    const found = DIRS.flatMap((d) => tsxFiles(join(ROOT, d))).flatMap((f) => rawKeys(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })

  it("catches a key in parentheses or an attribute, and leaves real copy alone", () => {
    const src = [
      "const a = <b>{('createTask')}</b>",
      "const b = <i placeholder={'searchMemberPlaceholder'} />",
      'const c = <p>{" "}{"Start"}{t("createTask")}</p>',
      'const d = <RightPanelHeader titleKey={"docComment"} />',
    ].join("\n")
    expect(rawKeys(join(ROOT, "x.tsx"), src).map((s) => s.split(": ")[1])).toEqual(["createTask", "searchMemberPlaceholder"])
  })
})
