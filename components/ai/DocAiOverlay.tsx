"use client"

/**
 * The doc AI bar's place over a doc's editor (docs programme B9; the shell's
 * 'editorOverlay' slot, AI edition only), once per editor, loaded with it.
 * It draws the bar while it is open: under the text it was asked about on a
 * wide screen, as a sheet on a phone. The bar's keys and pins are the
 * editor's own from when it was made (docAiPlugin.ts), and open the bar
 * through its store, which this reads. The bar itself loads the first time it
 * opens.
 *
 * It also keeps the selection the AI panel is opened on (the bus's aiRun), so
 * the panel's Replace lands on that text wherever edits moved it (N43).
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { NO_BUS, useDocBus } from "@/components/docEditor/registry/commandBus"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { aiBarOf, closeAiBar, panelPinOf, setPanelPin, subscribeAiBar, type BarRequest, type BarState } from "./docAiStore"
import { pinRange, unpin } from "./docAiPlugin"

const loadBar = () => import("./DocAiBar")
const DocAiBar = React.lazy(loadBar)

const CLOSED: BarState = { open: false, request: null, seq: 0 }
const noop = () => () => {}

export default function DocAiOverlay({ editor, docId }: SlotProps) {
  const bus = useDocBus()

  // The bar's code, fetched once the page is idle: keys pressed the moment
  // after ⌘J or a space reach the bar's field, not the doc.
  React.useEffect(() => {
    if (!editor) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    const fetchBar = () => void loadBar().catch(() => undefined)
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(fetchBar)
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(fetchBar, 2000)
    return () => window.clearTimeout(t)
  }, [editor])

  // The AI panel is opened on the selection: keep it.
  React.useEffect(() => {
    if (!editor || bus === NO_BUS) return
    return bus.on("aiRun", () => {
      if (editor.isDestroyed) return
      const old = panelPinOf(editor)
      if (old) unpin(editor, old)
      const { from, to } = editor.state.selection
      setPanelPin(editor, pinRange(editor, from, to))
    })
  }, [editor, bus])

  const subscribe = React.useCallback((l: () => void) => (editor ? subscribeAiBar(editor, l) : noop()), [editor])
  const state = React.useSyncExternalStore(subscribe, () => (editor ? aiBarOf(editor) : CLOSED), () => CLOSED)
  // A sheet on a phone, held either way (components/ui/overlayMode).
  const sheet = useSheetMode()

  if (!editor || !state.open || !state.request || !docId) return null
  const bar = (
    <React.Suspense fallback={null}>
      <DocAiBar key={state.seq} editor={editor} docId={docId} request={state.request} sheet={sheet} />
    </React.Suspense>
  )
  if (sheet) {
    return (
      <Drawer open detent="medium" onOpenChange={(open) => !open && closeAiBar(editor)}>
        <DrawerContent>
          <DrawerTitle className="sr-only">Ask AI</DrawerTitle>
          <DrawerDescription className="sr-only">Write, change or ask about this doc with AI.</DrawerDescription>
          {bar}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Placed editor={editor} request={state.request}>
      {bar}
    </Placed>
  )
}

/**
 * The bar under the text it is about, the width of the text column (at most
 * 640 px), above it when there's no room below; it follows the text as the
 * page scrolls. A click anywhere else closes it.
 */
function Placed({ editor, request, children }: { editor: Editor; request: BarRequest; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ left: number; top: number; width: number } | null>(null)

  const place = React.useCallback(() => {
    if (editor.isDestroyed) return
    const box = (editor.view.dom as HTMLElement).getBoundingClientRect()
    let top = request.anchor?.top ?? box.top
    let bottom = request.anchor?.bottom ?? box.top
    try {
      const c = editor.view.coordsAtPos(Math.min(request.to, editor.state.doc.content.size))
      top = c.top
      bottom = c.bottom
    } catch {
      // Kept where it was asked.
    }
    const width = Math.min(Math.max(320, box.width - 16), 640, window.innerWidth - 24)
    const left = Math.max(12, Math.min(box.left + 8, window.innerWidth - width - 12))
    const height = ref.current?.offsetHeight ?? 0
    const below = bottom + 6
    const y = height && below + height > window.innerHeight - 12 && top - 6 - height > 12 ? top - 6 - height : below
    setPos((p) => (p && p.left === left && p.top === y && p.width === width ? p : { left, top: Math.max(12, y), width }))
  }, [editor, request])

  React.useLayoutEffect(place, [place])
  React.useEffect(() => {
    const el = ref.current
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(place) : null
    if (el) ro?.observe(el)
    const away = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t || ref.current?.contains(t)) return
      // The review bar and menus the bar opened are its own.
      if ((t as Element).closest?.("[data-proposal-review], [role='listbox'], [data-radix-popper-content-wrapper]")) return
      closeAiBar(editor)
    }
    document.addEventListener("pointerdown", away, true)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      ro?.disconnect()
      document.removeEventListener("pointerdown", away, true)
    }
  }, [place, editor])

  return (
    <div
      ref={ref}
      data-doc-ai-place=""
      className="content-float fixed z-[var(--z-popover)]"
      // Unplaced for one frame: transparent, not hidden, so its field can take
      // the focus in the same frame.
      style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { opacity: 0, pointerEvents: "none", left: 0, top: 0 }}
    >
      {children}
    </div>
  )
}
