"use client"

/**
 * What the selection bar and the phone's bar do to the text (docs programme
 * A1): the marks, a quick block or two, an @ and an image, and Comment. Turn
 * into, the link field and the text colour are the bars' own pickers; they
 * read Turn into from the block specs (registry/readers.ts turnIntoFor).
 *
 * The keys for these are the marks' own (Bold's ⌘B is Tiptap's), so no
 * action here names a shortcut: the shortcut table has their rows already,
 * from the block specs.
 *
 * Selection bar groups, in order: ai, marks, comment. Phone bar: marks,
 * blocks, insert, ai, comment.
 */

import type { Editor } from "@tiptap/core"
import { AtSign, Bold, Code, Image as ImageIcon, IndentDecrease, IndentIncrease, Italic, List, ListTodo, MessageSquarePlus, Redo2, Strikethrough, Underline, Undo2 } from "@/lib/icons"
import { registerAction } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { canRun, nests, shiftBlock } from "@/components/docEditor/blockShift"

/** Marks can't go on code: a code block holds plain text. */
const notInCode = (ctx: ActionContext) => !!ctx.editor && ctx.canEdit && !ctx.editor.isActive("codeBlock")
const active = (name: string) => (ctx: ActionContext) => !!ctx.editor?.isActive(name)
const chain = (editor: Editor) => editor.chain().focus()

type MarkChain = ReturnType<Editor["chain"]> & {
  toggleBold(): MarkChain
  toggleItalic(): MarkChain
  toggleUnderline(): MarkChain
  toggleStrike(): MarkChain
  toggleCode(): MarkChain
  toggleBulletList(): MarkChain
  toggleTaskList(): MarkChain
  toggleImage(): MarkChain
}
const marks = (ctx: ActionContext) => chain(ctx.editor!) as unknown as MarkChain

const MARKS: Array<{ id: string; label: string; icon: typeof Bold; mark: string; toggle(c: MarkChain): MarkChain; phone?: boolean }> = [
  { id: "text.bold", label: "Bold", icon: Bold, mark: "bold", toggle: (c) => c.toggleBold(), phone: true },
  { id: "text.italic", label: "Italic", icon: Italic, mark: "italic", toggle: (c) => c.toggleItalic(), phone: true },
  { id: "text.underline", label: "Underline", icon: Underline, mark: "underline", toggle: (c) => c.toggleUnderline() },
  { id: "text.strike", label: "Strikethrough", icon: Strikethrough, mark: "strike", toggle: (c) => c.toggleStrike() },
  { id: "text.code", label: "Inline code", icon: Code, mark: "code", toggle: (c) => c.toggleCode() },
]

MARKS.forEach((m, i) =>
  registerAction({
    id: m.id,
    label: m.label,
    icon: m.icon,
    group: "marks",
    order: (i + 1) * 10,
    surfaces: m.phone ? ["selection", "phoneBar"] : ["selection"],
    edition: "both",
    isEnabled: notInCode,
    isChecked: active(m.mark),
    run: (ctx) => {
      if (ctx.editor) m.toggle(marks(ctx)).run()
    },
  }),
)

registerAction({
  id: "block.bulletList",
  label: "Bulleted list",
  icon: List,
  group: "blocks",
  order: 10,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit,
  isChecked: active("bulletList"),
  run: (ctx) => {
    if (ctx.editor) marks(ctx).toggleBulletList().run()
  },
})

registerAction({
  id: "block.todo",
  label: "To-do list",
  icon: ListTodo,
  group: "blocks",
  order: 20,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit,
  isChecked: active("taskList"),
  run: (ctx) => {
    if (ctx.editor) marks(ctx).toggleTaskList().run()
  },
})

// The phone has no Tab key and no ⌘Z: its bar indents, outdents, undoes and redoes (A0, M2).
registerAction({
  id: "block.indent",
  label: "Indent",
  icon: IndentIncrease,
  group: "nest",
  order: 10,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit && nests(ctx.editor),
  run: (ctx) => {
    if (ctx.editor) shiftBlock(ctx.editor, 1)
  },
})

registerAction({
  id: "block.outdent",
  label: "Outdent",
  icon: IndentDecrease,
  group: "nest",
  order: 20,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit && nests(ctx.editor),
  run: (ctx) => {
    if (ctx.editor) shiftBlock(ctx.editor, -1)
  },
})

registerAction({
  id: "edit.undo",
  label: "Undo",
  icon: Undo2,
  group: "history",
  order: 10,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit && canRun(ctx.editor, "undo"),
  run: (ctx) => {
    if (ctx.editor && canRun(ctx.editor, "undo")) ctx.editor.chain().focus().undo().run()
  },
})

registerAction({
  id: "edit.redo",
  label: "Redo",
  icon: Redo2,
  group: "history",
  order: 20,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit && canRun(ctx.editor, "redo"),
  run: (ctx) => {
    if (ctx.editor && canRun(ctx.editor, "redo")) ctx.editor.chain().focus().redo().run()
  },
})

registerAction({
  id: "insert.mention",
  label: "Mention someone",
  icon: AtSign,
  group: "insert",
  order: 10,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit,
  run: (ctx) => {
    ctx.editor?.chain().focus().insertContent("@").run()
  },
})

registerAction({
  id: "insert.image",
  label: "Insert image",
  icon: ImageIcon,
  group: "insert",
  order: 20,
  surfaces: ["phoneBar"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit,
  run: (ctx) => {
    if (ctx.editor) marks(ctx).toggleImage().run()
  },
})

registerAction({
  id: "text.comment",
  label: "Comment",
  icon: MessageSquarePlus,
  group: "comment",
  order: 10,
  surfaces: ["selection", "phoneBar"],
  // A page key, which works in the text too (it types nothing): over a
  // selection the selection bar answers first, on the editor; with only a
  // caret, or over a reader's selection, the page's keys run it (B7).
  shortcut: "Mod-Shift-m",
  shortcutLabel: "Comment on the selection",
  shortcutOrder: 22,
  edition: "both",
  // On what is selected, or the blocks the block menu stands for (its
  // ctx.state.blocks, by id; else its range): a thread starts there (B7's
  // anchored comments), on those blocks and never what lies between them.
  // From comment up (lib/docs/abilities); without abilities, as before.
  isVisible: (ctx) => !!ctx.editor && (ctx.abilities?.comment ?? true) && (!!menuRange(ctx) || !!menuBlocks(ctx) || !ctx.editor.state.selection.empty),
  // Enabled with only a caret as well: the comment is then on its block.
  isEnabled: (ctx) => !!ctx.editor && (ctx.abilities?.comment ?? true),
  run: (ctx) => {
    if (!ctx.editor) return
    const { from, to } = menuRange(ctx) ?? ctx.editor.state.selection
    const blocks = menuBlocks(ctx)
    ctx.bus.emit("comment", blocks ? { from, to, blocks } : { from, to })
  },
})

/** The range of blocks a block menu ran an action on (WAVE_B_CONTRACTS), when it did. */
function menuRange(ctx: ActionContext): { from: number; to: number } | null {
  const r = ctx.state?.range as { from?: unknown; to?: unknown } | undefined
  return r && typeof r.from === "number" && typeof r.to === "number" && r.from < r.to ? { from: r.from, to: r.to } : null
}

/** The blocks a block menu ran an action on, by id in the doc's order (B1's ctx.state.blocks), when it did. */
function menuBlocks(ctx: ActionContext): string[] | null {
  const b = ctx.state?.blocks
  return Array.isArray(b) && b.length > 0 && b.every((id) => typeof id === "string" && id) ? (b as string[]) : null
}

/** The selection bar's groups, in order; the bar draws Turn into after ai, and the link and colour after marks. */
export const SELECTION_GROUPS = ["ai", "marks", "style", "comment"]

/** The phone bar's groups, in order (Turn into before them, Hide keyboard last, are the bar's own). */
export const PHONE_BAR_GROUPS = ["marks", "style", "blocks", "nest", "history", "comment", "insert", "block", "ai"]

/**
 * The same, with text selected: what a selection is for comes first (QA
 * DSA-24: Ask AI was 16th of 18, off the screen until the bar scrolled).
 */
export const PHONE_BAR_SELECTION_GROUPS = ["ai", "comment", "marks", "style", "blocks", "nest", "history", "insert", "block"]

/** The phone bar's order for this selection. Pure. */
export function phoneBarGroups(selectionEmpty: boolean): string[] {
  return selectionEmpty ? PHONE_BAR_GROUPS : PHONE_BAR_SELECTION_GROUPS
}
