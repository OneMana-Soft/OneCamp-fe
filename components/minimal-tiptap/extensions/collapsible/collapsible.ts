"use client"

import { InputRule, Node, mergeAttributes, type Editor } from '@tiptap/core'
import { DOMParser as PMDOMParser, Fragment, type Node as PMNode, type NodeType, type Schema } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { newBlockId } from '../block-id/blockId'
import { suggestionMenuOpen } from '../suggestion-popup'
import { isSlashMenuOpen } from '../slash-command/slashCommand'
import { registerAction } from '@/components/docEditor/registry/registry'
import { isToggleOpen, markFresh, onToggleStates, setTogglesOpen } from './toggleState'

/**
 * A toggle (editor.md P1-7): its first line is its summary, a real paragraph or
 * heading, so it holds marks, links and mentions like any line (I5: rich text
 * is content, never an attribute); the blocks after it fold away.
 *
 * - A heading as the summary makes a toggle heading: Turn into on the summary
 *   line switches between a toggle list and toggle headings, and the outline
 *   lists it like any heading.
 * - Open or closed is each viewer's own, on this device, never in the doc
 *   (toggleState.ts): closing it here closes it for no one else.
 * - Old toggles kept their title in a `title` attribute (an <input>, last
 *   writer wins) and a shared `open`. The collaboration service moves them
 *   over as a doc loads (transforms/legacyContent.js), and saved HTML with
 *   data-title reads the same way here (parseHTML), so nothing is lost.
 * - It is `isolating`: Turn into and the like never lift a line out of it
 *   (N7). Backspace at its start and Enter on its last empty line leave it on
 *   purpose (below), and Backspace after it joins the line into it rather than
 *   selecting it whole.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      /** The line (or each line selected) becomes a toggle: 0 a toggle list, 1–3 a toggle heading. */
      setToggle: (level?: number) => ReturnType
      /** The toggle the caret is in becomes its lines again: nothing inside it is lost. */
      unsetToggle: () => ReturnType
      /** A toggle, or back to text when the caret is on a toggle's summary. */
      toggleCollapsible: () => ReturnType
      /** On a toggle's summary, the toggle gives way to its lines (Turn into does this first); elsewhere nothing. */
      leaveToggleSummary: () => ReturnType
    }
  }
}

const NAME = 'collapsible'
const BOXES = [NAME, 'callout']

type At = { node: PMNode; pos: number }

const menuOpen = (editor: Editor) => isSlashMenuOpen() || suggestionMenuOpen(editor)

/** The innermost toggle around a position. */
export function toggleAround(state: EditorState, pos = state.selection.from): (At & { depth: number }) | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === NAME) return { node, pos: $pos.before(d), depth: d }
  }
  return null
}

/** The toggle whose summary (its first line) holds the caret, if any. */
export function summaryAt(state: EditorState): At | null {
  const { $from } = state.selection
  if ($from.depth < 2 || !$from.parent.isTextblock) return null
  if ($from.node(-1).type.name !== NAME || $from.index(-1) !== 0) return null
  return { node: $from.node(-1), pos: $from.before(-1) }
}

/** A toggle's level: its summary heading's, else 0. */
export const toggleLevel = (toggle: PMNode) => (toggle.firstChild?.type.name === 'heading' ? Number(toggle.firstChild.attrs.level) || 0 : 0)

const isOpen = (toggle: PMNode) => isToggleOpen(toggle.attrs.blockId as string | null)

function summaryType(schema: Schema, level: number): { type: NodeType; attrs: Record<string, unknown> } {
  const { heading, paragraph } = schema.nodes
  return level > 0 && heading ? { type: heading, attrs: { level } } : { type: paragraph, attrs: {} }
}

/** A new toggle around a line, open here because it is being written. */
function newToggle(schema: Schema, content: PMNode | Fragment) {
  const id = newBlockId()
  markFresh(id)
  return schema.nodes[NAME].create({ blockId: id }, content)
}

/**
 * The text blocks the selection touches become toggles, the last first so
 * the positions before them hold. A list item's line can't, and is skipped.
 */
function wrapInToggles(state: EditorState, tr: Transaction, level: number): boolean {
  const type = state.schema.nodes[NAME]
  const { from, to } = state.selection
  const blocks: At[] = []
  state.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (!node.isTextblock) return true
    if (parent && parent.canReplaceWith(index, index + 1, type)) blocks.push({ node, pos })
    return false
  })
  if (!blocks.length) return false
  const caret = state.selection.from
  const target = summaryType(state.schema, level)
  for (const b of blocks.reverse()) {
    // The line keeps its own attributes (its id, its colour) that the new kind has.
    const kept = Object.fromEntries(Object.entries(b.node.attrs).filter(([k]) => k in (target.type.spec.attrs ?? {})))
    const summary = target.type.create({ ...kept, ...target.attrs }, b.node.content, b.node.marks)
    tr.replaceWith(b.pos, b.pos + b.node.nodeSize, newToggle(state.schema, summary))
  }
  // The caret where it was in its line, now one level in.
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, tr.mapping.map(caret) + 1))))
  return true
}

/** A toggle or a callout gives way to its blocks, the caret staying on its text. */
export function unwrap(tr: Transaction, at: At) {
  const caret = tr.selection.from
  tr.replaceWith(at.pos, at.pos + at.node.nodeSize, at.node.content)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(caret - 1, tr.doc.content.size)))))
}

/** Opens or closes a toggle for this viewer; one closed never keeps the caret in its body. */
export function setToggleOpen(editor: Editor, at: At, open: boolean) {
  const id = at.node.attrs.blockId as string | null
  if (id) setTogglesOpen([id], open)
  if (open) return
  const { from } = editor.state.selection
  const summaryEnd = at.pos + 1 + (at.node.firstChild?.nodeSize ?? 0)
  if (from >= summaryEnd && from < at.pos + at.node.nodeSize) {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, summaryEnd - 1)))
  }
}

/** Opens, for this viewer, every closed toggle whose body holds pos (find, the outline, a block link). */
export function revealAt(editor: Editor, pos: number) {
  if (!Number.isFinite(pos) || pos < 0 || pos > editor.state.doc.content.size) return
  const $pos = editor.state.doc.resolve(pos)
  const ids: string[] = []
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name !== NAME || ($pos.index(d) === 0 && d < $pos.depth)) continue
    if (node.attrs.blockId && !isOpen(node)) ids.push(node.attrs.blockId)
  }
  if (ids.length) setTogglesOpen(ids, true)
}

/** ⌘⌥T: every toggle opened, or all closed when every one is open. */
export function toggleAll(editor: Editor): boolean {
  const ids: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === NAME && node.attrs.blockId) ids.push(node.attrs.blockId)
  })
  if (!ids.length) return true
  const open = ids.some((id) => !isToggleOpen(id))
  setTogglesOpen(ids, open)
  if (!open) {
    // The caret can't stay in hidden text: to the summary of the outermost toggle holding it.
    const { $from } = editor.state.selection
    for (let d = 1; d < $from.depth; d++) {
      const node = $from.node(d)
      if (node.type.name === NAME && $from.index(d) > 0) {
        const end = $from.before(d) + node.firstChild!.nodeSize
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)))
        break
      }
    }
  }
  return true
}

/**
 * ↩ on a toggle's summary or its last empty line.
 * - An empty summary with nothing inside: the toggle goes, the line stays.
 * - A closed toggle: a new toggle after it, with the text after the caret;
 *   after a closed toggle heading, a line of text.
 * - An open one whose first line inside is empty: the caret goes there.
 * - The empty last line inside a toggle or a callout: out, after it.
 */
export function enterInToggle(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || menuOpen(editor)) return false
  const on = summaryAt(state)
  if (on) {
    const summary = on.node.firstChild!
    if (!summary.content.size && on.node.childCount < 2) {
      editor.view.dispatch(state.tr.replaceWith(on.pos, on.pos + on.node.nodeSize, state.schema.nodes.paragraph.create()))
      return true
    }
    const end = on.pos + on.node.nodeSize
    if (!isOpen(on.node)) {
      const tail = $from.parent.content.cut($from.parentOffset)
      const tr = state.tr.delete($from.pos, $from.end())
      const after = tr.mapping.map(end)
      const line = state.schema.nodes.paragraph.create(null, tail)
      const heading = summary.type.name === 'heading'
      tr.insert(after, heading ? line : newToggle(state.schema, line))
      tr.setSelection(TextSelection.create(tr.doc, after + (heading ? 1 : 2)))
      editor.view.dispatch(tr.scrollIntoView())
      return true
    }
    const next = on.node.childCount > 1 ? on.node.child(1) : null
    if ($from.parentOffset === $from.parent.content.size && next?.type.name === 'paragraph' && !next.content.size) {
      editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, on.pos + 1 + summary.nodeSize + 1)))
      return true
    }
    return false
  }
  if ($from.depth < 2 || $from.parent.content.size || $from.parent.type.name !== 'paragraph') return false
  const box = $from.node(-1)
  if (!BOXES.includes(box.type.name)) return false
  const index = $from.index(-1)
  if (index === 0 || index !== box.childCount - 1) return false
  const boxEnd = $from.after(-1)
  const tr = state.tr.delete($from.before(), $from.after())
  const at = tr.mapping.map(boxEnd)
  tr.insert(at, state.schema.nodes.paragraph.create())
  tr.setSelection(TextSelection.create(tr.doc, at + 1))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * ⌫ at the start of a toggle's summary or a callout's first line: it gives
 * way to its lines. A toggle heading becomes a toggle list first (the doc
 * keymap's ⌫ on a heading), and an automatic change a moment ago goes back
 * first (its ⌘Z).
 */
export function backspaceAtStart(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || $from.parentOffset !== 0 || $from.depth < 2) return false
  if (editor.can().undoInputRule()) return false
  const box = $from.node(-1)
  if ($from.index(-1) !== 0 || !BOXES.includes(box.type.name)) return false
  if ($from.parent.type.name === 'heading') return false
  const tr = state.tr
  unwrap(tr, { node: box, pos: $from.before(-1) })
  editor.view.dispatch(tr)
  return true
}

/**
 * ⌫ at the start of a line just after a toggle or a callout: the line joins
 * the last line inside it, as it would join any line above (an isolating
 * block would otherwise be selected whole, and the next ⌫ would delete it).
 * A closed toggle opens for this viewer, so the line is seen where it went.
 */
export function backspaceIntoBox(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || $from.parentOffset !== 0 || $from.parent.type.spec.code || $from.depth < 1) return false
  if ($from.index(-1) === 0) return false
  const box = $from.node(-1).child($from.index(-1) - 1)
  if (!BOXES.includes(box.type.name)) return false
  // The box's last text block, from its end: the position at that block's end.
  let end = $from.before() - 1
  let last: number | null = null
  for (let node: PMNode | null = box.lastChild; node; node = node.lastChild) {
    if (node.isTextblock) {
      // Text doesn't join code (it would lose its marks): ⌫ stays the editor's own there.
      if (!node.type.spec.code) last = end - 1
      break
    }
    end -= 1
  }
  if (last === null) return false
  if (box.type.name === NAME && box.attrs.blockId && !isOpen(box)) setTogglesOpen([box.attrs.blockId], true)
  const line = $from.parent
  const tr = state.tr.delete($from.before(), $from.after())
  if (line.content.size) tr.insert(last, line.content)
  tr.setSelection(TextSelection.create(tr.doc, last))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

// Find and a link to a block open the closed toggles that hold it, for this
// viewer only (WAVE_B_CONTRACTS): asked by id, never shown, and registered
// with this chunk, which loads before any doc editor is built.
registerAction({
  id: 'toggles.reveal',
  label: 'Open the toggles that hold it',
  group: 'toggles',
  surfaces: [],
  edition: 'both',
  run: (ctx) => {
    const pos = ctx.state?.pos
    if (ctx.editor && typeof pos === 'number') revealAt(ctx.editor, pos)
  },
})

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'

/**
 * Drawn in plain DOM (R4: a doc can hold hundreds): the chevron, the lines,
 * and an "Empty toggle" row while there's nothing inside.
 */
function toggleView(editor: Editor, initial: PMNode, getPos: () => number | undefined) {
  let node = initial
  const dom = document.createElement('div')
  dom.className = 'toggle block-node'
  dom.setAttribute('data-type', NAME)
  const chevron = document.createElement('button')
  chevron.type = 'button'
  chevron.className = 'toggle-chevron'
  chevron.contentEditable = 'false'
  chevron.innerHTML = CHEVRON
  const contentDOM = document.createElement('div')
  contentDOM.className = 'toggle-content'
  const empty = document.createElement('button')
  empty.type = 'button'
  empty.className = 'toggle-empty'
  empty.contentEditable = 'false'
  empty.textContent = 'Empty toggle. Add a line.'
  dom.append(chevron, contentDOM, empty)

  // A toggle with no id yet (a moment, before the block-id plugin gives one) opens and closes in this view only.
  let localOpen = true
  const open = () => (node.attrs.blockId ? isOpen(node) : localOpen)
  const attr = (name: string, value: unknown) => (value ? dom.setAttribute(name, String(value)) : dom.removeAttribute(name))
  const draw = () => {
    const o = open()
    dom.setAttribute('data-open', String(o))
    dom.setAttribute('data-level', String(toggleLevel(node)))
    attr('data-block-id', node.attrs.blockId)
    attr('data-block-color', node.attrs.blockColor)
    chevron.setAttribute('aria-expanded', String(o))
    chevron.setAttribute('aria-label', o ? 'Close the toggle' : 'Open the toggle')
    empty.hidden = !(o && node.childCount < 2 && editor.isEditable)
  }
  draw()
  const stop = onToggleStates(draw)

  const keep = (e: Event) => e.preventDefault()
  chevron.addEventListener('mousedown', keep)
  chevron.addEventListener('click', () => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    if (!node.attrs.blockId) {
      localOpen = !localOpen
      return draw()
    }
    setToggleOpen(editor, { node, pos }, !open())
  })
  empty.addEventListener('mousedown', keep)
  empty.addEventListener('click', () => {
    const pos = getPos()
    if (typeof pos !== 'number' || !editor.isEditable) return
    const after = pos + 1 + node.firstChild!.nodeSize
    const tr = editor.state.tr.insert(after, editor.state.schema.nodes.paragraph.create())
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)))
    editor.view.focus()
  })

  return {
    dom,
    contentDOM,
    update(next: PMNode) {
      if (next.type !== node.type) return false
      node = next
      draw()
      return true
    },
    stopEvent: (e: Event) => chevron.contains(e.target as globalThis.Node) || empty.contains(e.target as globalThis.Node),
    ignoreMutation: (m: MutationRecord | { type: 'selection'; target: globalThis.Node }) =>
      m.type !== 'selection' && (!contentDOM.contains(m.target) || (m.target === contentDOM && m.type === 'attributes')),
    destroy: stop,
  }
}

/**
 * An old toggle (data-title, with its data-open) gets its title as its first
 * line, before its blocks; one with no title an empty first line, so its
 * blocks stay its blocks. The codec reads it the same way (lib/codec).
 */
function legacyContent(el: HTMLElement, schema: Schema): Fragment {
  const body = PMDOMParser.fromSchema(schema).parseSlice(el).content
  const title = el.getAttribute('data-title')
  if (title === null && !el.hasAttribute('data-open')) return body
  return Fragment.from(schema.nodes.paragraph.create(null, title ? schema.text(title) : null)).append(body)
}

/**
 * A <details> pasted from elsewhere (Notion's export, GitHub): its <summary>
 * as the first line, a heading when it holds one (a toggle heading), as the
 * codec reads it.
 */
function detailsContent(el: HTMLElement, schema: Schema): Fragment {
  const parser = PMDOMParser.fromSchema(schema)
  const summary = el.querySelector(':scope > summary')
  // Parsed as a doc, so loose text is a paragraph and a heading stays one.
  const head = summary ? parser.parse(summary).content : Fragment.empty
  const lead = head.firstChild?.type.name
  const first = lead === 'paragraph' || lead === 'heading' ? head : Fragment.from(schema.nodes.paragraph.create()).append(head)
  const rest = el.cloneNode(true) as HTMLElement
  rest.querySelector(':scope > summary')?.remove()
  return first.append(parser.parseSlice(rest).content)
}

export const Collapsible = Node.create({
  name: NAME,
  group: 'block',
  // The summary first (a line of text or a heading), then whatever it holds.
  content: '(paragraph | heading) block*',
  defining: true,
  isolating: true,
  // Above the doc keymap (150), whose ⌘↩ and ⌘⌥T wrote a shared open state.
  priority: 155,

  parseHTML() {
    return [
      { tag: 'div[data-type="collapsible"]', getContent: (dom, schema) => legacyContent(dom as HTMLElement, schema) },
      { tag: 'details', getContent: (dom, schema) => detailsContent(dom as HTMLElement, schema) },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': NAME }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setToggle:
        (level = 0) =>
        ({ state, tr, dispatch }) => {
          const on = summaryAt(state)
          if (on) {
            const t = summaryType(state.schema, level)
            if (on.node.firstChild!.type === t.type && toggleLevel(on.node) === level) return true
            if (dispatch) tr.setBlockType(state.selection.from, state.selection.from, t.type, t.attrs)
            return true
          }
          return dispatch ? wrapInToggles(state, tr, level) : true
        },
      unsetToggle:
        () =>
        ({ state, tr, dispatch }) => {
          const at = toggleAround(state)
          if (!at) return false
          if (dispatch) unwrap(tr, at)
          return true
        },
      toggleCollapsible:
        () =>
        ({ state, commands }) =>
          summaryAt(state) ? commands.unsetToggle() : commands.setToggle(0),
      leaveToggleSummary:
        () =>
        ({ state, tr, dispatch }) => {
          const on = summaryAt(state)
          if (!on) return false
          if (dispatch) unwrap(tr, on)
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    return {
      // ⌘↩ in a toggle (not in a to-do inside it): open or close it, here only.
      'Mod-Enter': () => {
        if (menuOpen(editor)) return false
        const at = toggleAround(editor.state)
        if (!at) return false
        const { $from } = editor.state.selection
        for (let d = $from.depth; d > at.depth; d--) if ($from.node(d).type.name === 'taskItem') return false
        setToggleOpen(editor, at, !isOpen(at.node))
        return true
      },
      'Mod-Alt-t': () => toggleAll(editor),
      Enter: () => enterInToggle(editor),
      Backspace: () => backspaceAtStart(editor) || backspaceIntoBox(editor),
    }
  },

  addInputRules() {
    return [
      // >> and a space: a toggle (> alone stays a quote, as in chat: D-3).
      toggleRule(/^>>\s$/, 'paragraph'),
      // > and a space at the start of a heading: a toggle heading (K16).
      toggleRule(/^>\s$/, 'heading'),
    ]
  },

  addNodeView() {
    return ({ editor, node, getPos }) => toggleView(editor, node, getPos as () => number | undefined)
  },
})

/** Typed at the start of a line of this kind: the line becomes a toggle's summary. */
function toggleRule(find: RegExp, kind: string) {
  return new InputRule({
    find,
    handler: ({ state, range }) => {
      const $from = state.doc.resolve(range.from)
      const type = state.schema.nodes[NAME]
      if ($from.parent.type.name !== kind || $from.depth < 1) return null
      // Already a toggle's summary: nothing to make.
      if ($from.depth > 1 && $from.node(-1).type === type && $from.index(-1) === 0) return null
      if (!$from.node(-1).canReplaceWith($from.index(-1), $from.index(-1) + 1, type)) return null
      const { tr } = state
      const pos = $from.before()
      tr.delete(range.from, range.to)
      const line = tr.doc.nodeAt(pos)
      if (!line) return null
      tr.replaceWith(pos, pos + line.nodeSize, newToggle(state.schema, line))
      tr.setSelection(TextSelection.create(tr.doc, pos + 2))
    },
  })
}
