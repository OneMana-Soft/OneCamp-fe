"use client"

import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import type { BlockRef } from "../block-commands/blocks"
import { blockUnder } from "../block-commands/blockUnder"
import { insertLine } from "../block-commands/commands"
import { requestBlockMenu } from "../block-commands/menuRequest"
import { BlockSelection, selectedBlocks } from "../block-selection/blockSelection"
import { DRAG_SLOP, draggedFor, firstLine, runBlockDrag } from "./blockDrag"

/**
 * THE BLOCK HANDLE (B1; editor.md P0-2, P0-3; small-details V1–V3, S6;
 * content.md D10). Two 24 px controls in the gutter of the block the pointer
 * is over, at any depth (a list item, a block in a callout or a column, an
 * image): "+" adds a line below (⌥-click: above) and opens "/"; "⋮⋮" opens
 * the block menu on a click and drags the block (blockDrag.ts) when pressed
 * and moved.
 *
 * It follows the pointer, read once a frame, and centres on the block's
 * first line. It glides between blocks (120 ms) and stays inside the doc's
 * pane. It goes while you type (so a keystroke reads no layout, I20), while a
 * mouse button is down in the text (a text selection being dragged), and 200
 * ms after the pointer leaves. There is no handle for a finger: a phone
 * long-presses a block instead (blockKeys.ts).
 */

const PLUS_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
const GRIP_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="4.5" cy="3" r="1.25" fill="currentColor"/><circle cx="4.5" cy="7" r="1.25" fill="currentColor"/><circle cx="4.5" cy="11" r="1.25" fill="currentColor"/><circle cx="9.5" cy="3" r="1.25" fill="currentColor"/><circle cx="9.5" cy="7" r="1.25" fill="currentColor"/><circle cx="9.5" cy="11" r="1.25" fill="currentColor"/></svg>`

/** The handle's size: two 24 px buttons 2 px apart. */
const HANDLE_WIDTH = 50
const BUTTON = 24

/**
 * What sits outside a block on its start side, for the handle to clear: a
 * list's marker (the list's 24 px inset), and a table's row grip (9 px out
 * from its edge, 18 wide: simple-table/tableEditing.ts), which the handle,
 * at a table's first line since it takes the table from inside its cells,
 * would otherwise touch.
 */
const MARKER: Record<string, number> = { listItem: 24, table: 12 }

/**
 * Where the handle goes for a block: centred on its first line, 4 px clear of
 * its start (and of a list item's marker), kept inside the doc's pane. A
 * right-to-left block has it on its right. Pure.
 */
function handleSpot(
  box: { left: number; right: number },
  line: { top: number; bottom: number },
  pane: { left: number; right: number } | null,
  rtl: boolean,
  marker: number,
): { x: number; y: number } {
  const y = Math.round((line.top + line.bottom) / 2 - BUTTON / 2)
  if (rtl) {
    let x = box.right + marker + 4
    if (pane) x = Math.min(x, pane.right - HANDLE_WIDTH - 2)
    return { x: Math.round(x), y }
  }
  let x = box.left - marker - HANDLE_WIDTH - 4
  if (pane) x = Math.max(x, pane.left + 2)
  return { x: Math.round(x), y }
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function button(className: string, label: string, title: string, svg: string): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.className = className
  b.tabIndex = -1
  b.setAttribute("aria-label", label)
  b.title = title
  b.innerHTML = svg
  return b
}

/**
 * Where the pointer rests over an editor whose handle was showing (or about to)
 * when its plugin view went. A plugin added or removed while the doc is open
 * makes every plugin view again (the doc's own editor never has one added:
 * registry/factory.ts), and the new handle shows where the old one was, with
 * no move of the pointer.
 */
const stillPointer = new WeakMap<EditorView, { x: number; y: number }>()

/** The handle's DOM and what it does, for one editor. */
class HandleView {
  readonly root: HTMLElement
  readonly plus: HTMLButtonElement
  readonly grip: HTMLButtonElement
  private block: BlockRef | null = null
  private pointer: { x: number; y: number } | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private frame = 0
  private pressed = false
  private dragging = false
  private readonly resize: ResizeObserver | null
  private readonly off: Array<() => void> = []

  constructor(
    private view: EditorView,
    private editor: Editor,
  ) {
    this.root = document.createElement("div")
    this.root.className = "block-handle-floating"
    this.root.dataset.visible = "false"
    this.root.setAttribute("contenteditable", "false")
    this.plus = button("block-handle-btn", "Add block", `Click to add a block below\n${isMac() ? "⌥" : "Alt"}-click to add one above`, PLUS_SVG)
    this.grip = button("block-handle-btn block-handle-grip", "Drag to move or click for options", "Drag to move\nClick for options", GRIP_SVG)
    this.grip.setAttribute("aria-haspopup", "menu")
    this.root.append(this.plus, this.grip)
    document.body.append(this.root)

    const dom = view.dom as HTMLElement
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts))
    }
    // Heard on the document, for the pane the editor is in when the pointer
    // moves: the editor is made out of the page and put in it a moment later
    // (or moved, as split view does), so a pane read here, when the view is
    // made, would be one it has left.
    let inside = false
    on(document, "pointermove", (e) => {
      const area = this.area()
      const now = !!area && area.contains(e.target as Node)
      if (now) this.onMove(e)
      else if (inside) this.hideSoon()
      inside = now
    }, { passive: true })
    on(document.documentElement, "pointerleave", () => {
      if (inside) this.hideSoon()
      inside = false
    })
    on(document, "scroll", (e) => {
      if (e.target === this.area()) this.hideNow()
    }, { capture: true, passive: true })
    on(dom, "mousedown", (e) => {
      if (e.button === 0) {
        this.pressed = true
        this.hideNow()
      }
    })
    on(window, "mouseup", () => {
      this.pressed = false
    })
    on(this.root, "pointerenter", () => this.keep())
    on(this.root, "pointerleave", () => this.hideSoon())
    on(this.plus, "mousedown", (e) => e.preventDefault())
    on(this.plus, "click", (e) => this.add(e.altKey))
    on(this.grip, "pointerdown", (e) => this.press(e))
    // Hiding or resizing the editor scrolls nothing: the handle goes with it.
    // Only a change of size: the observer also reports the size it starts with.
    let size = ""
    this.resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(([entry]) => {
            const now = `${entry.contentRect.width}x${entry.contentRect.height}`
            if (now === size) return
            const was = size
            size = now
            if (was) this.hideNow()
          })
    this.resize?.observe(dom)

    const still = stillPointer.get(view)
    stillPointer.delete(view)
    if (still && editor.isEditable) {
      this.pointer = still
      this.frame = requestAnimationFrame(() => this.track())
    }
  }

  /** The doc's pane the editor is in now (the gutter is in it), or its parent; none while it is out of the page. */
  private area(): HTMLElement | null {
    const dom = this.view.dom as HTMLElement
    if (!dom.isConnected) return null
    return (dom.closest(".doc-scroll") as HTMLElement | null) ?? dom.parentElement
  }

  /** The block under the handle, if it is still the one it was shown for. */
  private target(): BlockRef | null {
    const b = this.block
    if (!b) return null
    return this.view.state.doc.nodeAt(b.pos) === b.node ? b : null
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType === "touch" || this.pressed || this.dragging || !this.editor.isEditable) return
    // The grip between two columns is theirs: the handle steps aside for a resize.
    if ((e.target as Element | null)?.closest?.(".doc-column-grip")) return this.hideNow()
    this.pointer = { x: e.clientX, y: e.clientY }
    if (!this.frame) this.frame = requestAnimationFrame(() => this.track())
  }

  /** The block under the pointer, read once a frame. */
  private track() {
    this.frame = 0
    const p = this.pointer
    if (!p || this.view.isDestroyed) return
    const dom = this.view.dom as HTMLElement
    const box = dom.getBoundingClientRect()
    if (p.y < box.top - 4 || p.y > box.bottom + 4) return this.hideSoon()
    // The gutter too: the handle stays while the pointer goes to it.
    const block = blockUnder(this.view, p.x, p.y)
    if (!block) return this.hideSoon()
    if (this.root.dataset.visible === "true" && this.block?.pos === block.pos && this.block.node === block.node) return this.keep()
    this.show(block)
  }

  private show(block: BlockRef) {
    const el = this.view.nodeDOM(block.pos) as HTMLElement | null
    // An editor out of sight (set aside by Focus, a hidden tab) has no box.
    if (!el || !el.isConnected || el.getClientRects().length === 0) return this.hideNow()
    const line = firstLine(this.view, block)
    if (!line) return this.hideNow()
    const box = el.getBoundingClientRect()
    const rtl = getComputedStyle(el).direction === "rtl"
    const spot = handleSpot(box, line, this.area()?.getBoundingClientRect() ?? null, rtl, MARKER[block.node.type.name] ?? 0)
    this.keep()
    // Gliding from one block to the next; appearing in place.
    this.root.dataset.glide = this.root.dataset.visible === "true" ? "true" : "false"
    this.root.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`
    this.root.dataset.visible = "true"
    this.block = block
  }

  private keep() {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private hideSoon() {
    if (this.hideTimer || this.root.dataset.visible !== "true") return
    this.hideTimer = setTimeout(() => this.hideNow(), 200)
  }

  hideNow() {
    this.keep()
    this.root.dataset.visible = "false"
    this.block = null
  }

  /** "+": an empty line below the block (⌥: above), and "/" in it. */
  private add(above: boolean) {
    const block = this.target()
    if (!block || !this.editor.isEditable) return
    const tr = insertLine(this.view.state, block, above)
    if (!tr) return
    this.view.dispatch(tr)
    this.editor.chain().focus().insertContent("/").run()
    this.hideNow()
  }

  /** ⋮⋮ pressed: a click opens the block menu; moved past the slop, it drags. */
  private press(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const block = this.target()
    if (!block) return
    const start = { x: e.clientX, y: e.clientY }
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_SLOP) return
      stop()
      this.drag(block, start)
    }
    const up = () => {
      stop()
      this.openMenu(block)
    }
    const stop = () => {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", up, true)
    }
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", up, true)
  }

  private drag(block: BlockRef, start: { x: number; y: number }) {
    if (!this.editor.isEditable) return
    const dragged = draggedFor(block, selectedBlocks(this.view.state))
    const first = this.view.nodeDOM(dragged[0].pos) as HTMLElement | null
    const left = first?.getBoundingClientRect?.().left ?? start.x
    this.dragging = true
    this.hideNow()
    runBlockDrag({
      view: this.view,
      dragged,
      startX: start.x,
      startY: start.y,
      blockLeft: left,
      onEnd: () => {
        this.dragging = false
      },
    })
  }

  /** The block menu for the block (or the chosen blocks it is one of), which shows chosen while it is up. */
  private openMenu(block: BlockRef) {
    const { state } = this.view
    const chosen = selectedBlocks(state)
    const blocks = chosen && chosen.some((b) => b.pos === block.pos) ? chosen : [block]
    const sel = new BlockSelection(state.doc, blocks.map((b) => b.pos))
    if (!sel.eq(state.selection)) this.view.dispatch(state.tr.setSelection(sel))
    const r = this.grip.getBoundingClientRect()
    requestBlockMenu(this.editor, { blocks: blocks.map((b) => b.pos), anchor: { left: r.left, top: r.top, bottom: r.bottom }, via: "handle" })
  }

  update(view: EditorView, prev: EditorState) {
    this.view = view
    if (view.state.doc === prev.doc || this.dragging) return
    // A collaborator's edit: the handle keeps to the block under the pointer.
    // An edit of your own: it goes until the pointer moves (no layout read per key).
    if (blockHandleKey.getState(view.state)?.remote && this.root.dataset.visible === "true") {
      if (!this.frame) this.frame = requestAnimationFrame(() => this.track())
    } else {
      this.hideNow()
    }
  }

  destroy() {
    if (this.pointer && !this.dragging && (this.root.dataset.visible === "true" || this.frame)) stillPointer.set(this.view, this.pointer)
    else stillPointer.delete(this.view)
    cancelAnimationFrame(this.frame)
    this.keep()
    for (const off of this.off) off()
    this.resize?.disconnect()
    this.root.remove()
  }
}

const blockHandleKey = new PluginKey<{ remote: boolean }>("blockHandle")

export const BlockHandle = Extension.create({
  name: "blockHandle",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: blockHandleKey,
        state: {
          init: () => ({ remote: false }),
          // Whether the last change came from a collaborator (y-prosemirror marks those).
          apply: (tr, was) => (tr.docChanged ? { remote: !!(tr.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin } : was),
        },
        view(view) {
          const handle = new HandleView(view, editor)
          return {
            update: (v, prev) => handle.update(v, prev),
            destroy: () => handle.destroy(),
          }
        },
      }),
    ]
  },
})
