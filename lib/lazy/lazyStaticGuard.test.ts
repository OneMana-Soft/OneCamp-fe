import { readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * A LAZY MODULE HAS ONE WAY IN (FLUIDITY-16, 6 Nov 2026).
 *
 * A module loaded through lazyChunk or lazyPiece gets a chunk of its own. A
 * static import of it anywhere else puts its code in that importer's chunk
 * too, so a page that meets both downloads it twice. The tooltip's Radix side
 * (components/ui/tooltipBridge, 3.7 KB gzip) is fetched on idle for every
 * page, and components/ui/disabledTip imported it statically: each of
 * disabledTip's two chunks (6.8 and 7.0 KB) carried it again, and a reader who
 * met a disabled reason and a tooltip fetched it twice. A type-only import
 * carries no code, so it passes; anything else takes the module the way its
 * loader does (disabledTip takes the chip through the tooltip's own chunk).
 *
 * The baseline is what beta already had when this guard came (origin/beta
 * 654410293), plus two that came with the calendar heads (beta 2bf8fbacf, wL37:
 * fileChips, filesRow). It only shrinks: a new pair fails, and a pair that has gone
 * must leave the list. V-656 tracks emptying it.
 */

const DIRS = ["app", "components", "hooks", "lib"]
const LOADERS = new Set(["lazyChunk", "lazyPiece"])

/** Beta's own pairs, "importer -> lazy module", each loaded lazily elsewhere. */
const BASELINE = new Set([
  "app/app/doc/trash/page.tsx -> components/doc/RestoreRow.tsx",
  "app/app/tables/[table-id]/page.tsx -> components/table/DataTableGrid.tsx",
  "components/admin/SlackImportErrorsDialog.tsx -> components/admin/ImportErrorsDialog.tsx",
  "components/auth/ProviderButtons.tsx -> components/ui/graphics/GoogleMark.tsx",
  "components/board/boardCard.tsx -> components/board/boardEmbeds.tsx",
  "components/board/boardCodeBlock.tsx -> components/board/boardEmbeds.tsx",
  "components/calendar/calendarsPopover.tsx -> components/ui/graphics/GoogleMark.tsx",
  "components/calendar/eventPopover.tsx -> components/ui/graphics/GoogleMark.tsx",
  "components/calendar/fileChips.tsx -> components/liveEntity/EntityChip.tsx",
  "components/calendar/form/filesRow.tsx -> components/docFiles/uploads.ts",
  "components/docComments/CommentsOverlay.tsx -> components/minimal-tiptap/components/bubble-menu/bubble-menu.tsx",
  "components/docEditor/DocIconPicker.tsx -> components/docEditor/chrome/glyphs.tsx",
  "components/docEditor/TrashedBanner.tsx -> components/docEditor/chrome/CoverArt.tsx",
  "components/docFiles/ReplaceVersionDialog.tsx -> components/docFiles/uploads.ts",
  "components/docTree/PagesSheet.tsx -> components/docTree/DocsTreeGroups.tsx",
  "components/drawers/calendarOptionsDrawer.tsx -> components/ui/graphics/GoogleMark.tsx",
  "components/guest/guestReact.tsx -> components/board/boardReact.tsx",
  "components/kanbanComponents/Container/Container.tsx -> components/task/TaskTypeGlyph.tsx",
  "components/livekit/CallGuestBoardStage.tsx -> components/guest/GuestBoardViewer.tsx",
  "components/project/ProjectKeyTypesDialog.tsx -> components/task/TaskTypeGlyph.tsx",
  "components/table/TableMenus.tsx -> components/table/tablePalette.ts",
  "components/table/views/TableViews.tsx -> components/table/tablePalette.ts",
  "components/task/QuietEditor.tsx -> components/minimal-tiptap/components/bubble-menu/bubble-menu.tsx",
  "components/task/TaskTemplatesManager.tsx -> components/task/TaskTypeGlyph.tsx",
  "components/task/TaskTypeField.tsx -> components/task/TaskTypeGlyph.tsx",
  "components/task/taskTemplateParts.tsx -> components/task/TaskTypeGlyph.tsx",
  "components/work/backlog/BacklogRow.tsx -> components/task/TaskTypeGlyph.tsx",
  "lib/work/taskTemplateDraft.ts -> lib/tasks/fieldInput.ts",
])

/** A specifier as a repo file among `known`: "@/x" from the root, "./x" from the importer, with the usual endings. */
function resolve(known: Set<string>, from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null
  if (base === null) return null
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((f) => known.has(f)) ?? null
}

/** An import or export-from that carries code: not `import type`, not one whose every name is a type. */
function carriesCode(s: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(s)) return !s.isTypeOnly
  const clause = s.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  const names = clause.namedBindings
  return !!clause.name || !names || ts.isNamespaceImport(names) || names.elements.length === 0 || names.elements.some((e) => !e.isTypeOnly)
}

/** Each static import of a module that lazyChunk or lazyPiece loads, as "importer -> module" with where both are. */
export function lazyTakenStatically(sources: Record<string, string>): Array<{ pair: string; at: string; lazyAt: string }> {
  const known = new Set(Object.keys(sources))
  const lazy = new Map<string, string>()
  const imports: Array<{ file: string; line: number; target: string }> = []
  for (const [file, src] of Object.entries(sources)) {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const loads = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        const target = resolve(known, file, n.arguments[0].text)
        if (target && !lazy.has(target)) lazy.set(target, `${file}:${lineOf(n)}`)
      }
      ts.forEachChild(n, loads)
    }
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && LOADERS.has(n.expression.text) && n.arguments[0] && ts.isArrowFunction(n.arguments[0]))
        loads(n.arguments[0].body)
      ts.forEachChild(n, visit)
    }
    visit(sf)
    for (const s of sf.statements) {
      if (!(ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) || !s.moduleSpecifier || !ts.isStringLiteral(s.moduleSpecifier) || !carriesCode(s)) continue
      const target = resolve(known, file, s.moduleSpecifier.text)
      if (target) imports.push({ file, line: lineOf(s), target })
    }
  }
  return imports
    .filter(({ target }) => lazy.has(target))
    .map(({ file, line, target }) => ({ pair: `${file} -> ${target}`, at: `${file}:${line}`, lazyAt: lazy.get(target)! }))
}

describe("a module loaded lazily", () => {
  const found = lazyTakenStatically(Object.fromEntries(sourceFiles(DIRS, /\.tsx?$/).map((f) => [f, readFileSync(f, "utf8")])))

  it("is never imported statically too, which would ship its code twice", () => {
    const fresh = found.filter((f) => !BASELINE.has(f.pair)).map((f) => `${f.at} imports what ${f.lazyAt} loads lazily`)
    expect(fresh, "take it through its loader (or import its types only)").toEqual([])
  })

  it("keeps a baseline that only shrinks: a pair that has gone leaves the list", () => {
    const now = new Set(found.map((f) => f.pair))
    expect([...BASELINE].filter((pair) => !now.has(pair))).toEqual([])
  })

  it("sees a static import and an export-from, and lets type-only imports and other loaders be", () => {
    const pairs = lazyTakenStatically({
      "lib/heavy.ts": "export const heavy = 1\nexport type Heavy = number",
      "lib/other.ts": "export const other = 1",
      "lib/loader.ts": 'const a = lazyChunk(() => import("./heavy"))\nconst b = lazyPiece(() => import("@/lib/other").then((m) => ({ default: m.other })))',
      "components/plain.tsx": 'import { heavy } from "@/lib/heavy"',
      "components/again.ts": 'export { heavy } from "../lib/heavy"',
      "components/bare.ts": 'import "@/lib/other"',
      "components/mixed.ts": 'import { type Heavy, heavy } from "@/lib/heavy"',
      "components/types.ts": 'import type { Heavy } from "@/lib/heavy"\nimport { type Heavy as H } from "@/lib/heavy"\nexport type { Heavy } from "@/lib/heavy"',
      "components/dynamic.ts": 'const x = dynamic(() => import("@/lib/plain"))',
      "lib/plain.ts": "export const plain = 1",
      "components/usesPlain.ts": 'import { plain } from "@/lib/plain"',
    }).map((f) => f.pair)
    expect(pairs.sort()).toEqual([
      "components/again.ts -> lib/heavy.ts",
      "components/bare.ts -> lib/other.ts",
      "components/mixed.ts -> lib/heavy.ts",
      "components/plain.tsx -> lib/heavy.ts",
    ])
  })
})
