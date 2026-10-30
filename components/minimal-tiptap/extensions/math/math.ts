"use client"

/**
 * Equations in a doc (docs programme B3, editor.md P1-9): `inlineMath` in a
 * line and `blockMath` on its own, each holding only its TeX (`latex`, I5),
 * with Tiptap 3's names and HTML (span or div, data-type="inline-math" or
 * "block-math", data-latex), so the collaboration service and the codec read
 * them as Tiptap's own mathematics extension does.
 *
 * Typing: `$x^2$` or `$$x^2$$` makes an inline equation; `$$` and a space (or
 * ↩) on an empty line makes a block one; ⌘⇧E turns the selection into an
 * equation, or starts one. A click, or ↩ on a selected equation, opens its
 * editor (MathEditor.tsx, with a live preview). An amount of money stays
 * money: "$5 and $10" never becomes one.
 *
 * Typography leaves the TeX alone: inside an equation being typed (after an
 * opening `$`), ' " -- -> ... and the Markdown marks are typed as they are.
 *
 * KaTeX (katex.ts) loads the first time an equation is drawn, and an
 * equation is drawn when it comes near the screen, so a doc of 200 opens and
 * types as fast as one of none.
 */

import { Extension, InputRule, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state"
import type { NodeView } from "@tiptap/pm/view"
import { once } from "@/lib/lazy/once"

export const INLINE_MATH = "inlineMath"
export const BLOCK_MATH = "blockMath"

const latexAttr = {
  latex: {
    default: "",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-latex") ?? "",
    renderHTML: (attrs: Record<string, unknown>) => ({ "data-latex": attrs.latex ?? "" }),
  },
}

// ---- drawing ----

type Katex = typeof import("./katex")
let katex: Katex | null = null
const loadKatex: () => Promise<Katex> = once(() => import("./katex").then((m) => (katex = m)))

const views = new WeakMap<Element, MathView>()

// One watcher for every equation: each is drawn as it comes near the screen.
let watcher: IntersectionObserver | null = null
function watch(view: MathView) {
  if (typeof IntersectionObserver === "undefined") return view.draw()
  watcher ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        watcher!.unobserve(e.target)
        views.get(e.target)?.draw()
      }
    },
    { rootMargin: "800px 0px" },
  )
  watcher.observe(view.dom)
}

class MathView implements NodeView {
  dom: HTMLElement
  private shown: string | null = null
  private previewing: string | null = null
  /** Closes this equation's editor while it is open (the code block's language list does the same). */
  private closeEditor: (() => void) | null = null
  private gone = false

  constructor(
    private node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
    private readonly display: boolean,
  ) {
    this.dom = document.createElement(display ? "div" : "span")
    this.dom.className = display ? "doc-math doc-math-block" : "doc-math"
    this.dom.dataset.type = display ? "block-math" : "inline-math"
    this.dom.contentEditable = "false"
    this.dom.addEventListener("click", (e) => {
      if (!this.editor.isEditable || e.button !== 0) return
      this.edit()
    })
    views.set(this.dom, this)
    this.label()
    this.source(this.latex)
    watch(this)
  }

  get latex(): string {
    return (this.node.attrs.latex as string) ?? ""
  }

  private label() {
    const what = this.display ? "Block equation" : "Equation"
    this.dom.setAttribute("role", this.editor.isEditable ? "button" : "math")
    this.dom.setAttribute("aria-label", this.latex ? `${what}: ${this.latex}` : `${what}, empty`)
    this.dom.title = this.latex
  }

  /** The TeX as text, until KaTeX draws it (and for an empty one, what to do). */
  private source(latex: string) {
    this.dom.dataset.empty = latex.trim() ? "false" : "true"
    this.dom.textContent = latex.trim() ? latex : this.display ? "Write an equation in TeX" : "New equation"
  }

  /** Draws the equation, or the TeX it's being edited to (a preview, for the writer alone). */
  draw(latex = this.previewing ?? this.latex) {
    if (!latex.trim()) {
      this.shown = latex
      return this.source(latex)
    }
    if (latex === this.shown && katex) return
    void loadKatex().then(
      (k) => {
        const now = this.previewing ?? this.latex
        if (now !== latex || !this.dom.isConnected) return
        this.shown = latex
        this.dom.dataset.empty = "false"
        k.renderMath(this.dom, latex, this.display)
      },
      () => this.source(latex),
    )
  }

  /** Shows TeX that isn't stored yet (the editor's live preview); null goes back to the doc's. */
  preview(latex: string | null) {
    this.previewing = latex
    this.draw()
  }

  /** Opens the equation's editor under it. */
  edit() {
    if (!this.editor.isEditable) return
    void import("./MathEditor").then(({ openMathEditor }) => {
      if (this.gone || !this.dom.isConnected) return
      this.closeEditor = openMathEditor({
        anchor: this.dom,
        latex: this.latex,
        display: this.display,
        preview: (l) => this.preview(l),
        commit: (l) => this.commit(l),
      })
    })
  }

  /** Stores the edited TeX; an inline equation left empty goes, with the caret where it was. */
  commit(latex: string) {
    this.closeEditor = null
    this.previewing = null
    // Closed because the equation went (its block deleted, the doc left): nothing to store.
    if (this.gone) return
    const pos = this.getPos()
    if (pos == null || !this.editor.isEditable) return this.draw()
    const { state } = this.editor
    const now = state.doc.nodeAt(pos)
    if (!now || now.type !== this.node.type) return
    const tr = state.tr
    if (!latex.trim() && !this.display) {
      tr.delete(pos, pos + now.nodeSize)
      tr.setSelection(TextSelection.create(tr.doc, pos))
    } else {
      if (latex !== now.attrs.latex) tr.setNodeAttribute(pos, "latex", latex)
      const after = pos + now.nodeSize
      tr.setSelection(this.display ? NodeSelection.create(tr.doc, pos) : TextSelection.create(tr.doc, after))
    }
    this.editor.view.dispatch(tr.scrollIntoView())
    this.draw()
    this.editor.view.focus()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    const changed = node.attrs.latex !== this.node.attrs.latex
    this.node = node
    if (changed) {
      this.label()
      this.draw()
    }
    return true
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.gone = true
    watcher?.unobserve(this.dom)
    views.delete(this.dom)
    // An editor left open would float with nothing under it, and its Escape
    // would be the next one pressed anywhere.
    this.closeEditor?.()
  }
}

/** Opens the editor of the equation at pos, once its view is drawn. */
export function editMathAt(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof Element) views.get(dom)?.edit()
}

// ---- the nodes ----

const viewOf = (display: boolean) =>
  ({ node, editor, getPos }: { node: PMNode; editor: Editor; getPos: (() => number | undefined) | boolean }) =>
    new MathView(node, editor, () => (typeof getPos === "function" ? getPos() : undefined), display)

export const InlineMath = Node.create({
  name: INLINE_MATH,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'span[data-type="inline-math"]' }],
  // The TeX as the element's text too: a reader of the saved copy, an email
  // or a search sees the equation's source, not an empty span.
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "inline-math" }), node.attrs.latex ?? ""],
  renderText: ({ node }) => `$${node.attrs.latex ?? ""}$`,
  addNodeView: () => viewOf(false),
})

export const BlockMath = Node.create({
  name: BLOCK_MATH,
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'div[data-type="block-math"]' }],
  renderHTML: ({ node, HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "block-math" }), node.attrs.latex ?? ""],
  renderText: ({ node }) => `$$\n${node.attrs.latex ?? ""}\n$$`,
  addNodeView: () => viewOf(true),
})

// ---- typing ----

/** What follows an opening $ when it's an amount: "$5", "$1,200.50 and". */
const MONEY = /^\d[\d.,]*(\s|$)/

/**
 * Whether text ends inside an equation being typed: after a $ that opens one
 * (not escaped, not doubled, not an amount), within the last 200 characters.
 */
export function insideOpenMath(text: string): boolean {
  let open = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$" || text[i - 1] === "\\") continue
    if (text[i + 1] === "$") {
      i++
      continue
    }
    open = open < 0 ? i : -1
  }
  if (open < 0 || text.length - open > 200) return false
  const after = text.slice(open + 1)
  return after !== "" && !/^\s/.test(after) && !MONEY.test(after)
}

/** A money amount between two $ signs is money: "$5-$10" isn't an equation. */
const isMoney = (latex: string) => /^[\d.,\s-]*$/.test(latex)

/** `$x$`, as the second $ is typed: an inline equation. */
export function findInlineDollar(text: string) {
  const m = /(^|[^\\$\w])\$([^\s$](?:[^$\n]*[^\s$\\])?)\$$/.exec(text)
  if (!m || isMoney(m[2]) || m[2].includes("%leaf%")) return null
  const index = m.index + m[1].length
  return { index, text: text.slice(index), data: { latex: m[2] } }
}

/** `$$x$$`, as the last $ is typed (Notion's and Tiptap's way). */
export function findDoubleDollar(text: string) {
  const m = /(^|[^$\\])\$\$([^$\n]+?)\$\$$/.exec(text)
  if (!m || !m[2].trim() || m[2].includes("%leaf%")) return null
  const index = m.index + m[1].length
  return { index, text: text.slice(index), data: { latex: m[2].trim() } }
}

/** The keys that end some Markdown or typography rule: inside an equation, they're typed as they are. */
const GUARDED = /[-.>)<="'*_~`^]$/

/**
 * Puts a block equation where a line is: the line becomes it when it holds
 * nothing else and may be one there; otherwise it goes after the line (a
 * list item's first line stays a line). Returns where it went.
 */
function placeBlock(tr: Transaction, at: Range, node: PMNode): number {
  tr.delete(at.from, at.to)
  const $from = tr.doc.resolve(at.from)
  const line = $from.parent
  const parent = $from.node(-1)
  const index = $from.index(-1)
  if ($from.depth > 0 && line.isTextblock && line.content.size === 0 && parent.canReplaceWith(index, index + 1, node.type)) {
    const pos = $from.before()
    tr.replaceWith(pos, $from.after(), node)
    return pos
  }
  const pos = $from.depth > 0 ? $from.after() : at.from
  tr.insert(pos, node)
  return pos
}

function insertMath(editor: Editor, at: Range, display: boolean, latex = "") {
  const type = editor.schema.nodes[display ? BLOCK_MATH : INLINE_MATH]
  const { state } = editor
  const tr = state.tr
  let pos = at.from
  if (display) {
    pos = placeBlock(tr, at, type.create({ latex }))
    tr.setSelection(NodeSelection.create(tr.doc, pos))
  } else {
    tr.replaceWith(at.from, at.to, type.create({ latex }))
    tr.setSelection(NodeSelection.create(tr.doc, at.from))
  }
  editor.view.dispatch(tr.scrollIntoView())
  if (!latex) editMathAt(editor, pos)
  return true
}

/** "/" Block equation. */
export function insertBlockMath(editor: Editor, range: Range) {
  return insertMath(editor, range, true)
}

/** "/" Inline equation. */
export function insertInlineMath(editor: Editor, range: Range) {
  return insertMath(editor, range, false)
}

/** Turn into Block equation: the line's text becomes the equation's TeX. */
export function turnIntoMath(editor: Editor): boolean {
  const { $from } = editor.state.selection
  const block = $from.parent
  if (!block.isTextblock || block.type.spec.code || $from.depth < 1) return false
  return insertMath(editor, { from: $from.start(), to: $from.end() }, true, block.textContent.trim())
}

/** ⌘⇧E: the selected text becomes an equation, or an empty one starts at the caret. */
export function toggleInlineMath(editor: Editor): boolean {
  const { state } = editor
  const sel = state.selection
  if (sel instanceof NodeSelection && (sel.node.type.name === INLINE_MATH || sel.node.type.name === BLOCK_MATH)) {
    editMathAt(editor, sel.from)
    return true
  }
  const { $from, $to, from, to, empty } = sel
  if (!$from.sameParent($to) || !$from.parent.inlineContent || $from.parent.type.spec.code) return false
  const latex = empty ? "" : state.doc.textBetween(from, to, " ").trim()
  return insertMath(editor, { from, to }, false, latex)
}

export const MathKeys = Extension.create({
  name: "mathKeys",

  addKeyboardShortcuts() {
    const editor = this.editor
    return {
      "Mod-Shift-e": () => toggleInlineMath(editor),
      // ↩ on a selected equation edits it; ↩ after $$ on an empty line makes a block one.
      Enter: () => {
        const sel = editor.state.selection
        if (sel instanceof NodeSelection && (sel.node.type.name === INLINE_MATH || sel.node.type.name === BLOCK_MATH)) {
          editMathAt(editor, sel.from)
          return true
        }
        const { $from, empty } = sel
        if (!empty || $from.parent.type.name !== "paragraph" || $from.parent.textContent !== "$$") return false
        return insertMath(editor, { from: $from.start(), to: $from.end() }, true)
      },
    }
  },

  addInputRules() {
    const editor = this.editor
    const inlineType = () => editor.schema.nodes[INLINE_MATH]
    return [
      new InputRule({
        find: findDoubleDollar,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, inlineType().create({ latex: match.data?.latex as string }))
        },
      }),
      new InputRule({
        find: findInlineDollar,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, inlineType().create({ latex: match.data?.latex as string }))
        },
      }),
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.name !== "paragraph" || $from.depth < 1) return null
          // The line is "$$" and the space being typed: all of it goes.
          const pos = placeBlock(state.tr, { from: $from.start(), to: range.to }, editor.schema.nodes[BLOCK_MATH].create())
          state.tr.setSelection(NodeSelection.create(state.tr.doc, pos))
          // Open its editor once the change is in the doc.
          queueMicrotask(() => editMathAt(editor, pos))
        },
      }),
      // Typography and the Markdown marks stay out of an equation being typed.
      new InputRule({
        find: (text: string) => (GUARDED.test(text) && insideOpenMath(text.slice(0, -1)) ? { index: text.length - 1, text: text.slice(-1) } : null),
        handler: ({ state, range, match }) => {
          state.tr.insertText(match[0], range.from, range.to)
        },
      }),
    ]
  },
})
