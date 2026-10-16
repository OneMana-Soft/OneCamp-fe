"use client"

/**
 * The frame Activity and Later share (hub.md A1, L1): a 52px header with the
 * page's icon and name, its tabs inline, and its controls on the right.
 *
 * HubTabs draws ONE ink indicator that slides between tabs (translateX and
 * scaleX, 200ms), not an underline per tab, and never in the accent: the tab
 * row is navigation, and the accent is spent on what is about you (A2).
 * HubSegmented is the who-filter: one raised chip that slides between the
 * segments (A3).
 */
import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { CountTick } from "@/components/ui/CountTick"
import { cn } from "@/lib/utils/helpers/cn"

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

export function HubFrame({
  icon: Icon,
  title,
  tabs,
  controls,
  children,
  className,
  ...rest
}: {
  icon: LucideIcon
  title: string
  tabs?: React.ReactNode
  controls?: React.ReactNode
  children?: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-hub-frame="" className={cn("flex h-full min-h-0 flex-col", className)} {...rest}>
      <header data-hub-header="" className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-4 border-b border-line bg-sheet pl-4 pr-3 md:pl-6 md:pr-4">
        <h1 className="hidden shrink-0 items-center gap-2 text-heading text-foreground md:flex">
          <Icon className="size-4 text-ink-2" aria-hidden />
          {title}
        </h1>
        <div className="flex min-w-0 flex-1 self-stretch">{tabs}</div>
        {controls ? <div className="flex shrink-0 items-center gap-2">{controls}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export interface HubTab {
  value: string
  label: string
  /** Unread count, 12px ink-3 after the label; omitted at zero. */
  count?: number
  /** Draw the count as the 18px brand badge (Mentions: a mention is you). */
  badge?: boolean
  /** Draw the count as a sun pill (Later's due count). */
  sun?: boolean
}

export function HubTabs({ tabs, value, onChange, label }: { tabs: HubTab[]; value: string; onChange: (v: string) => void; label: string }) {
  const list = React.useRef<HTMLDivElement>(null)
  const [bar, setBar] = React.useState<{ x: number; w: number } | null>(null)

  const measure = React.useCallback(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(value)}"]`)
    if (!el) return
    // Inset 8px each side, as the mock's rule.
    setBar({ x: el.offsetLeft + 8, w: Math.max(1, el.offsetWidth - 16) })
  }, [value])

  useIsoLayoutEffect(() => {
    measure()
  }, [measure, tabs])
  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !list.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(list.current)
    return () => ro.disconnect()
  }, [measure])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const i = tabs.findIndex((t) => t.value === value)
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.value)
    list.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.value)}"]`)?.focus()
  }

  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKey} className="no-scrollbar relative flex min-w-0 items-stretch overflow-x-auto">
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-tab={t.value}
            // A finger's 44px, wider than "All" is drawn (QA F-26, app/phone.css F3).
            data-touch-target=""
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-ui-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              on ? "font-medium text-foreground" : "text-ink-2 hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              t.badge ? (
                <span data-tab-badge="" className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-[5px] text-3xs font-semibold leading-none text-brand-foreground">
                  <CountTick value={t.count > 99 ? "99+" : t.count} />
                </span>
              ) : t.sun ? (
                <span data-tab-sun="" className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-camp-sun-tint px-[5px] text-3xs font-semibold leading-none text-camp-sun-ink">
                  <CountTick value={t.count} />
                </span>
              ) : (
                <span className="text-meta text-ink-3">
                  <CountTick value={t.count > 99 ? "99+" : t.count} />
                </span>
              )
            ) : null}
          </button>
        )
      })}
      <span
        aria-hidden
        data-tab-indicator=""
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left rounded-[2px] bg-ink transition-transform duration-200 ease-out"
        style={bar ? { transform: `translateX(${bar.x}px) scaleX(${bar.w})` } : { opacity: 0 }}
      />
    </div>
  )
}

export interface HubSegment {
  value: string
  label: string
  glyph?: React.ReactNode
}

export function HubSegmented({ segments, value, onChange, label }: { segments: HubSegment[]; value: string; onChange: (v: string) => void; label: string }) {
  const track = React.useRef<HTMLDivElement>(null)
  const [knob, setKnob] = React.useState<{ x: number; w: number } | null>(null)
  const measure = React.useCallback(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-segment="${CSS.escape(value)}"]`)
    if (el) setKnob({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value])
  useIsoLayoutEffect(() => {
    measure()
  }, [measure, segments])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const i = segments.findIndex((s) => s.value === value)
    const next = segments[(i + (e.key === "ArrowRight" ? 1 : segments.length - 1)) % segments.length]
    onChange(next.value)
    track.current?.querySelector<HTMLElement>(`[data-segment="${CSS.escape(next.value)}"]`)?.focus()
  }

  return (
    <div
      ref={track}
      role="group"
      aria-label={label}
      onKeyDown={onKey}
      className="relative flex h-7 shrink-0 rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line dark:bg-white/[0.03]"
    >
      <span
        aria-hidden
        data-segment-knob=""
        // The chip slides by transform; its width snaps to the segment, since a
        // scaled chip would stretch its corners and its shadow.
        className="absolute left-0 top-0.5 h-6 rounded-sm bg-raised shadow-e1 transition-transform duration-[180ms] ease-out"
        style={knob ? { width: knob.w, transform: `translateX(${knob.x}px)` } : { opacity: 0 }}
      />
      {segments.map((s) => {
        const on = s.value === value
        return (
          <button
            key={s.value}
            type="button"
            data-segment={s.value}
            // A finger's 44px, taller than the 24px chip is drawn (QA F-26).
            data-touch-target=""
            aria-pressed={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(s.value)}
            className={cn(
              "relative z-[1] flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-meta font-medium tracking-normal transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
            )}
          >
            {s.glyph}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
