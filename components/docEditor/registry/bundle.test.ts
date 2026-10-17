import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// What the registry's entry pulls in with it, followed through every static
// import (a dynamic import() is a chunk of its own, fetched when first used).
// Every editor's host imports the entry, the chat composer's included, so a
// block only a doc carries puts its code behind load(), and a heavy one
// draws itself lazily (I20; PROGRAM.md A1: "the chat composer has no lowlight,
// poll or chart").

const ROOT = path.join(__dirname, '../../..')

const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(from), spec) : null
  if (!base) return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Every file and package a module reaches through static imports. */
function reach(entry: string) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [path.join(ROOT, entry)]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    if (!/\.(tsx?|js)$/.test(file)) continue
    const src = readFileSync(file, 'utf8')
    for (const [, spec] of src.matchAll(STATIC_IMPORT)) {
      const local = resolve(file, spec)
      if (local) queue.push(local)
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec)
    }
  }
  return { files: [...files].map((f) => path.relative(ROOT, f)), packages: [...packages] }
}

describe('the import walker', () => {
  it('sees a static import, and passes over a dynamic one', () => {
    expect(reach('components/minimal-tiptap/extensions/code-block-lowlight/highlighter.ts').packages).toContain('lowlight')
    expect(reach('components/minimal-tiptap/extensions/code-block-lowlight/lazyCodeBlock.ts').packages).not.toContain('lowlight')
  })
})

describe.each([
  ["the registry's entry, as every editor loads it", 'components/docEditor/registry/index.ts'],
  ['the chat composer', 'components/textInput/textInput.tsx'],
  ["a task's description", 'components/task/QuietEditor.tsx'],
])('%s', (_name, entry) => {
  const { files, packages } = reach(entry)

  it('reaches the built-in blocks and actions', () => {
    expect(files).toContain('components/minimal-tiptap/blocks/text.ts')
    expect(files).toContain('components/docEditor/actions/doc.ts')
  })

  it('carries no code highlighting, no poll, chart, diff or recording view', () => {
    expect(packages.filter((p) => /^(lowlight|highlight\.js)/.test(p))).toEqual([])
    expect(packages).not.toContain('@tiptap/extension-code-block-lowlight')
    expect(files.filter((f) => /(poll-view|chart-embed-view|diff-embed-view|recording-embed-view|components\/charts\/)/.test(f))).toEqual([])
  })

  it('carries none of what only a doc has', () => {
    expect(packages.filter((p) => /^@tiptap\/extension-task-(list|item)$/.test(p))).toEqual([])
    // The doc keymap's storage accessor (doc-keymap/storage.ts) is the one part a shared bubble reads.
    const docOnly = /extensions\/(callout|collapsible|table-embed|block-handle|click-to-create-block)\/|doc-keymap\/(docKeymap|docInputRules)|clipboard-markdown\/clipboardMarkdown|blocks\/docOnly/
    expect(files.filter((f) => docOnly.test(f))).toEqual([])
  })
})

// A doc's own blocks load with its first editor; an embedded table's grid
// (DataTableGrid, its cells, menus and virtual rows, about 38 KB gzip) loads
// with the first table a doc embeds (table-embed-view.tsx), so a doc with
// none never carries it (routeKbOverHome, scripts/fluidity/doc-budgets.json).
describe("a doc's own blocks", () => {
  const { files, packages } = reach("components/minimal-tiptap/blocks/docOnly.ts")
  it("carry the table embed's view, and none of the grid it draws", () => {
    expect(files).toContain("components/minimal-tiptap/extensions/table-embed/components/table-embed-view.tsx")
    expect(files.filter((f) => /components\/table\/(DataTableGrid|gridCells|ColumnMenu|RelationCell|FormulaEditor|LinkSettings|TableViewFrame)/.test(f))).toEqual([])
    expect(packages.filter((p) => /^@tanstack\/(react-)?virtual/.test(p))).toEqual([])
  })
})
