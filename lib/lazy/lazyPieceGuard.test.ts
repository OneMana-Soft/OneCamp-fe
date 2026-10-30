import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * NO PLAIN React.lazy (V-64b, S1, 29 Oct 2026).
 *
 * React.lazy throws a chunk that can't come (no network, the device still
 * saying it's online) to the nearest error boundary, and keeps the failure.
 * In the doc editor that boundary is the page's: "Something broke on this
 * page" took the doc's place, Try again threw again, and what was typed lived
 * only in that page's memory. lib/lazy's lazyPiece is React.lazy's place: the
 * same component and Suspense fallback, but a failure stays in the piece's
 * own room and is asked again. Only lib/lazy/lazyPiece.tsx calls React.lazy.
 * The baseline is none, and stays so.
 */

const DIRS = ["app", "components", "hooks", "lib"]
const HOME = "lib/lazy/lazyPiece.tsx"

/** Each React.lazy call, under whatever name it's reached by (React.lazy, lazy, an alias, a namespace): "file:line". */
function plainLazyCalls(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const direct = new Set<string>()
  const spaces = new Set<string>()
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || s.moduleSpecifier.text !== "react") continue
    const clause = s.importClause
    if (clause?.name) spaces.add(clause.name.text)
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) spaces.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings))
      for (const e of bindings.elements) if ((e.propertyName ?? e.name).text === "lazy") direct.add(e.name.text)
  }
  const found: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression
      const plain =
        (ts.isIdentifier(callee) && direct.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "lazy" && ts.isIdentifier(callee.expression) && spaces.has(callee.expression.text))
      if (plain) found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe("no plain React.lazy in the app", () => {
  it("draws every piece fetched on first use through lib/lazy's lazyPiece (or lazyPart, lazyDialog)", () => {
    const plain = sourceFiles(DIRS, /\.tsx?$/)
      .filter((f) => !f.endsWith(HOME) && !/\.test\.tsx?$/.test(f))
      .flatMap((f) => plainLazyCalls(f, readFileSync(f, "utf8")))
    expect(plain, "React.lazy throws a chunk that can't come to the page's error boundary: use lib/lazy's lazyPiece").toEqual([])
  })

  it("finds React.lazy under any name, and leaves other lazies alone", () => {
    const found = (text: string) => plainLazyCalls("x.tsx", text).length
    expect(found(`import React from "react"\nconst A = React.lazy(() => import("./a"))`)).toBe(1)
    expect(found(`import * as R from "react"\nconst A = R.lazy(() => import("./a"))`)).toBe(1)
    expect(found(`import { lazy } from "react"\nconst A = lazy(() => import("./a"))`)).toBe(1)
    expect(found(`import { lazy as later } from "react"\nconst A = later(() => import("./a"))`)).toBe(1)
    expect(found(`import { lazyPiece } from "@/lib/lazy/lazyPiece"\nconst A = lazyPiece(() => import("./a"))`)).toBe(0)
    expect(found(`import { lazy } from "./mine"\nconst A = lazy(() => import("./a"))`)).toBe(0)
  })
})
