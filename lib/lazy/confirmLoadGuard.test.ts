import { existsSync, readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { importedCalls, lineOf, literalText, parseSource, specPath } from "@/lib/testing/importedCalls"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * THE SHARED CONFIRM LOADS THROUGH lazyDialog (V-978, 13 Nov 2026).
 *
 * The confirm (components/dialog/confirmAlertDialog) was loaded with raw
 * next/dynamic in the app's UI manager and on the invoice page. Its first
 * press drew nothing until its code came, and when the code couldn't come (a
 * dropped connection, not a new build: lib/chunkRecovery reloads only then)
 * the failure went to the nearest error boundary. On /invoice that is
 * app/global-error, so the whole invoice went, and the opener stayed dead for
 * the visit. lib/lazy/lazyDialog says so in a toast, keeps the page, and asks
 * again on the next open, so a lazy confirm takes it.
 */

const DIRS = ["app", "components", "context", "hooks", "lib", "services", "store"]
const CONFIRM = "components/dialog/confirmAlertDialog"

/**
 * Each import() of the confirm that isn't lazyDialog's own first argument, as
 * "file:line": every other way in fails, by whatever shape it takes (CR-311
 * F1: a loader passed by name to next/dynamic, next/dynamic imported as
 * { default as } or * as, a template-literal path). A loader passed by name
 * is lazyDialog's when it's declared in the file and passed to nothing else.
 */
export function confirmNotThroughLazyDialog(sources: Record<string, string>): string[] {
  const found: string[] = []
  for (const [file, src] of Object.entries(sources)) {
    if (!src.includes("confirmAlertDialog")) continue
    const sf = parseSource(file, src)
    const loads: ts.CallExpression[] = []
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && specPath(file, literalText(n.arguments[0]) ?? "") === CONFIRM) loads.push(n)
      ts.forEachChild(n, visit)
    }
    visit(sf)
    if (loads.length === 0) continue
    const calls = importedCalls(sf, "lib/lazy/lazyDialog", "lazyDialog")
    const firsts = new Set<ts.Node>(calls.map((c) => c.call.arguments[0]))
    // Every other mention of the name is its own declaration, and that isn't exported.
    const passedOnlyToLazyDialog = (name: string) => {
      let only = true
      const refs = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === name && !firsts.has(n)) {
          const decl = n.parent
          const own = (ts.isVariableDeclaration(decl) || ts.isFunctionDeclaration(decl)) && decl.name === n
          const statement = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl
          if (!own || (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) only = false
        }
        ts.forEachChild(n, refs)
      }
      refs(sf)
      return only
    }
    const theirs = calls.flatMap((c) => (c.loader && (!c.loaderName || passedOnlyToLazyDialog(c.loaderName)) ? [c.loader] : []))
    for (const load of loads) if (!theirs.some((l) => load.pos >= l.pos && load.end <= l.end)) found.push(lineOf(sf, load))
  }
  return found
}

describe("the shared confirm", () => {
  const files = sourceFiles(DIRS, /\.tsx?$/)

  it("walks the app's source, the confirm among it", () => {
    expect(files.length).toBeGreaterThan(1000)
    expect(existsSync(`${CONFIRM}.tsx`)).toBe(true)
    expect(files).toContain(`${CONFIRM}.tsx`)
  })

  it("is loaded only through lazyDialog: next/dynamic, or any other load, lost the page when its code couldn't come", () => {
    const found = confirmNotThroughLazyDialog(Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")])))
    expect(found, "load it through lib/lazy/lazyDialog").toEqual([])
  })

  it("lets the two real sites be: lazyDialog's own first argument, inline or a loader passed only to it", () => {
    const found = confirmNotThroughLazyDialog({
      "components/ui/UnifiedUIManager.tsx": readFileSync("components/ui/UnifiedUIManager.tsx", "utf8"),
      "app/invoice/[project]/page.tsx": readFileSync("app/invoice/[project]/page.tsx", "utf8"),
      "components/ui/c.tsx": [
        'import dynamic from "next/dynamic"',
        'import { lazyDialog as dialog } from "../../lib/lazy/lazyDialog"',
        "const loadConfirm = () => import(`@/components/dialog/confirmAlertDialog`).then((m) => m.ConfirmAlertDialog)",
        'const D = dynamic(() => import("@/components/dialog/docShareDialog"), { ssr: false })',
        'const C = dialog(loadConfirm, "the confirmation")',
      ].join("\n"),
      "components/d.tsx": 'import type { ConfirmIcon } from "@/components/dialog/confirmAlertDialog"\nimport dynamic from "next/dynamic"\nconst X = dynamic(() => import("@/components/dialog/other"))',
    })
    expect(found).toEqual([])
  })

  it("sees every other way in: inline and by name into next/dynamic, { default as }, * as, a template literal, a relative path, a loader shared or exported", () => {
    const found = confirmNotThroughLazyDialog({
      "app/a/page.tsx": 'import dynamic from "next/dynamic"\nconst C = dynamic(() => import("@/components/dialog/confirmAlertDialog").then((m) => m.ConfirmAlertDialog), { ssr: false })',
      "components/b.tsx": 'import later from "next/dynamic"\n\nconst C = later(\n  () => import("./dialog/confirmAlertDialog.tsx"),\n)',
      // The house's own next/dynamic shape (app/app/board/page.tsx:43): CR-311's probe.
      "components/h.tsx":
        'import dynamic from "next/dynamic"\nconst loadConfirm = () => import("@/components/dialog/confirmAlertDialog").then((m) => m.ConfirmAlertDialog)\nconst C = dynamic(loadConfirm, { ssr: false })',
      "components/n.tsx": 'import { default as dyn } from "next/dynamic"\nconst C = dyn(() => import("@/components/dialog/confirmAlertDialog"))',
      "components/s.tsx": 'import * as next from "next/dynamic"\nconst C = next.default(() => import("@/components/dialog/confirmAlertDialog"))',
      "components/t.tsx": 'import dynamic from "next/dynamic"\nconst C = dynamic(() => import(`@/components/dialog/confirmAlertDialog`))',
      "components/u.tsx": [
        'import dynamic from "next/dynamic"',
        'import { lazyDialog } from "@/lib/lazy/lazyDialog"',
        'const load = () => import("@/components/dialog/confirmAlertDialog").then((m) => m.ConfirmAlertDialog)',
        'const C = lazyDialog(load, "the confirmation")',
        "const D = dynamic(load)",
      ].join("\n"),
      "components/v.tsx": 'import { lazyDialog } from "@/lib/lazy/lazyDialog"\nexport const load = () => import("@/components/dialog/confirmAlertDialog").then((m) => m.ConfirmAlertDialog)\nconst C = lazyDialog(load, "the confirmation")',
      "components/w.tsx": 'import { lazyDialog } from "@/lib/lazy/lazyDialog"\nconst C = lazyDialog(() => Promise.resolve(Other), "x")\nexport const warm = () => import("@/components/dialog/confirmAlertDialog")',
      "lib/e.ts": 'const C = dynamic(() => import("@/components/dialog/confirmAlertDialog"))',
    })
    expect(found).toEqual([
      "app/a/page.tsx:2",
      "components/b.tsx:4",
      "components/h.tsx:2",
      "components/n.tsx:2",
      "components/s.tsx:2",
      "components/t.tsx:2",
      "components/u.tsx:3",
      "components/v.tsx:2",
      "components/w.tsx:3",
      "lib/e.ts:1",
    ])
  })
})
