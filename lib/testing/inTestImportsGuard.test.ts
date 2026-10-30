import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { testFiles } from "@/lib/testing/sourceFiles"
import { resolve, sourceBytes, walk } from "../../scripts/fluidity/reach.mjs"

// V-61: an import() that runs inside a test (in its body, or in a helper the
// test calls) makes that test pay, inside its 5 s, for transforming whatever
// the module brings that its file hasn't loaded yet. Under a gate's load that
// crossed 5 s: glanceExact took 2.6-2.8 s alone and failed at load ~38, and
// took ~93 ms once its imports moved to the top (fac27c9c9). A module imported
// at the top of the file is loaded while the file is collected, when no
// test's clock runs. A file that needs a fresh copy per test (vi.resetModules,
// vi.doMock) loads it once in a beforeAll, so the import inside the test only
// runs it again.

/** Source an import inside a test may bring beyond what its file has loaded: about a tenth of a second alone. */
const MAX_NEW_BYTES = 100_000
const ROOTS = ["app", "components", "context", "hooks", "lib", "services", "store", "types"]

type Where = "test" | "hook" | "mock" | "helper" | "top"

const callName = (call: ts.CallExpression) => {
  const e = call.expression
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? `${e.expression.getText()}.${e.name.text}` : ""
}

/**
 * Where a node runs: a test's body, a hook, a vi.mock factory, another function
 * (a helper a test calls), or while the file is collected (the module, or a
 * describe callback, which runs before any test's clock starts).
 */
function whereOf(node: ts.Node): Where {
  for (let p = node.parent; p; p = p.parent) {
    if (!ts.isCallExpression(p)) continue
    const name = callName(p).replace(/\.(only|skip|each|concurrent|sequential|todo|fails)$/, "")
    if (name === "it" || name === "test") return "test"
    if (/^(before|after)(All|Each)$/.test(name)) return "hook"
    if (name === "vi.mock" || name === "vi.doMock") return "mock"
    if (name === "describe") return "top"
  }
  for (let p = node.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return "helper"
  return "top"
}

/** Every import("...") with a literal path in a test file, with where it runs and its line. */
function importsIn(file: string, text: string): Array<{ spec: string; where: Where; line: number }> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: Array<{ spec: string; where: Where; line: number }> = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
      found.push({ spec: node.arguments[0].text, where: whereOf(node), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** The imports inside tests that bring more than MAX_NEW_BYTES of source their file hasn't loaded, as "file:line ...". */
function heavyInTestImports(files: string[]): string[] {
  const over: string[] = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    if (!text.includes("import(")) continue
    const found = importsIn(file, text)
    const late = found.filter((i) => i.where === "test" || i.where === "helper")
    if (!late.length) continue
    // Loaded before any test's clock: the file's static imports, and what its module scope, describes and hooks import.
    const early = found.filter((i) => i.where === "top" || i.where === "hook").map((i) => resolve(i.spec, file))
    const loaded = walk([file, ...early.filter((f): f is string => !!f)]).files
    for (const i of late) {
      const target = resolve(i.spec, file)
      if (!target || loaded.has(target)) continue
      const bytes = sourceBytes(new Map([...walk([target]).files].filter(([f]) => !loaded.has(f))))
      if (bytes > MAX_NEW_BYTES) over.push(`${file}:${i.line} import("${i.spec}") brings ${Math.round(bytes / 1000)} KB`)
    }
  }
  return over
}

describe("an import inside a test", () => {
  it("brings at most 100 KB of source its file hasn't loaded: import it at the top, or once in a beforeAll", () => {
    const over = heavyInTestImports(testFiles(ROOTS, /\.test\.tsx?$/))
    expect(over, "import these at the top of the file (vi.mock still applies), or once in a beforeAll where each test needs a fresh copy").toEqual([])
  })
})
