"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { docHeadings, goToHeading, onDocHeadings, type DocHeading } from "@/components/minimal-tiptap/extensions/toc/headings"

/**
 * THE FLOATING OUTLINE (B2; editor.md P1-11, small-details V30): a doc with
 * three headings or more, on a screen 1,280 px wide or wider, shows a rail of
 * short lines in the margin right of the text, one a heading, longest for an
 * H1. Hovering or focusing it opens the headings by name; the one the reader
 * is at is marked as they scroll, and a click takes them there (opening the
 * toggles that hold it, for them alone). It sits over the doc's own margin
 * and is never drawn where there is no room for it.
 */

/** From this window width, and with this many headings or more. */
export const OUTLINE_MIN_WIDTH = 1280
export const OUTLINE_MIN_HEADINGS = 3
/** The room it needs right of the text: its rail and a margin either side. */
export const OUTLINE_ROOM = 56
/** The reader is at a heading once its top has passed this far down the doc's scroller. */
export const READ_LINE = 0.2

/** Which heading the reader is at: the last of those whose top has passed the read line; the first before any has. Pure. */
export function activeHeading(passed: boolean[]): number {
  return Math.max(0, passed.lastIndexOf(true))
}

/** Where the outline stands, or null when it doesn't show. Pure. */
export function outlinePlace(
  win: { width: number },
  scroller: { right: number; top: number },
  measure: { right: number } | null,
  headings: number,
): { right: number; top: number } | null {
  if (win.width < OUTLINE_MIN_WIDTH || headings < OUTLINE_MIN_HEADINGS || !measure) return null
  if (scroller.right - measure.right < OUTLINE_ROOM) return null
  return { right: win.width - scroller.right + 16, top: scroller.top + 96 }
}

const none: DocHeading[] = []

export default function DocOutline({ editor }: { docId: string; editor?: Editor | null }) {
  const headings = React.useSyncExternalStore(
    React.useCallback((done: () => void) => (editor ? onDocHeadings(editor, done) : () => {}), [editor]),
    () => (editor ? docHeadings(editor) : none),
    () => none,
  )
  const [place, setPlace] = React.useState<{ right: number; top: number } | null>(null)
  const [active, setActive] = React.useState(0)

  const scroller = React.useMemo(() => (editor?.view.dom.closest(".doc-scroll") as HTMLElement | null) ?? null, [editor])

  // Where it stands: read when the doc's pane or the window changes size, never on scroll.
  React.useEffect(() => {
    if (!scroller) return
    const measure = () => {
      const s = scroller.getBoundingClientRect()
      const m = scroller.querySelector(".doc-measure, .doc-measure-full")?.getBoundingClientRect() ?? null
      setPlace(outlinePlace({ width: window.innerWidth }, s, m, headings.length))
    }
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(scroller)
    window.addEventListener("resize", measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [scroller, headings.length])

  // The heading the reader is at: each heading crossing the read line is
  // heard as it crosses (no layout read as they scroll).
  React.useEffect(() => {
    if (!editor || !scroller || !place || typeof IntersectionObserver === "undefined") return
    const elements = headings.map((h) => editor.view.nodeDOM(h.pos) as Element | null)
    const passed = elements.map(() => false)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = elements.indexOf(e.target)
          if (i >= 0) passed[i] = e.isIntersecting
        }
        setActive(activeHeading(passed))
      },
      // Everything above the read line, however far it has scrolled away.
      { root: scroller, rootMargin: `100000px 0px -${(1 - READ_LINE) * 100}% 0px` },
    )
    for (const el of elements) if (el instanceof Element) io.observe(el)
    return () => io.disconnect()
  }, [editor, scroller, place, headings])

  if (!editor || !place) return null
  return (
    <nav aria-label="Outline" data-doc-outline="" className="doc-outline" style={{ right: place.right, top: place.top }}>
      <ul aria-hidden="true" className="doc-outline-rail">
        {headings.map((h, i) => (
          <li key={`${h.id ?? h.pos}-${i}`} data-level={h.level} data-active={i === active || undefined} />
        ))}
      </ul>
      <div className="doc-outline-panel">
        <ul>
          {headings.map((h, i) => (
            <li key={`${h.id ?? h.pos}-${i}`}>
              <button
                type="button"
                className="doc-outline-item"
                data-level={h.level}
                aria-current={i === active ? "location" : undefined}
                onClick={() => goToHeading(editor, h)}
              >
                {h.text || "Untitled heading"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
