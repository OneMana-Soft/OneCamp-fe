import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * EVERY CHUNK WAITS IN ITS OWN ROOM (V-39, 28 Oct 2026).
 *
 * next/dynamic (Next 16.3.8, shared/lib/lazy-dynamic/loadable) puts its
 * component inside a Suspense boundary of its own only when it's given
 * `ssr: false` or a `loading`. A bare one suspends to the nearest boundary
 * above it the first time it's drawn: a dialog that mounts as it opens sent
 * the page back to its route's loading skeleton until the dialog's chunk
 * landed, and a panel of the shell (the right panel's bodies, a thread) held
 * up the shell around it. What loads on demand is a lazyPart, and a dialog a
 * lazyDialog (lib/lazy): neither suspends, and each says so in its place
 * when its code can't come. next/dynamic stays where it has a boundary of its
 * own. The baseline is none, and stays so.
 */

const DIRS = ["app", "components", "hooks", "lib"]

/** Whether next/dynamic's options give it a boundary of its own: `ssr: false`, or a `loading`. */
function ownBoundary(options: ts.Expression | undefined): boolean {
  if (!options || !ts.isObjectLiteralExpression(options)) return false
  return options.properties.some((p) => {
    const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : ""
    if (name === "loading") return true
    return name === "ssr" && ts.isPropertyAssignment(p) && p.initializer.kind === ts.SyntaxKind.FalseKeyword
  })
}

/** Each next/dynamic call, under whatever name it's imported as, with no boundary of its own: "file:line". */
function bareCalls(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set<string>()
  for (const s of sf.statements)
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "next/dynamic" && s.importClause?.name) names.add(s.importClause.name.text)
  if (names.size === 0) return []
  const bare: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text) && !ownBoundary(n.arguments[1]))
      bare.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return bare
}

describe("every next/dynamic call has a boundary of its own", () => {
  it("gives each one ssr: false or a loading; what loads on demand is a lazyPart or a lazyDialog", () => {
    const bare = sourceFiles(DIRS, /\.tsx?$/).flatMap((f) => bareCalls(f, readFileSync(f, "utf8")))
    expect(bare, "next/dynamic with no boundary of its own suspends the page around it as it first draws: use lib/lazy's lazyPart or lazyDialog").toEqual([])
  })

  it("finds a bare call under any name, and passes one with a boundary of its own", () => {
    const text = [
      `import later from "next/dynamic"`,
      `const A = later(() => import("./a"))`,
      `const B = later(() => import("./b"), { ssr: false })`,
      `const C = later(() => import("./c"), { loading: () => null })`,
      `const D = later(() => import("./d"), { ssr: true })`,
    ].join("\n")
    expect(bareCalls("x.tsx", text)).toEqual(["x.tsx:2", "x.tsx:5"])
  })
})
