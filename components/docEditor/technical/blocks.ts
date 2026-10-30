"use client"

/**
 * The technical blocks a doc's editor is built with (docs programme B3): the
 * doc's code block, the simple table, equations, find's state and keys, and
 * the watch on the selection for the word count. One chunk, fetched when a doc's editor is
 * first built (register.ts); the heavy parts load later still, on first use:
 * lowlight, Mermaid, KaTeX, table editing, find's bar, the chip, the menus.
 *
 * What only a doc's built editor reads is registered here, as the chunk
 * loads, so the doc's first paint carries none of it (I20): the "/" entries
 * and Turn into (read as the editor is built and as its menus open), and the
 * code block's and the equation's actions for the block menu and the
 * palette. The schema and the shortcuts dialog's rows stay in register.ts.
 */

import { Extension, type Editor } from "@tiptap/core"
import { lazyChunk } from "@/lib/loadChunk"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import { Captions, Copy, Code, LetterText, Radical, Sigma, Table2, WrapText } from "@/lib/icons"
import { registerAction, registerBlock } from "@/components/docEditor/registry/registry"
import { DOC_EDITORS } from "@/components/minimal-tiptap/blocks/kinds"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { DocCodeBlock } from "@/components/minimal-tiptap/extensions/code-block-lowlight/docCodeBlock"
import { codeViewAt } from "@/components/minimal-tiptap/extensions/code-block-lowlight/code-block-view"
import { SIMPLE_TABLE, insertSimpleTable } from "@/components/minimal-tiptap/extensions/simple-table/simpleTable"
import { TablePaste } from "@/components/minimal-tiptap/extensions/simple-table/tablePaste"
import { FindKeys } from "@/components/minimal-tiptap/extensions/find-replace/findReplace"
import { BLOCK_MATH, BlockMath, INLINE_MATH, InlineMath, MathKeys, editMathAt, insertBlockMath, insertInlineMath, turnIntoMath } from "@/components/minimal-tiptap/extensions/math/math"

type Chip = { update(): void; destroy(): void }

/** The selection's word count: its chip loads the first time something is selected. */
const SelectionWatch = Extension.create({
  name: "selectionCount",
  addProseMirrorPlugins() {
    const editor = this.editor
    let chip: Chip | null = null
    let asked = false
    const count = lazyChunk(() => import("@/components/docEditor/SelectionCount"))
    return [
      new Plugin({
        key: new PluginKey("selectionCount"),
        view: () => ({
          update: (view, prev) => {
            if (chip) {
              if (view.state.selection !== prev.selection) chip.update()
              return
            }
            if (asked || view.state.selection.empty) return
            asked = true
            // Its code can't come (no network): the next selection asks again; a deploy reloads the page once.
            void count.use(() => (asked = false)).then((m) => {
              if (!m || editor.isDestroyed) return
              chip = m.mountCount(editor)
              chip.update()
            })
          },
          destroy: () => chip?.destroy(),
        }),
      }),
    ]
  },
})

export const CODE = [DocCodeBlock]
// The word count's watch has no spec of its own: it loads with the table's.
export const TABLE = [...SIMPLE_TABLE, TablePaste, SelectionWatch]
export const MATH = [InlineMath, BlockMath, MathKeys]

/** "/" Word count: the doc's count stays at the bottom, on this device. */
async function showWordCount(editor: Editor) {
  const { setDocCount, mountCount } = await import("@/components/docEditor/SelectionCount")
  setDocCount(true)
  // Shown at once, before anything is selected.
  mountCount(editor).update()
}

// ---- "/" and Turn into ----

registerBlock({
  id: "technicalMenus",
  editors: DOC_EDITORS,
  edition: "both",
  schema: [],
  // Registered as this chunk loads, so in place before the editor is built.
  extensions: [FindKeys],
  slash: [
    {
      id: "simpleTable",
      title: "Simple table",
      description: "A grid of text, its first row a header",
      aliases: ["table", "grid", "csv", "tsv"],
      icon: Table2,
      section: "Basic",
      order: 125,
      run: (e, r) => insertSimpleTable(e, r),
    },
    {
      id: "blockMath",
      title: "Block equation",
      description: "An equation on its own line, in TeX",
      aliases: ["math", "equation", "latex", "tex", "katex", "formula", "$$"],
      icon: Sigma,
      section: "Advanced",
      order: 10,
      run: (e, r) => void insertBlockMath(e, r),
    },
    {
      id: "inlineMath",
      title: "Inline equation",
      description: "An equation in the line, in TeX",
      aliases: ["math", "equation", "latex", "tex", "$"],
      icon: Radical,
      section: "Advanced",
      order: 20,
      run: (e, r) => void insertInlineMath(e, r),
    },
    {
      id: "wordCount",
      title: "Word count",
      description: "Keep the doc's word count in view",
      aliases: ["count", "words", "characters", "length"],
      icon: LetterText,
      section: "Advanced",
      order: 30,
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run()
        void showWordCount(e)
      },
    },
  ],
  turnInto: {
    id: "blockMath",
    label: "Block equation",
    icon: Sigma,
    // Right after Code (90): B2's Callout is 95.
    order: 92,
    detect: 32,
    isActive: (e) => e.isActive(BLOCK_MATH),
    run: (e) => void turnIntoMath(e),
  },
})

// ---- the block menu's and the palette's actions on a code block and an equation ----

/** The code block the block menu is on, or the caret is in. */
function codeBlockAt(ctx: ActionContext): number | null {
  const state = ctx.editor?.state
  if (!state) return null
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === "codeBlock") return sel.from
  const { $from } = sel
  return $from.parent.type.name === "codeBlock" && $from.depth > 0 ? $from.before() : null
}

const onCode = (ctx: ActionContext) => codeBlockAt(ctx) != null
const view = (ctx: ActionContext) => {
  const pos = codeBlockAt(ctx)
  return ctx.editor && pos != null ? codeViewAt(ctx.editor, pos) : null
}

const code = { group: "code", edition: "both" as const, isVisible: onCode, surfaces: ["blockMenu" as const, "palette" as const] }
registerAction({ ...code, id: "code.language", label: "Language…", description: "The code block's language", icon: Code, order: 10, isEnabled: (c) => onCode(c) && c.canEdit, run: (c) => view(c)?.openLanguages() })
registerAction({
  ...code,
  id: "code.wrap",
  label: "Wrap lines",
  icon: WrapText,
  order: 20,
  isEnabled: (c) => onCode(c) && c.canEdit,
  isChecked: (c) => {
    const pos = codeBlockAt(c)
    return pos != null && !!c.editor?.state.doc.nodeAt(pos)?.attrs.wrap
  },
  run: (c) => view(c)?.toggleWrap(),
})
registerAction({ ...code, id: "code.caption", label: "Caption", icon: Captions, order: 30, isEnabled: (c) => onCode(c) && c.canEdit, run: (c) => view(c)?.editCaption() })
registerAction({ ...code, id: "code.copy", label: "Copy code", icon: Copy, order: 40, run: (c) => view(c)?.copy() })

const mathAt = (ctx: ActionContext) => {
  const sel = ctx.editor?.state.selection
  return sel instanceof NodeSelection && (sel.node.type.name === INLINE_MATH || sel.node.type.name === BLOCK_MATH) ? sel.from : null
}
registerAction({
  id: "math.edit",
  label: "Edit equation",
  icon: Sigma,
  group: "code",
  order: 50,
  edition: "both",
  surfaces: ["blockMenu", "palette"],
  isVisible: (c) => mathAt(c) != null,
  isEnabled: (c) => mathAt(c) != null && c.canEdit,
  run: (c) => {
    const pos = mathAt(c)
    if (c.editor && pos != null) editMathAt(c.editor, pos)
  },
})
