"use client"

/**
 * The word count chip (docs programme B3, editor.md P1-15): select text and
 * "12 words" shows at the bottom right of the doc; on a phone, just above
 * its bar. "/" Word count keeps the doc's own count there too ("12 of 1,204
 * words"), on this device, until its × is pressed; a click on the chip does
 * the same. Characters and the time to read are in its tooltip.
 *
 * Plain DOM, loaded the first time something is selected (technical/
 * blocks.ts watches the selection): the selection's text is read only when
 * it changes, the doc's only once typing pauses (I20).
 */

import type { Editor } from "@tiptap/core"
import { countDoc, countWords } from "./docCounts"
import { glyph } from "./technical/glyphs"

const KEY = "onecamp-doc-word-count"

let always: boolean | null = null

/** Whether the doc's count shows all the time, on this device. */
export function docCountOn(): boolean {
  if (always === null) {
    try {
      always = localStorage.getItem(KEY) === "1"
    } catch {
      always = false
    }
  }
  return always
}

const chips = new Set<Chip>()

/** Shows (or hides) the doc's count all the time, on this device. */
export function setDocCount(on: boolean) {
  always = on
  try {
    if (on) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: for this visit.
  }
  for (const c of chips) c.update(true)
}

const words = (n: number) => `${n.toLocaleString()} word${n === 1 ? "" : "s"}`

class Chip {
  private readonly el: HTMLElement
  private readonly label: HTMLButtonElement
  private readonly off: HTMLButtonElement
  private docWords = 0
  private docText = ""
  private timer: ReturnType<typeof setTimeout> | null = null
  private shown = false

  constructor(private readonly editor: Editor) {
    this.el = document.createElement("div")
    this.el.className = "doc-word-count"
    this.el.setAttribute("data-doc-word-count", "")
    this.label = this.el.appendChild(document.createElement("button"))
    this.label.type = "button"
    this.label.className = "doc-word-count-label"
    // A click here is not a click in the doc: the selection stays.
    this.label.addEventListener("mousedown", (e) => e.preventDefault())
    this.label.addEventListener("click", () => setDocCount(!docCountOn()))
    this.off = this.el.appendChild(document.createElement("button"))
    this.off.type = "button"
    this.off.className = "doc-word-count-off"
    this.off.setAttribute("aria-label", "Hide the word count")
    this.off.append(glyph("x", 12))
    this.off.addEventListener("mousedown", (e) => e.preventDefault())
    this.off.addEventListener("click", () => setDocCount(false))
    editor.on("update", this.onEdit)
    window.addEventListener("resize", this.place)
    chips.add(this)
  }

  private onEdit = () => {
    if (!docCountOn()) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.update(true), 400)
  }

  // The doc's column moves without the window resizing (the right panel opens
  // beside it, or over it as a sheet): the chip sat on the panel or the
  // comment box (QA DSA-20). It follows the doc's pane and the shell's right
  // edge (--shell-right-inset, the panel's width while it is open).
  private watch: { pane: ResizeObserver | null; shell: MutationObserver | null } = { pane: null, shell: null }

  private place = () => {
    if (!this.shown) return
    const paneEl = (this.editor.view.dom as HTMLElement).closest(".doc-scroll")
    const pane = paneEl?.getBoundingClientRect()
    const shell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--shell-right-inset")) || 0
    this.el.style.right = `${Math.max(12, window.innerWidth - (pane?.right ?? window.innerWidth) + 16, shell + 16)}px`
  }

  private follow() {
    const paneEl = (this.editor.view.dom as HTMLElement).closest(".doc-scroll")
    if (paneEl && typeof ResizeObserver !== "undefined") {
      this.watch.pane = new ResizeObserver(this.place)
      this.watch.pane.observe(paneEl)
    }
    if (typeof MutationObserver !== "undefined") {
      this.watch.shell = new MutationObserver(this.place)
      this.watch.shell.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] })
    }
  }

  private unfollow() {
    this.watch.pane?.disconnect()
    this.watch.shell?.disconnect()
    this.watch = { pane: null, shell: null }
  }

  /** Shows what's selected (and the doc's count, when it's kept on); hides when there's nothing to say. */
  update(docChanged = false) {
    if (this.editor.isDestroyed) return this.destroy()
    const { selection } = this.editor.state
    const slice = selection.empty ? null : selection.content().content
    const selText = slice ? slice.textBetween(0, slice.size, " ", " ") : ""
    const selected = selText ? countWords(selText) : 0
    const keep = docCountOn()
    if (keep && (docChanged || !this.docText)) {
      this.docText = this.editor.getText()
      this.docWords = countDoc(this.docText).words
    }
    if (!selected && !keep) return this.hide()
    const text = selected ? (keep ? `${selected.toLocaleString()} of ${words(this.docWords)}` : words(selected)) : words(this.docWords)
    const counts = countDoc(selected ? selText : this.docText)
    this.label.textContent = text
    this.label.title = `${words(counts.words)}, ${counts.chars.toLocaleString()} characters${counts.minutes ? `, ${counts.minutes} min read` : ""}`
    this.label.setAttribute("aria-label", `${text}${selected ? " selected" : " in this doc"}. ${keep ? "Hide the doc's count" : "Keep the doc's count showing"}`)
    this.off.hidden = !keep
    if (!this.shown) {
      this.shown = true
      document.body.appendChild(this.el)
      this.place()
      this.follow()
    }
  }

  private hide() {
    if (!this.shown) return
    this.shown = false
    this.unfollow()
    this.el.remove()
  }

  destroy() {
    this.hide()
    if (this.timer) clearTimeout(this.timer)
    this.editor.off("update", this.onEdit)
    window.removeEventListener("resize", this.place)
    chips.delete(this)
    byEditor.delete(this.editor)
  }
}

const byEditor = new WeakMap<Editor, Chip>()

/** The chip for an editor: one each, whoever asks first (the selection's watch, or "/" Word count). */
export function mountCount(editor: Editor): { update(): void; destroy(): void } {
  let chip = byEditor.get(editor)
  if (!chip) byEditor.set(editor, (chip = new Chip(editor)))
  return chip
}
