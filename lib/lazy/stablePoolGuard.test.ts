import { existsSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * A STABLE POOL HAS ONE LAZY GROUP (V-1172, FLUIDITY-42-B43, 17 Nov 2026).
 *
 * scripts/fluidity/stable-pools.json lists modules whose lazy code is hundreds
 * of small parts that Turbopack merges greedily by size (the task panel). An
 * import() of one inside next/dynamic's dynamic(() => import(…)) is a
 * "next/dynamic entry": a lazy group of its own, merged on its own, whose chunks
 * hold the same modules again and re-pair when the module changes by a few
 * bytes (V-1099 cost 43 module copies, +14,382 gz, through SplitPane's). So a
 * listed module is loaded by a plain import(), named outside dynamic() when
 * dynamic() draws it, and every loader shares one group. The build-level check
 * is knownresplit.mjs's P (poolguard.mjs); this one fails before a build.
 */

const DIRS = ["app", "components", "hooks", "lib"]
const POOLS = JSON.parse(readFileSync("scripts/fluidity/stable-pools.json", "utf8")) as { pools: { source: string; why: string }[] }

/** A specifier as a repo file among `known`: "@/x" from the root, "./x" from the importer, with the usual endings. */
function resolve(known: Set<string>, from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null
  if (base === null) return null
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((f) => known.has(f)) ?? null
}

/** Each import() of a listed module written inside a next/dynamic call: "file:line -> module". */
export function dynamicEntries(sources: Record<string, string>, pooled: Set<string>): string[] {
  const known = new Set(Object.keys(sources))
  const found: string[] = []
  for (const [file, src] of Object.entries(sources)) {
    if (!src.includes("next/dynamic")) continue
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    // next/dynamic's default import, under whatever name the file gives it.
    const names = new Set<string>()
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "next/dynamic" && s.importClause?.name) names.add(s.importClause.name.text)
    }
    if (!names.size) continue
    const loads = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        const target = resolve(known, file, n.arguments[0].text)
        if (target && pooled.has(target)) found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} -> ${target}`)
      }
      ts.forEachChild(n, loads)
    }
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text) && n.arguments[0]) loads(n.arguments[0])
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return found
}

describe("a stable pool (scripts/fluidity/stable-pools.json)", () => {
  const pooled = new Set(POOLS.pools.map((p) => p.source))

  it("lists modules that exist, each with its reason", () => {
    expect(POOLS.pools.length).toBeGreaterThan(0)
    for (const p of POOLS.pools) {
      expect(existsSync(p.source), p.source).toBe(true)
      expect(p.why.length, p.source).toBeGreaterThan(20)
    }
  })

  it("is never a next/dynamic entry: name its import() outside dynamic(), as components/split/SplitPane does", () => {
    const sources = Object.fromEntries(sourceFiles(DIRS, /\.tsx?$/).map((f) => [f, readFileSync(f, "utf8")]))
    expect(dynamicEntries(sources, pooled), "a next/dynamic entry is a lazy group of its own (V-1172)").toEqual([])
  })

  it("finds an inline import() under any name for dynamic, and passes one named outside it", () => {
    const known = { "components/x/Panel.tsx": "export default function Panel() { return null }" }
    const at = (src: string) => dynamicEntries({ ...known, "components/y/Host.tsx": src }, new Set(["components/x/Panel.tsx"]))
    expect(at(`import dynamic from "next/dynamic"\nconst P = dynamic(() => import("@/components/x/Panel"), { loading: () => null })`)).toEqual([
      "components/y/Host.tsx:2 -> components/x/Panel.tsx",
    ])
    expect(at(`import later from "next/dynamic"\nconst P = later(() => import("../x/Panel").then((m) => m.default))`)).toEqual(["components/y/Host.tsx:2 -> components/x/Panel.tsx"])
    expect(at(`import dynamic from "next/dynamic"\nconst load = () => import("@/components/x/Panel")\nconst P = dynamic(load)`)).toEqual([])
    expect(at(`import dynamic from "next/dynamic"\nconst P = dynamic(() => import("@/components/x/Other"))`)).toEqual([])
  })
})
