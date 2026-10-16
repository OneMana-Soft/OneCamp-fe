"use client"

import { Extension, type Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { suggestionMenuOpen } from "../suggestion-popup"
import { ancestor } from "../../utils/ancestor"
import { docInputRules } from "./docInputRules"

/**
 * THE DOC'S OWN KEYS, as Notion's (notion.com/help/keyboard-shortcuts, read
 * 11 Oct 2026). Doc editors only (useDocEditor); the shortcuts dialog lists
 * them (docEditor/shortcuts.ts) and shortcuts.test.tsx fires every row.
 *
 *   ⌘⌥4–8      turn into a to-do, bullet, numbered or toggle list, or code
 *              (⌘⌥C, Tiptap's own, still makes code; ⌘⇧7/8/9 still lists)
 *   ⌘⌥T        open every toggle, or close them all when all are open
 *   ⌘↩         check or uncheck the to-do, open or close the toggle; never a
 *              line break (⇧↩ is the line break)
 *   Tab ⇧Tab   nest and un-nest a list item; in code, indent and outdent the
 *              lines. Focus never leaves the text on Tab; Escape then Tab
 *              does (the way out for the keyboard, WCAG 2.1.2)
 *   ↩ in code  a new line at the line's own indent
 *   ⌘K         with text selected, a link (the selection bar's field, or the
 *              link's own form on a link); with nothing selected, search
 *   ⌘A         the block's text first, then everything
 *   ⌘D         B1's (block-commands/blockKeys.ts): a copy of the block, or of
 *              the blocks chosen, below them (not the browser's bookmark)
 *   ⌘Z         the automatic change first ("## " back to text), then undo
 *   ⌫          at a list item's start, the bullet goes and the text stays
 *              where it is; at a heading's start, it becomes text first
 *   ↑ ⌫        from the body's first line (↑) or its empty first line (⌫),
 *              back up into the title
 *   →          at the end of a line ending in inline code, out of the code
 *
 * The Markdown rules (" + space, ~strike~, ```, [text](url)) are in
 * docInputRules.ts, and an empty list item or to-do says what it is ("List",
 * "To-do") while the caret is in it.
 */

export { DEFAULT_SCROLL_MARGIN, docKeymapOf, type DocKeymapStorage } from "./storage"
import { DEFAULT_SCROLL_MARGIN, type DocKeymapStorage } from "./storage"

const INDENT = "  "
const LIST_ITEMS = ["taskItem", "listItem"]

/** ⌘↩: the to-do checked or unchecked, the toggle opened or closed. */
export function modifyBlock(editor: Editor): boolean {
  const at = ancestor(editor, ["taskItem", "collapsible"])
  if (!at) return true
  const { state } = editor
  if (at.node.type.name === "taskItem") {
    editor.view.dispatch(state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, checked: !at.node.attrs.checked }))
    return true
  }
  const open = !at.node.attrs.open
  const tr = state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, open })
  // Closed with the caret inside: the toggle itself is selected (the caret
  // can't sit in hidden text), and ⌘↩ opens it again. Opened from there: the
  // caret goes in.
  if (!open) tr.setSelection(NodeSelection.create(tr.doc, at.pos))
  else if (state.selection instanceof NodeSelection) tr.setSelection(TextSelection.near(tr.doc.resolve(at.pos + 1)))
  editor.view.dispatch(tr)
  return true
}

/** ⌘⌥T: every toggle opened, or all closed when all are open already. */
export function toggleAllToggles(editor: Editor): boolean {
  const { state } = editor
  const toggles: { node: PMNode; pos: number }[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === "collapsible") toggles.push({ node, pos })
  })
  if (!toggles.length) return true
  const open = toggles.some((t) => !t.node.attrs.open)
  const tr = state.tr
  for (const t of toggles) if (t.node.attrs.open !== open) tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, open })
  if (!open) {
    // The caret can't stay in text that's now hidden: it goes to the
    // outermost toggle holding it.
    const outer = toggles.find((t) => t.pos < state.selection.from && state.selection.from < t.pos + t.node.nodeSize)
    if (outer) tr.setSelection(NodeSelection.create(tr.doc, outer.pos))
  }
  editor.view.dispatch(tr)
  return true
}

/** Where each line touched by the selection starts, as offsets in the code block's text. */
function codeLineStarts(text: string, from: number, to: number): number[] {
  const starts = [text.lastIndexOf("\n", from - 1) + 1]
  for (let i = starts[0]; i < to; i++) if (text[i] === "\n") starts.push(i + 1)
  return starts
}

/**
 * Tab and ⇧Tab in a code block. Tab with nothing selected puts an indent at
 * the caret: two spaces, or a tab where the line starts with one. Over
 * several lines, each line gets one more; ⇧Tab takes one away from each.
 */
export function indentCode(editor: Editor, direction: 1 | -1): boolean {
  const { state } = editor
  const { $from, $to, from, to, empty } = state.selection
  if ($from.parent !== $to.parent || !$from.parent.type.spec.code) return false
  const start = $from.start()
  const text = $from.parent.textContent
  const lines = codeLineStarts(text, from - start, to - start)
  const unitAt = (offset: number) => (text[offset] === "\t" ? "\t" : INDENT)
  const tr = state.tr
  if (direction > 0 && empty) {
    tr.insertText(unitAt(lines[0]), from)
  } else if (direction > 0) {
    for (const line of [...lines].reverse()) tr.insertText(unitAt(line), start + line)
  } else {
    for (const line of [...lines].reverse()) {
      const n = text[line] === "\t" ? 1 : text.startsWith(INDENT, line) ? 2 : text[line] === " " ? 1 : 0
      if (n) tr.delete(start + line, start + line + n)
    }
  }
  if (tr.docChanged) editor.view.dispatch(tr)
  return true
}

/**
 * ↩ in a code block (T25): a new line at the current line's indent. A line
 * with no indent, or one that is all indent at the block's end, is left to
 * the code block's own ↩, so two empty lines at the end still leave it.
 */
export function newlineKeepingIndent(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.type.spec.code) return false
  const text = $from.parent.textContent
  const offset = $from.parentOffset
  const line = text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset)
  const indent = /^[ \t]*/.exec(line)?.[0] ?? ""
  if (!indent || (indent === line && offset === text.length)) return false
  editor.view.dispatch(state.tr.insertText(`\n${indent}`).scrollIntoView())
  return true
}

function tab(editor: Editor, storage: DocKeymapStorage, direction: 1 | -1): boolean {
  // Escape, then Tab: the keyboard's way out of the text.
  if (storage.tabLeaves) {
    storage.tabLeaves = false
    return false
  }
  // A menu showing takes Tab itself (it picks the highlighted row).
  if (suggestionMenuOpen(editor)) return false
  if (editor.isActive("codeBlock")) return indentCode(editor, direction)
  for (const item of LIST_ITEMS) {
    if (editor.isActive(item)) {
      if (direction > 0) editor.commands.sinkListItem(item)
      else editor.commands.liftListItem(item)
      // Moved or not (a first item can't nest), focus stays in the text.
      return true
    }
  }
  // A paragraph or heading: nesting them comes later (an indent). Until then
  // Tab does nothing, rather than throwing focus out of the doc.
  return true
}

function link(editor: Editor, storage: DocKeymapStorage): boolean {
  const { selection } = editor.state
  // Nothing selected: ⌘K is search, as everywhere in the app (the palette).
  if (selection.empty || selection instanceof NodeSelection) return false
  if (editor.isActive("link") && storage.editLink?.()) return true
  return storage.requestLink?.() ?? false
}

/** What ⌘⌥4–8 turn a block into (Notion's order), and the command that does it. */
export const TURN_INTO_KEYS: Record<string, { kind: string; command: string }> = {
  "Mod-Alt-4": { kind: "To-do list", command: "toggleTaskList" },
  "Mod-Alt-5": { kind: "Bulleted list", command: "toggleBulletList" },
  "Mod-Alt-6": { kind: "Numbered list", command: "toggleOrderedList" },
  "Mod-Alt-7": { kind: "Toggle list", command: "toggleCollapsible" },
  "Mod-Alt-8": { kind: "Code block", command: "toggleCodeBlock" },
}

/**
 * ⌘⌥4–8 (K20): turn the block into a to-do, bulleted, numbered or toggle
 * list, or code, as Turn into does; again on one already of that kind turns
 * it back.
 */
export function turnInto(editor: Editor, command: string): boolean {
  const chain = editor.chain() as unknown as Record<string, (() => { run: () => boolean }) | undefined>
  const turn = chain[command]
  if (typeof turn !== "function") return false
  turn.call(chain).run()
  return true
}

/**
 * ⌘A (S2): the first selects the text of the block the caret is in, the next
 * everything. A block whose text is selected already, or that has none, goes
 * straight to everything (the editor's own ⌘A).
 */
export function selectBlockThenAll(editor: Editor): boolean {
  const { state } = editor
  const { $from, $to, from, to } = state.selection
  if (state.selection instanceof NodeSelection || !$from.sameParent($to) || !$from.parent.isTextblock) return false
  const start = $from.start()
  const end = $from.end()
  if (end === start || (from === start && to === end)) return false
  editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
  return true
}

/** Whether the selection is a caret at the very start of its text block. */
function atBlockStart(state: EditorState): boolean {
  const { $from, empty } = state.selection
  return empty && $from.parent.isTextblock && $from.parentOffset === 0
}

/**
 * ⌫ at the start of a list item or to-do (T16): the bullet goes and the text
 * stays where it is, splitting the list there; a nested item comes out one
 * level. It used to join the item above, as a second line of that bullet.
 */
export function unBullet(editor: Editor): boolean {
  const { state } = editor
  if (!atBlockStart(state)) return false
  const { $from } = state.selection
  if ($from.depth < 2) return false
  const item = $from.node(-1)
  if (!LIST_ITEMS.includes(item.type.name) || $from.index(-1) !== 0) return false
  // Dry first: a refused lift still dispatches through editor.commands.
  return editor.can().liftListItem(item.type.name) && editor.commands.liftListItem(item.type.name)
}

/** ⌫ at the start of a heading (T17): it becomes text, and the next ⌫ joins it to the line above. */
export function headingToText(editor: Editor): boolean {
  const { state } = editor
  if (!atBlockStart(state) || state.selection.$from.parent.type.name !== "heading") return false
  return editor.can().setParagraph() && editor.commands.setParagraph()
}

/**
 * Whether the caret is in the doc's first text block: the first child, or the
 * first child's first child and so on (a list's first item), never a walk of
 * the doc. A doc that opens with an image or a divider has none: ↑ goes to it.
 */
function inFirstTextblock(state: EditorState): boolean {
  const { $from } = state.selection
  if ($from.depth < 1 || !$from.parent.isTextblock) return false
  for (let d = 0; d < $from.depth; d++) {
    if ($from.index(d) !== 0) return false
  }
  return true
}

/**
 * ⌫ in an empty first line (T7): back into the title, at its end. The empty
 * line goes when there's more below it.
 */
export function backToTitleFromEmptyFirstLine(editor: Editor, storage: DocKeymapStorage): boolean {
  const { state } = editor
  if (!storage.focusTitle || !atBlockStart(state)) return false
  const { $from } = state.selection
  if ($from.depth !== 1 || $from.index(0) !== 0 || $from.parent.content.size > 0 || $from.parent.type.name !== "paragraph") return false
  if (state.doc.childCount > 1) editor.view.dispatch(state.tr.delete($from.before(), $from.after()))
  return storage.focusTitle()
}

/** ↑ on the first line of the body (T6): up into the title, at its end. */
export function upToTitle(editor: Editor, storage: DocKeymapStorage): boolean {
  const { state, view } = editor
  if (!storage.focusTitle || !state.selection.empty || suggestionMenuOpen(editor) || !inFirstTextblock(state)) return false
  let top: boolean
  try {
    top = view.endOfTextblock("up")
  } catch {
    // Nothing laid out (a hidden editor): the block's start is its top line.
    top = state.selection.$from.parentOffset === 0
  }
  return top ? storage.focusTitle() : false
}

/**
 * → at the end of a line that ends in inline code (T32): the caret steps out
 * of the code, with a space after it, as Tiptap's exitable marks do. Typing
 * on used to carry on in code, with no way out but the mouse.
 */
export function exitInlineCode(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const code = state.schema.marks.code
  if (!code || !empty || $from.parent.type.spec.code || $from.pos !== $from.end()) return false
  if (!(state.storedMarks ?? $from.marks()).some((m) => m.type === code)) return false
  editor.view.dispatch(state.tr.removeStoredMark(code).insertText(" ", $from.pos))
  return true
}

/** ⌘Z (T30): an automatic change made a moment ago ("## " became a heading) goes back first. */
export function undoAutomaticChange(editor: Editor): boolean {
  // Asked dry first: editor.commands dispatches even when the answer is no,
  // and that empty transaction still syncs to the shared doc, which can drop
  // Yjs's redo stack (⌘Z, then ⌘⇧Z did nothing).
  return editor.can().undoInputRule() && editor.commands.undoInputRule()
}

/** What an empty list item or to-do says while the caret is in it (T3). */
export const ITEM_PLACEHOLDER: Record<string, string> = { listItem: "List", taskItem: "To-do" }

/**
 * The placeholder on an empty first line of a list item or to-do, while the
 * caret is in it. Worked out from the caret alone (no walk of the doc), and
 * only while the editor can be edited.
 */
export function itemPlaceholder(state: EditorState, editable: boolean): DecorationSet {
  const { $from, empty } = state.selection
  if (!editable || !empty || $from.depth < 2 || $from.parent.content.size > 0 || $from.parent.type.name !== "paragraph") return DecorationSet.empty
  const words = ITEM_PLACEHOLDER[$from.node(-1).type.name]
  if (!words || $from.index(-1) !== 0) return DecorationSet.empty
  return DecorationSet.create(state.doc, [Decoration.node($from.before(), $from.after(), { class: "is-empty", "data-placeholder": words })])
}

export const DocKeymap = Extension.create<Record<string, never>, DocKeymapStorage>({
  name: "docKeymap",

  // Above StarterKit's and the lists' own keys (100), so ⌘↩ is never a line
  // break and Tab never leaves; below the "/" menu (200), which takes its
  // keys first. The other menus are asked (suggestionMenuOpen).
  priority: 150,

  addStorage() {
    return {
      requestLink: null,
      editLink: null,
      focusTitle: null,
      tabLeaves: false,
      scrollMargin: { top: DEFAULT_SCROLL_MARGIN, right: DEFAULT_SCROLL_MARGIN, bottom: DEFAULT_SCROLL_MARGIN, left: DEFAULT_SCROLL_MARGIN },
      scrollThreshold: { top: 0, right: 0, bottom: 0, left: 0 },
    }
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    const storage = this.storage
    const turnKeys = Object.fromEntries(Object.entries(TURN_INTO_KEYS).map(([key, { command }]) => [key, () => turnInto(editor, command)]))
    return {
      ...turnKeys,
      "Mod-Alt-t": () => toggleAllToggles(editor),
      "Mod-Enter": () => (suggestionMenuOpen(editor) ? false : modifyBlock(editor)),
      Enter: () => newlineKeepingIndent(editor),
      Tab: () => tab(editor, storage, 1),
      "Shift-Tab": () => tab(editor, storage, -1),
      "Mod-k": () => link(editor, storage),
      "Mod-a": () => selectBlockThenAll(editor),
      Backspace: () =>
        undoAutomaticChange(editor) || unBullet(editor) || headingToText(editor) || backToTitleFromEmptyFirstLine(editor, storage),
      ArrowUp: () => upToTitle(editor, storage),
      ArrowRight: () => exitInlineCode(editor),
    }
  },

  addInputRules() {
    return docInputRules(this.editor)
  },

  // ⌘Z's first undo is the automatic change: ahead of the collaboration
  // history (priority 1000), which would undo the whole burst of typing.
  addExtensions() {
    return [
      Extension.create({
        name: "docUndoAutomaticChange",
        priority: 1100,
        addKeyboardShortcuts() {
          return { "Mod-z": () => undoAutomaticChange(this.editor) }
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("docKeymapLeave"),
        props: {
          // Escape arms "Tab leaves the editor"; any other key disarms it. An
          // Escape a menu took never gets here (the menu's plugin is first).
          handleKeyDown: (_view, event) => {
            if (event.key === "Escape") storage.tabLeaves = true
            else if (!["Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key)) storage.tabLeaves = false
            return false
          },
          // The same objects throughout, changed in place (see the storage).
          scrollMargin: storage.scrollMargin,
          scrollThreshold: storage.scrollThreshold,
          decorations: (state) => itemPlaceholder(state, editor.isEditable),
        },
      }),
    ]
  },
})
