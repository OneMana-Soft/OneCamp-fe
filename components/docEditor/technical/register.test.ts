import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import "@/components/docEditor/registry"
import { actionById, allActions, allBlocks, blocksFor } from "@/components/docEditor/registry/registry"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS } from "@/components/docEditor/registry/manifest"
import { shortcutRowsFor } from "@/components/docEditor/registry/shortcuts"
import { slashItemsFor, turnIntoFor } from "@/components/docEditor/registry/readers"

// B3's registration (docs programme B3, I20): what every editor's host loads
// with the registry is only the schema and the shortcuts' rows; the blocks
// load with a doc's editor, and KaTeX, Mermaid, the table's editing, the
// find bar and the menus on first use. The chat composer and a task's
// description get none of it.

const ROOT = path.join(__dirname, "../../..")
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm

function reach(entry: string) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [path.join(ROOT, entry)]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    if (!/\.(tsx?|js)$/.test(file)) continue
    for (const [, spec] of readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
      const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(file), spec) : null
      const local = base && [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts")].find((c) => existsSync(c) && statSync(c).isFile())
      if (local) queue.push(local)
      else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec)
    }
  }
  return { files: [...files].map((f) => path.relative(ROOT, f)), packages: [...packages] }
}

beforeAll(async () => {
  for (const kind of ["doc", "chat", "task"] as const) await loadBlocks(kind, ALL_EDITIONS)
}, 30_000)

describe("what every editor loads with the registry", () => {
  const { files, packages } = reach("components/docEditor/registry/index.ts")

  it("reaches B3's registration and nothing heavy behind it", () => {
    expect(files).toContain("components/docEditor/technical/register.ts")
    expect(packages.filter((p) => /^(katex|mermaid|highlight\.js|lowlight|@tiptap\/pm\/tables|prosemirror-tables|dompurify)/.test(p))).toEqual([])
    const lazy = /technical\/(blocks|floating|LanguagePicker)|simple-table\/|extensions\/math\/|find-replace\/|FindBar|SelectionCount|code-block-view|docCodeBlock|highlighter|mermaid/
    expect(files.filter((f) => lazy.test(f))).toEqual([])
  })

  it("loads the table's editing, KaTeX and Mermaid only behind a doc's own chunk", () => {
    const docChunk = reach("components/docEditor/technical/blocks.ts")
    expect(docChunk.packages.filter((p) => /^(katex|mermaid|@tiptap\/pm\/tables|highlight\.js)/.test(p))).toEqual([])
    expect(docChunk.files.filter((f) => /tableEditing|TableMenu|toDatabase|MathEditor|math\/katex|code-block-lowlight\/mermaid|FindBar/.test(f))).toEqual([])
  })
})

describe("B3's blocks", () => {
  it("are a doc's (and its guest's): the composer and a task keep the plain code block", () => {
    for (const kind of ["doc", "guest"] as const) {
      const ids = blocksFor(kind, ALL_EDITIONS).map((s) => s.id)
      expect(ids, kind).toEqual(expect.arrayContaining(["docCodeBlock", "simpleTable", "math", "technicalMenus"]))
      expect(ids, kind).not.toContain("codeBlock")
    }
    for (const kind of ["chat", "task"] as const) {
      const ids = blocksFor(kind, ALL_EDITIONS).map((s) => s.id)
      expect(ids, kind).toContain("codeBlock")
      expect(ids.filter((id) => ["docCodeBlock", "simpleTable", "math", "technicalMenus"].includes(id)), kind).toEqual([])
    }
  })

  it("are offered by a doc's \"/\", in Basic and Advanced, and never by the composer's", () => {
    const doc = slashItemsFor("doc", { ai: false })
    const where = (id: string) => doc.find((i) => i.id === id)?.section
    expect([where("simpleTable"), where("blockMath"), where("inlineMath"), where("wordCount")]).toEqual(["Basic", "Advanced", "Advanced", "Advanced"])
    expect(doc.find((i) => i.id === "codeBlock")?.title).toBe("Code block")
    expect(slashItemsFor("chat", { ai: false }).map((i) => i.id)).not.toContain("simpleTable")
  })

  it("turn a line into a block equation, after Code", () => {
    const ids = turnIntoFor({ ai: false }).map((t) => t.id)
    expect(ids.indexOf("blockMath")).toBe(ids.indexOf("code") + 1)
  })

  it("list their keys in the shortcuts dialog", () => {
    const rows = shortcutRowsFor("doc", { ai: false })
    const row = (label: string) => rows.find((r) => r.label === label)
    expect(row("Next or previous cell")).toEqual(expect.objectContaining({ keys: "Tab", alt: ["Shift-Tab"], group: "Blocks" }))
    expect(row("Inline equation")).toEqual(expect.objectContaining({ keys: "Mod-Shift-e", typed: ["$x$"], group: "Text" }))
    expect(row("Block equation")).toEqual(expect.objectContaining({ typed: ["$$"], group: "Blocks" }))
    expect(row("Replace, while finding")).toEqual(expect.objectContaining({ keys: "Mod-Shift-h", group: "Doc" }))
    expect(row("Find in the doc")).toEqual(expect.objectContaining({ keys: "Mod-f", group: "Doc" }))
  })

  it("are in every edition, AI or not", () => {
    const mine = /^(docCodeBlock|simpleTable|math|technicalMenus)$/
    expect(allBlocks().filter((s) => mine.test(s.id)).every((s) => s.edition === "both")).toBe(true)
    expect(allActions().filter((a) => /^(find|code|math|table)\./.test(a.id)).every((a) => a.edition === "both")).toBe(true)
    expect(actionById("find.open", { ai: false })?.surfaces).toEqual(["more", "palette", "phoneSheet"])
  })
})
