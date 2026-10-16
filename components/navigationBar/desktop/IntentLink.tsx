"use client"

import Link from "next/link"
import { forwardRef, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type PointerEvent } from "react"

/**
 * A sidebar link that prefetches its route on intent, not on sight.
 *
 * Every sidebar link prefetched its whole route as soon as it was on screen,
 * so opening Home loaded the code of every place in the sidebar, about
 * 1.75 MB gzip on a cold cache, most of it for pages nobody opened. A desktop
 * gives notice before a click: the pointer comes over the link, or the
 * keyboard reaches it, a few hundred milliseconds ahead. The route is fetched
 * then, as fully as before. A touch on a tablet counts too, since it lands
 * before the click.
 *
 * A link to a doc does more with the notice (docs programme A2): after the
 * pointer has rested 100 ms, or at once on a touch, a focus or the press
 * itself, it fetches the doc's details and starts the doc's live session
 * (lib/docPrefetch.ts), so the page opens on a synced copy. That code loads
 * only then, never with the sidebar.
 *
 * The phone's tab bar keeps prefetching on sight: a thumb gives no notice.
 */

/** How long the pointer rests on a doc link before the doc is prefetched. */
export const DOC_INTENT_MS = 100

const DOC_HREF = /^(?:https?:\/\/[^/]+)?\/app\/doc\/([0-9a-zA-Z][0-9a-zA-Z-]{7,})(?:[/?#]|$)/

/** The doc a link opens, or null for any other place. */
export function docIdOfHref(href: unknown): string | null {
  const path = typeof href === "string" ? href : href && typeof href === "object" && "pathname" in href ? String((href as { pathname?: unknown }).pathname ?? "") : ""
  const m = DOC_HREF.exec(path)
  return m ? m[1] : null
}

/** Prefetches a doc's details and session, loading that code on first use. */
export function prefetchDocOnIntent(docId: string): void {
  void import("@/lib/docPrefetch").then((m) => m.prefetchDoc(docId)).catch(() => {})
}

/**
 * A doc's prefetch on intent, for whatever opens it: after the pointer has
 * rested DOC_INTENT_MS, or at once on a touch, a focus or the press itself
 * (the press comes before the click and before the route's code loads, so
 * the doc connects while the page is on its way). Nothing for no doc.
 */
export function useDocIntent(docId: string | null) {
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (rest.current && clearTimeout(rest.current)), [])
  return useMemo(() => {
    const settle = () => {
      if (rest.current) clearTimeout(rest.current)
      rest.current = null
    }
    const now = () => {
      settle()
      if (docId) prefetchDocOnIntent(docId)
    }
    return {
      onPointerEnter: (e: PointerEvent) => {
        if (!docId || e.pointerType === "touch") return
        settle()
        rest.current = setTimeout(now, DOC_INTENT_MS)
      },
      onPointerLeave: settle,
      onFocus: now,
      onTouchStart: now,
      onPointerDown: now,
    }
  }, [docId])
}

export const IntentLink = forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<typeof Link>, "prefetch">>(
  function IntentLink({ onPointerEnter, onPointerLeave, onFocus, onTouchStart, onPointerDown, ...props }, ref) {
    // Once wanted, it stays wanted: the route is in the cache from then on.
    const [intent, setIntent] = useState(false)
    const doc = useDocIntent(docIdOfHref(props.href))
    return (
      <Link
        ref={ref}
        {...props}
        prefetch={intent}
        data-prefetch={intent ? "intent" : "off"}
        onPointerEnter={(e) => {
          setIntent(true)
          doc.onPointerEnter(e)
          onPointerEnter?.(e)
        }}
        onPointerLeave={(e) => {
          doc.onPointerLeave()
          onPointerLeave?.(e)
        }}
        onFocus={(e) => {
          setIntent(true)
          doc.onFocus()
          onFocus?.(e)
        }}
        onTouchStart={(e) => {
          setIntent(true)
          doc.onTouchStart()
          onTouchStart?.(e)
        }}
        onPointerDown={(e) => {
          doc.onPointerDown()
          onPointerDown?.(e)
        }}
      />
    )
  },
)
