"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { CornerUpLeft } from "@/lib/icons"
import { inAppPath } from "@/lib/utils/useInternalLinkRouter"
import { jumpToBlock, parseBlockLink } from "./blockLink"
import { reducedMotion } from "../block-commands/effects"

/**
 * FOLLOWING LINKS TO BLOCKS (B1; small-details S12). A doc opened at
 * …#block-<id> scrolls the block to the middle and flashes it in the hue it
 * was sent in, once the live copy holds it. A reader's click on a link to a
 * block of the same doc jumps there without leaving the page, and a "Back to
 * where you were" chip takes them back to where they were reading (12 s, or
 * until used). In the editable text a click edits, as everywhere; ⌘-click
 * opens the link.
 */

/** How long an opened doc waits for the block a link names (its live copy may still be on its way). */
const ARRIVAL_MS = 15_000

/** The scrolling pane around the editor. */
const paneOf = (editor: Editor) => (editor.view.dom as HTMLElement).closest(".doc-scroll") as HTMLElement | null

export function useBlockLinks(editor: Editor | null, docId: string): React.ReactNode {
  const [back, setBack] = React.useState<{ top: number; left: number } | null>(null)

  // Arrival: the address names a block.
  React.useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const started = Date.now()
    const seek = () => {
      timer = null
      const link = parseBlockLink(window.location.hash)
      if (!link || editor.isDestroyed) return
      if (jumpToBlock(editor, link.blockId, link.hue)) return
      if (Date.now() - started < ARRIVAL_MS) timer = setTimeout(seek, 300)
    }
    seek()
    const onHash = () => {
      if (timer) clearTimeout(timer)
      seek()
    }
    window.addEventListener("hashchange", onHash)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener("hashchange", onHash)
    }
  }, [editor])

  // A reader's click on a link to a block of this doc.
  React.useEffect(() => {
    if (!editor) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a")
      if (!a) return
      // In the editable text a click edits (link.ts).
      if (editor.isEditable && editor.view.dom.contains(a)) return
      const path = inAppPath(a.getAttribute("href") || "")
      if (!path) return
      const url = new URL(path, window.location.origin)
      const link = url.pathname === `/app/doc/${docId}` ? parseBlockLink(url.hash) : null
      if (!link) return
      const pane = paneOf(editor)
      const top = pane?.scrollTop ?? 0
      if (!jumpToBlock(editor, link.blockId, link.hue)) return
      e.preventDefault()
      e.stopPropagation()
      window.history.replaceState(window.history.state, "", url.hash)
      const box = pane?.getBoundingClientRect()
      setBack({ top, left: box ? box.left + box.width / 2 : window.innerWidth / 2 })
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [editor, docId])

  React.useEffect(() => {
    if (!back) return
    const t = setTimeout(() => setBack(null), 12_000)
    return () => clearTimeout(t)
  }, [back])

  if (!back || !editor) return null
  // Centred on the doc's pane, above the phone's bar when it shows.
  return (
    <div style={{ left: back.left }} className="fixed bottom-[calc(24px+var(--mobile-drawer-h,0px))] z-[var(--z-sticky)] -translate-x-1/2">
      <button
        type="button"
        data-block-back=""
        onClick={() => {
          paneOf(editor)?.scrollTo({ top: back.top, behavior: reducedMotion() ? "auto" : "smooth" })
          setBack(null)
        }}
        className="content-float inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-ui-sm font-medium text-ink-2 pop-surface outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
      >
        <CornerUpLeft aria-hidden="true" className="size-3.5" />
        Back to where you were
      </button>
    </div>
  )
}
