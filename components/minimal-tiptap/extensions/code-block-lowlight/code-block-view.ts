"use client"

/**
 * A doc's code block, drawn in plain DOM (docs programme B3, editor.md P1-8):
 * the language at its top left, with every language behind it; Wrap, Caption
 * and Copy at its top right; the caption under it; and for Mermaid the
 * diagram, as Code, Split or Preview.
 *
 * Only the source is stored (I5). The language, Wrap and the caption are the
 * block's attributes; the diagram is drawn in each reader's browser, in their
 * theme; and Code, Split or Preview is each reader's own choice, kept on their
 * device. A Mermaid block shows its diagram until someone puts the caret in
 * it, and then its code beside the diagram.
 *
 * What a person can do here they can also do from the keyboard, through the
 * block's actions (technical/actions.ts): the language list, Wrap, Copy and
 * the caption.
 */

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { Decoration, NodeView, ViewMutationRecord } from "@tiptap/pm/view"
import { toast } from "@/hooks/use-toast"
import { glyph, type GlyphName } from "@/components/docEditor/technical/glyphs"
import { languageLabel, MERMAID } from "./languages"

export type DiagramMode = "code" | "split" | "preview"

const MODES: Array<[DiagramMode, string]> = [
  ["code", "Code"],
  ["split", "Split"],
  ["preview", "Preview"],
]

const MODE_KEY = "onecamp-doc-diagram-views"
/** The most blocks whose view is remembered; the oldest choice goes first. */
const MODES_KEPT = 200

function readModes(): Record<string, DiagramMode> {
  try {
    const v = JSON.parse(localStorage.getItem(MODE_KEY) || "{}")
    return v && typeof v === "object" ? (v as Record<string, DiagramMode>) : {}
  } catch {
    return {}
  }
}

/** The view this person chose for a diagram, on this device. */
export function chosenMode(blockId: string | null): DiagramMode | null {
  if (!blockId) return null
  const m = readModes()[blockId]
  return m === "code" || m === "split" || m === "preview" ? m : null
}

function rememberMode(blockId: string, mode: DiagramMode) {
  try {
    const all = readModes()
    delete all[blockId]
    all[blockId] = mode
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - MODES_KEPT))) delete all[k]
    localStorage.setItem(MODE_KEY, JSON.stringify(all))
  } catch {
    // Private mode or full: the choice lasts this visit.
  }
}

/** Writes text to the clipboard; false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Without a secure context there is no clipboard API: the old way.
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0"
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand("copy")
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, attrs: Record<string, string> = {}) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

function iconButton(label: string, icon: GlyphName): HTMLButtonElement {
  const b = el("button", "doc-code-act", { type: "button", "aria-label": label, title: label })
  b.append(glyph(icon, 14))
  // The caret stays in the text: a click here is not a click in the doc.
  b.addEventListener("mousedown", (e) => e.preventDefault())
  return b
}

const views = new WeakMap<Element, CodeBlockView>()

/** The view of the code block at a position (what the block menu's actions act through). */
export function codeViewAt(editor: Editor, pos: number): CodeBlockView | null {
  const dom = editor.view.nodeDOM(pos)
  return dom instanceof Element ? (views.get(dom) ?? null) : null
}

export class CodeBlockView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private node: PMNode
  private readonly pre: HTMLElement
  private readonly bar: HTMLElement
  private readonly lang: HTMLButtonElement
  private readonly langText: HTMLElement
  private readonly modes: HTMLElement
  private readonly wrapButton: HTMLButtonElement
  private readonly captionButton: HTMLButtonElement
  private readonly copyButton: HTMLButtonElement
  private readonly live: HTMLElement
  private readonly diagram: HTMLElement
  private readonly captionBox: HTMLElement
  private caretIn = false
  private editingCaption = false
  private drawTimer: ReturnType<typeof setTimeout> | null = null
  private copiedTimer: ReturnType<typeof setTimeout> | null = null
  /** Draws asked for, so an answer that arrives after a newer one is dropped. */
  private drawSeq = 0
  private drawnSource: string | null = null
  private drawnTheme: string | null = null
  private visible = false
  private observer: IntersectionObserver | null = null
  private themeWatch: MutationObserver | null = null
  private closePicker: (() => void) | null = null
  /** What the bar and the caption show now: they are drawn again only when it changes, never per key. */
  private shown = ""

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node
    this.dom = el("div", "doc-code")
    this.bar = el("div", "doc-code-bar", { contenteditable: "false" })

    this.lang = el("button", "doc-code-lang", { type: "button", "aria-haspopup": "dialog" })
    this.lang.addEventListener("mousedown", (e) => e.preventDefault())
    this.lang.addEventListener("click", () => this.openLanguages())
    this.langText = el("span", "doc-code-lang")

    this.modes = el("div", "doc-code-modes", { role: "group", "aria-label": "Diagram view" })
    for (const [mode, label] of MODES) {
      const b = el("button", "doc-code-mode", { type: "button", "data-mode": mode, "aria-pressed": "false" })
      b.textContent = label
      b.addEventListener("mousedown", (e) => e.preventDefault())
      b.addEventListener("click", () => this.choose(mode))
      this.modes.append(b)
    }

    this.wrapButton = iconButton("Wrap lines", "wrap")
    this.wrapButton.addEventListener("click", () => this.toggleWrap())
    this.captionButton = iconButton("Add a caption", "caption")
    this.captionButton.addEventListener("click", () => this.editCaption())
    this.copyButton = iconButton("Copy code", "copy")
    this.copyButton.addEventListener("click", () => void this.copy())
    this.live = el("span", "sr-only", { "aria-live": "polite" })

    this.bar.append(this.lang, this.langText, this.modes, el("span", "doc-code-spacer"), this.wrapButton, this.captionButton, this.copyButton, this.live)

    const body = el("div", "doc-code-body")
    this.pre = el("pre", "block-node")
    this.contentDOM = el("code")
    this.pre.append(this.contentDOM)
    this.diagram = el("div", "doc-code-diagram", { contenteditable: "false", role: "figure", "aria-label": "Diagram" })
    body.append(this.pre, this.diagram)

    this.captionBox = el("div", "doc-code-caption", { contenteditable: "false" })
    // The sunken box holds the bar and the code; the caption sits under it.
    const box = el("div", "doc-code-box")
    box.append(this.bar, body)
    this.dom.append(box, this.captionBox)
    views.set(this.dom, this)
    this.render()
  }

  private get language(): string | null {
    return (this.node.attrs.language as string | null) || null
  }

  private get isDiagram() {
    return this.language === MERMAID
  }

  private get blockId(): string | null {
    return (this.node.attrs.blockId as string | null) ?? null
  }

  /** The diagram's view now: the reader's choice, the code beside it while the caret is in it. */
  get mode(): DiagramMode {
    const chosen = chosenMode(this.blockId) ?? this.sessionMode
    if (this.caretIn && this.editor.isEditable && (chosen ?? "preview") === "preview") return "split"
    return chosen ?? "preview"
  }

  /** A choice made for a block with no id yet, for this visit. */
  private sessionMode: DiagramMode | null = null

  private render(force = false) {
    const editable = this.editor.isEditable
    const language = this.language
    const mode = this.isDiagram ? this.mode : ""
    const shows = [language, !!this.node.attrs.wrap, this.node.attrs.caption ?? "", editable, mode].join("\u0001")
    if (!force && shows === this.shown) {
      // Only the text changed (a key): a diagram is drawn again once typing pauses.
      this.scheduleDraw()
      return
    }
    this.shown = shows
    const label = languageLabel(language)
    this.dom.dataset.language = language ?? ""
    this.dom.toggleAttribute("data-wrap", !!this.node.attrs.wrap)
    this.contentDOM.className = language && !this.isDiagram ? `language-${language}` : ""

    // A reader sees the language as words; a writer gets the list behind it.
    this.lang.hidden = !editable
    this.langText.hidden = editable
    this.lang.textContent = label
    this.lang.append(glyph("chevronDown", 12))
    this.lang.setAttribute("aria-label", `Language: ${label}. Change the language`)
    this.langText.textContent = label

    this.modes.hidden = !this.isDiagram
    this.dom.dataset.mode = mode
    for (const b of Array.from(this.modes.children) as HTMLButtonElement[]) b.setAttribute("aria-pressed", String(b.dataset.mode === mode))

    this.wrapButton.hidden = !editable || this.isDiagram
    this.wrapButton.setAttribute("aria-pressed", String(!!this.node.attrs.wrap))
    this.captionButton.hidden = !editable || !!this.node.attrs.caption || this.editingCaption
    this.renderCaption()
    if (this.isDiagram) this.watch()
    else {
      this.unwatch()
      this.diagram.replaceChildren()
      this.drawnSource = null
    }
    this.scheduleDraw()
  }

  private renderCaption() {
    if (this.editingCaption) return
    const caption = (this.node.attrs.caption as string | null) ?? ""
    this.captionBox.replaceChildren()
    this.captionBox.hidden = !caption
    if (!caption) return
    if (!this.editor.isEditable) {
      this.captionBox.textContent = caption
      return
    }
    this.captionBox.append(this.captionInput(caption))
  }

  private captionInput(value: string): HTMLInputElement {
    const input = el("input", "doc-code-caption-input", { type: "text", "aria-label": "Caption", placeholder: "Write a caption", maxlength: "300" })
    input.value = value
    let done = false
    const finish = (keep: boolean) => {
      if (done) return
      done = true
      this.editingCaption = false
      if (keep) this.setAttr("caption", input.value.trim() || null)
      // Drawn again even when nothing changed: an empty new caption goes.
      this.render(true)
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        finish(true)
        this.focusEnd()
      } else if (e.key === "Escape") {
        e.preventDefault()
        finish(false)
        this.focusEnd()
      }
    })
    input.addEventListener("focus", () => (this.editingCaption = true))
    input.addEventListener("blur", () => finish(true))
    return input
  }

  /** Opens the caption under the block, ready to type in. */
  editCaption() {
    if (!this.editor.isEditable) return
    const input = this.captionInput((this.node.attrs.caption as string | null) ?? "")
    this.editingCaption = true
    this.captionBox.replaceChildren(input)
    this.captionBox.hidden = false
    this.captionButton.hidden = true
    input.focus()
  }

  private focusEnd() {
    const pos = this.getPos()
    if (pos == null) return
    this.editor.chain().focus().setTextSelection(pos + this.node.nodeSize - 1).run()
  }

  private setAttr(name: string, value: unknown) {
    const pos = this.getPos()
    if (pos == null || !this.editor.isEditable) return
    const now = this.editor.state.doc.nodeAt(pos)
    if (!now || now.type !== this.node.type || now.attrs[name] === value) return
    this.editor.view.dispatch(this.editor.state.tr.setNodeAttribute(pos, name, value))
  }

  toggleWrap() {
    this.setAttr("wrap", !this.node.attrs.wrap)
  }

  /** Opens the language list under the block's language (it loads on first use). */
  openLanguages() {
    if (!this.editor.isEditable) return
    const current = this.language
    void import("@/components/docEditor/technical/LanguagePicker").then(({ openLanguagePicker }) => {
      if (!this.dom.isConnected) return
      this.closePicker = openLanguagePicker(this.lang, current, (id) => this.setAttr("language", id), () => this.editor.commands.focus())
    })
  }

  async copy() {
    const ok = await copyText(this.node.textContent)
    if (!ok) {
      toast({ title: "Couldn't copy the code", description: "Select it and press Ctrl+C or ⌘C.", variant: "destructive" })
      return
    }
    this.copyButton.replaceChildren(glyph("check", 14))
    this.copyButton.dataset.copied = ""
    this.copyButton.setAttribute("aria-label", "Copied")
    this.live.textContent = "Copied"
    if (this.copiedTimer) clearTimeout(this.copiedTimer)
    this.copiedTimer = setTimeout(() => {
      this.copyButton.replaceChildren(glyph("copy", 14))
      delete this.copyButton.dataset.copied
      this.copyButton.setAttribute("aria-label", "Copy code")
      this.live.textContent = ""
    }, 1200)
  }

  private choose(mode: DiagramMode) {
    const id = this.blockId
    if (id) rememberMode(id, mode)
    else this.sessionMode = mode
    this.render()
  }

  // ---- the diagram: drawn when it shows, near the screen, once typing pauses ----

  private watch() {
    if (!this.observer && typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting)
        if (this.visible) this.scheduleDraw(0)
      }, { rootMargin: "400px 0px" })
      this.observer.observe(this.dom)
    } else if (typeof IntersectionObserver === "undefined") this.visible = true
    if (!this.themeWatch && typeof MutationObserver !== "undefined") {
      // The page's theme changed: the diagram is drawn again in it.
      this.themeWatch = new MutationObserver(() => this.scheduleDraw(0))
      this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    }
  }

  private unwatch() {
    this.observer?.disconnect()
    this.observer = null
    this.themeWatch?.disconnect()
    this.themeWatch = null
  }

  private scheduleDraw(delay = 300) {
    if (!this.isDiagram || this.mode === "code" || !this.visible) return
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
    if (this.drawnSource === this.node.textContent && this.drawnTheme === theme) return
    if (this.drawTimer) clearTimeout(this.drawTimer)
    this.drawTimer = setTimeout(() => void this.draw(), delay)
  }

  private async draw() {
    this.drawTimer = null
    const source = this.node.textContent
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
    const mine = ++this.drawSeq
    if (!source.trim()) {
      this.drawnSource = source
      this.drawnTheme = theme
      this.diagram.replaceChildren(Object.assign(el("p", "doc-code-diagram-note"), { textContent: "Write a diagram in Mermaid, and it shows here." }))
      return
    }
    let out: { svg: string } | { error: string }
    try {
      const { renderMermaid } = await import("./mermaid")
      out = await renderMermaid(source)
    } catch {
      out = { error: "The diagram couldn't load. Check your connection, then type in the block to try again." }
    }
    // A newer draw started, or the block went: this one is stale.
    if (mine !== this.drawSeq || !this.dom.isConnected) return
    this.drawnSource = source
    this.drawnTheme = theme
    if ("svg" in out) {
      this.diagram.innerHTML = out.svg
      this.diagram.removeAttribute("data-error")
    } else {
      const note = el("p", "doc-code-diagram-note", { role: "status" })
      note.textContent = `The diagram has a mistake: ${out.error}`
      this.diagram.replaceChildren(note)
      this.diagram.setAttribute("data-error", "")
    }
  }

  // ---- ProseMirror ----

  update(node: PMNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false
    const caret = decorations.some((d) => (d.spec as { caretIn?: boolean }).caretIn)
    const changed = node !== this.node || caret !== this.caretIn
    this.node = node
    this.caretIn = caret
    if (changed) this.render()
    return true
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }

  /** The bar, the diagram and the caption handle their own events; the code is the editor's. */
  stopEvent(event: Event): boolean {
    const t = event.target as Node | null
    return !!t && this.dom.contains(t) && !this.pre.contains(t)
  }

  ignoreMutation(m: ViewMutationRecord): boolean {
    if (m.type === "selection") return !this.contentDOM.contains(m.target)
    if (m.type === "attributes" && m.target === this.contentDOM) return true
    return !this.contentDOM.contains(m.target)
  }

  destroy() {
    views.delete(this.dom)
    this.unwatch()
    if (this.drawTimer) clearTimeout(this.drawTimer)
    if (this.copiedTimer) clearTimeout(this.copiedTimer)
    this.closePicker?.()
  }
}
