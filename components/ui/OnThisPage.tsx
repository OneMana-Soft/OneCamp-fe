"use client"

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { jumpTo, type Jump } from "@/components/admin/SectionJumps"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * "On this page" for a long section (design v3, admin A1): from 1280px up, a
 * 180px sticky list right of the column, 13/18 links in ink-3; the card in
 * view is ink at 510 with a 2 × 16px accent tick at its left, one element
 * moved on transform (220ms on the spring) as the page scrolls. Below 1280px
 * the page's header carries the same jumps as a menu.
 */
export function OnThisPageRail({ items, scrollRoot }: { items: Jump[]; scrollRoot: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(items[0]?.id)
  const listRef = useRef<HTMLOListElement>(null)
  const tickRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const root = scrollRoot.current
    if (!root || typeof IntersectionObserver === "undefined") return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const first = items.find((i) => seen.get(i.id))
        if (first) setActive(first.id)
      },
      { root, rootMargin: "-8% 0px -62% 0px" },
    )
    let tries = 0
    let timer: number | undefined
    const watch = () => {
      let found = 0
      for (const i of items) {
        const el = document.getElementById(i.id)
        if (el) {
          io.observe(el)
          found++
        }
      }
      // Cards load on their own; look again for the late ones.
      if (found < items.length && ++tries < 10) timer = window.setTimeout(watch, 300)
    }
    watch()
    return () => {
      window.clearTimeout(timer)
      io.disconnect()
    }
  }, [items, scrollRoot])

  useLayoutEffect(() => {
    const list = listRef.current
    const tick = tickRef.current
    if (!list || !tick) return
    const link = list.querySelector<HTMLElement>(`[data-jump="${active}"]`)
    if (!link) return
    tick.style.transform = `translateY(${link.offsetTop + (link.offsetHeight - 16) / 2}px)`
    tick.style.opacity = "1"
  }, [active])

  return (
    <nav aria-label="On this page" data-on-this-page="" className="sticky top-10">
      <p className="mb-2 text-2xs font-medium text-ink-3">On this page</p>
      <ol ref={listRef} className="relative space-y-0.5 pl-3">
        <span
          ref={tickRef}
          aria-hidden="true"
          className="absolute left-0 top-0 h-4 w-0.5 rounded-full bg-brand opacity-0 transition-transform duration-[220ms] ease-[var(--ease-spring)]"
        />
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              data-jump={i.id}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => {
                setActive(i.id)
                jumpTo(i.id)
              }}
              className={cn(
                "block w-full truncate rounded-sm py-1 text-left text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                active === i.id ? "font-medium text-foreground" : "text-ink-3",
              )}
            >
              {i.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
