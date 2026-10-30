import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

/**
 * A select in a Field is named by the Field's label (DESIGN-BUILD-14's M1 and
 * CR-29's MF1, 24 Oct 2026). Field gives its one child its id and the ids that
 * describe it (components/ui/field), and a Select hands them to its trigger
 * (components/ui/select). A SelectTrigger with an id or aria-describedby of its
 * own wins over them, so the label points at nothing: an unnamed combobox, and
 * a phone's sheet with no title. The id goes on the Select instead.
 *
 * Read with TypeScript's parser, in the files that take Field from
 * components/ui/field (a page's own Field may label its control another way).
 */

const ROOT = join(__dirname, "..")
const OWN = new Set(["id", "aria-describedby"])

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) tsxFiles(path, out)
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) out.push(path)
  }
  return out
}

/** Each SelectTrigger inside a Field with an id or aria-describedby of its own, as "file:line". */
function ownIdsInFields(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const takesField = sf.statements.some((s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "@/components/ui/field")
  if (!takesField) return []
  const found: string[] = []
  const visit = (node: ts.Node, inField: boolean) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === "Field") inField = true
    if (inField && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "SelectTrigger") {
      if (node.attributes.properties.some((a) => ts.isJsxAttribute(a) && OWN.has(a.name.getText(sf)))) {
        found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`)
      }
    }
    node.forEachChild((child) => visit(child, inField))
  }
  visit(sf, false)
  return found
}

describe("a select in a Field", () => {
  it("takes its id on the Select, never one of the trigger's own", () => {
    const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))]
    expect(files.flatMap((f) => ownIdsInFields(relative(ROOT, f), readFileSync(f, "utf8")))).toEqual([])
  })

  it("would see one, and only in a Field from components/ui/field", () => {
    const src = [
      'import { Field } from "@/components/ui/field"',
      'export const A = () => <Field label="Channel"><Select><SelectTrigger id="ch" /></Select></Field>',
      'export const B = () => <Field label="Kind"><Select id="kind"><SelectTrigger aria-label="Kind" /></Select></Field>',
      'export const C = () => <Select><SelectTrigger id="free" /></Select>',
    ].join("\n")
    expect(ownIdsInFields("x.tsx", src)).toEqual(["x.tsx:2"])
    expect(ownIdsInFields("y.tsx", src.replace("@/components/ui/field", "./ownField"))).toEqual([])
  })
})
