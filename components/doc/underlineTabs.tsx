"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

export interface UnderlineTab {
  value: string
  label: string
  count?: number
}

/**
 * The page tabs of the prototype (`.tabs`): 40 px, 13.5/510, the chosen tab
 * in ink with a 2 px ink underline (never the brand: it is a heading, not an
 * action), counts at 12 ink-3. The underline is one element that slides
 * between tabs (transform and scaleX, 180 ms ease-out), so the eye follows it.
 * Arrow keys move between tabs, as a tablist does.
 */
export function UnderlineTabs({
  tabs,
  value,
  onValueChange,
  label,
  className,
}: {
  tabs: UnderlineTab[]
  value: string
  onValueChange: (value: string) => void
  label: string
  className?: string
}) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [bar, setBar] = React.useState<{ x: number; w: number } | null>(null)

  React.useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
    if (!el) return
    const measure = () => setBar({ x: el.offsetLeft, w: el.offsetWidth })
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [value, tabs])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const i = tabs.findIndex((t) => t.value === value)
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]
    e.preventDefault()
    onValueChange(next.value)
    listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative flex h-10 items-stretch gap-1 border-b border-line", className)}
    >
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-value={t.value}
            onClick={() => onValueChange(t.value)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-t-md px-1.5 text-ui-sm font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
              on ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="text-meta font-normal tabular-nums text-ink-3">{t.count}</span> : null}
          </button>
        )
      })}
      {bar ? (
        <span
          aria-hidden="true"
          data-tab-indicator=""
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left rounded-xs bg-ink transition-transform duration-[180ms] ease-[var(--ease-out)]"
          style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
        />
      ) : null}
    </div>
  )
}
