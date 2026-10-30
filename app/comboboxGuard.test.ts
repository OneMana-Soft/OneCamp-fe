import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// One combobox (SHADCN-AUDIT SA-3): a list to pick from, with a filter, is
// components/ui/combobox. Pickers were hand-built from a Popover and cmdk,
// each with its own width (200 to 256px and the field's), elevation (e3 or a
// dialog's e4), filter height, list height, empty line and check, three of
// them copies of one another; and the field-like ones called themselves a
// combobox on a button the shared field now draws.
//
// cmdk's root (<Command>, from components/ui/command or cmdk) is drawn in
// components/ui only: the combobox and the command palette. The lists still
// drawn by hand are listed below, with how many each draws, and the list may
// only shrink: a list moved onto the combobox takes its line out. And no list
// drawn by hand calls itself a combobox (role="combobox"): a field that picks
// is ComboboxField. That rule's baseline is none.

const ROOT = join(__dirname, "..")
const DIRS = ["app", "components", "hooks", "lib", "context", "store"]
const OWN = "components/ui/"

/** The lists on cmdk still drawn by hand, and how many roots each draws. */
const BASELINE: Record<string, number> = {
  "components/dialog/createProjectDialog.tsx": 1,
  "components/goals/GoalPage.tsx": 1,
  "components/project/ProjectsWorkload.tsx": 1,
  "components/task/BulkTaskBar.tsx": 3,
  "components/task/fieldFilterMenu.tsx": 1,
  "components/task/StatusMenu.tsx": 2,
  "components/task/taskCreateForm.tsx": 2,
  "components/task/TaskDependencies.tsx": 1,
}

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path)
  }
  return out
}

/** The names a file binds to cmdk's root: Command from components/ui/command, or cmdk's own under any name. */
function cmdkRoots(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.importClause?.isTypeOnly) continue
    const from = st.moduleSpecifier.text
    if (from !== "@/components/ui/command" && from !== "cmdk") continue
    const bindings = st.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings))
      for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === "Command") names.add(el.name.text)
  }
  return names
}

/** What a file draws by hand: how many cmdk roots, and where it says role="combobox". */
function handBuilt(file: string, text: string): { roots: number; comboboxRoles: string[] } {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const roots = cmdkRoots(sf)
  let count = 0
  const roles: string[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && roots.has(n.tagName.getText(sf))) count++
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === "role" && n.initializer) {
      const v = ts.isStringLiteral(n.initializer) ? n.initializer.text : ts.isJsxExpression(n.initializer) && n.initializer.expression && ts.isStringLiteral(n.initializer.expression) ? n.initializer.expression.text : ""
      if (v === "combobox") roles.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { roots: count, comboboxRoles: roles }
}

describe("a list to pick from", () => {
  const found = new Map<string, { roots: number; comboboxRoles: string[] }>()
  for (const f of DIRS.flatMap((d) => sources(join(ROOT, d)))) {
    const rel = relative(ROOT, f)
    if (rel.startsWith(OWN)) continue
    const text = readFileSync(f, "utf8")
    if (!text.includes("components/ui/command") && !text.includes('"cmdk"')) continue
    const got = handBuilt(rel, text)
    if (got.roots) found.set(rel, got)
  }

  it("is the combobox: cmdk is drawn by hand only where it still was, and no more", () => {
    const over = [...found].filter(([f, got]) => got.roots > (BASELINE[f] ?? 0)).map(([f, got]) => `${f}: ${got.roots} (allowed ${BASELINE[f] ?? 0})`)
    expect(over, "a list on cmdk drawn by hand: use components/ui/combobox (Combobox, ComboboxContent, ComboboxItem)").toEqual([])
  })

  it("keeps the list of lists still drawn by hand current, so it only shrinks", () => {
    const stale = Object.entries(BASELINE)
      .filter(([f, n]) => (found.get(f)?.roots ?? 0) < n)
      .map(([f, n]) => `${f}: ${found.get(f)?.roots ?? 0} (listed ${n})`)
    expect(stale, "a list moved onto the combobox: lower or remove its line in BASELINE").toEqual([])
  })

  it("never calls a list drawn by hand a combobox: a field that picks is ComboboxField", () => {
    expect([...found.values()].flatMap((got) => got.comboboxRoles)).toEqual([])
  })
})

describe("the rule's reading", () => {
  it("counts cmdk's root under its own name or another, and nothing else of cmdk", () => {
    const ui = `import { Command, CommandInput, CommandItem } from "@/components/ui/command"\nexport const A = () => <Command><CommandInput /><CommandItem value="a" /></Command>`
    expect(handBuilt("components/zz.tsx", ui).roots).toBe(1)
    const raw = `import { Command as CommandPrimitive } from "cmdk"\nexport const A = () => <><CommandPrimitive><CommandPrimitive.List /></CommandPrimitive><CommandPrimitive /></>`
    expect(handBuilt("components/zz.tsx", raw).roots).toBe(2)
    const other = `import { Command } from "@/lib/commands"\nexport const A = () => <Command />`
    expect(handBuilt("components/zz.tsx", other).roots).toBe(0)
    const combobox = `import { ComboboxContent, ComboboxItem } from "@/components/ui/combobox"\nexport const A = () => <ComboboxContent><ComboboxItem value="a" /></ComboboxContent>`
    expect(handBuilt("components/zz.tsx", combobox).roots).toBe(0)
  })

  it("finds a hand-built trigger that calls itself a combobox", () => {
    const code = `import { Command } from "@/components/ui/command"\nexport const A = () => <><button role="combobox" /><div role={"combobox"} /><Command /></>`
    expect(handBuilt("components/zz.tsx", code).comboboxRoles).toEqual(["components/zz.tsx:2", "components/zz.tsx:2"])
  })
})
