"use client"

/**
 * The search page's scope chips (hub.md S8): All, then each type that has
 * results, each with its count. The selected chip is one raised knob that
 * slides between them; ⌥1–9 picks a chip from the keyboard. On a phone they
 * are one scrolling row with an edge fade.
 */
import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { useSlidingKnob } from "@/lib/hub/slidingKnob"
import type { SearchScope } from "@/lib/search/scopes"

export function ScopeChips({
  scopes,
  counts,
  more = false,
  value,
  onChange,
}: {
  scopes: { id: SearchScope; label: string }[]
  counts: Record<SearchScope, number>
  /** The search has more than the results counted: each count reads "12+". */
  more?: boolean
  value: SearchScope
  onChange: (scope: SearchScope) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  useSlidingKnob(row, knob, `${value}|${scopes.map((s) => s.id).join(",")}`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return
      const n = Number(e.code.replace("Digit", ""))
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const s = scopes[n - 1]
      if (!s) return
      e.preventDefault()
      onChange(s.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [scopes, onChange])

  return (
    <div className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-16px),transparent)] md:mx-0 md:overflow-visible md:px-0 md:[mask-image:none]">
      <div ref={row} role="tablist" aria-label="Show results from" data-scope-chips="" className="relative flex w-max gap-1.5">
        <span ref={knob} aria-hidden data-scope-knob="" className="pointer-events-none absolute left-0 top-0 h-[26px] origin-left rounded-[13px] bg-raised opacity-0 shadow-sel" />
        {scopes.map((s, i) => {
          const on = s.id === value
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-selected={on ? "" : undefined}
              title={i < 9 ? `${s.label} (⌥${i + 1})` : s.label}
              onClick={() => onChange(s.id)}
              className={cn(
                "relative z-[1] flex h-[26px] shrink-0 items-center gap-1.5 rounded-[13px] px-2.5 text-meta font-medium transition-colors",
                on ? "text-foreground" : "hub-chip-rest text-ink-2 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              )}
            >
              {s.label}
              <span className="font-book text-ink-3 tabular-nums">
                {counts[s.id]}
                {more ? "+" : ""}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
