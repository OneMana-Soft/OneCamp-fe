"use client"

import { createElement, isValidElement, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react"

import * as React from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The work area's tab row (design v3, work.md W17, W38): 40 px tabs with
 * 20 px of side room, 13.5 type, a 14 px ink-3 icon at rest, and the selected
 * tab in 510 ink with its icon in ink over a 2 px r2 underline inset 8 px. The
 * underline is one element that slides between tabs on transform (translateX
 * and scaleX, 180 ms), never a border that jumps. Counts follow a label in
 * 12 ink-3. The overview and the project page share it, so both read as one
 * tab language.
 */
export interface WorkTab<T extends string> {
  value: T
  label: string
  icon?: ComponentType<{ className?: string }>
  count?: number
}

export function WorkTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly WorkTab<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null)
  // Where the underline goes: under the selected tab, less 8 px each side.
  useLayoutEffect(() => {
    const el = row.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(value)}"]`)
    if (!el) return
    const measure = () => setBar({ x: el.offsetLeft + 8, w: Math.max(0, el.offsetWidth - 16) })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, tabs])
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.value === value)
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step || i < 0) return
    e.preventDefault()
    const next = tabs[(i + step + tabs.length) % tabs.length]
    onChange(next.value)
    row.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.value)}"]`)?.focus()
  }
  return (
    <div
      ref={row}
      role="tablist"
      aria-label={label}
      data-work-tabs=""
      onKeyDown={move}
      className={cn("no-scrollbar relative flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-line", className)}
    >
      {tabs.map((t) => {
        const on = t.value === value
        const Icon = t.icon
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-tab={t.value}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap px-2.5 text-xs leading-5 outline-none transition-colors",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              on ? "font-[510] text-foreground" : "text-ink-2 hover:text-foreground",
            )}
          >
            {Icon && <Icon className={cn("size-3.5", on ? "text-foreground" : "text-ink-3")} />}
            {t.label}
            {t.count != null && t.count > 0 && <span className="text-xs tabular-nums text-ink-3">{t.count}</span>}
          </button>
        )
      })}
      {bar && (
        <span
          aria-hidden="true"
          data-tab-underline=""
          className="pointer-events-none absolute bottom-[-1px] left-0 h-0.5 w-px origin-left rounded-[2px] bg-foreground transition-transform duration-[180ms] ease-out"
          style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
        />
      )}
    </div>
  )
}

/**
 * The work area's segmented control (W11, W41), the one every work view uses:
 * 28 px, an r8 track on --press, the chosen segment raised (--raised and
 * e-sel), its thumb sliding on transform (180 ms). Radio semantics, so arrows
 * move the choice. Segments keep to one line ("7 days" wrapped in a fixed
 * grid of thirds) and share any width the control is given.
 *
 * The thumb is sized, not scaled: a 1 px thumb scaled to a segment's width
 * stretched its radius and its shadow with it, and the shadow drew a grey bar
 * out past the control, over whatever was beside it.
 */
export function WorkSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly {
    value: T
    label: ReactNode
    /** A component, given size-3.5, or an element as is. */
    icon?: ComponentType<{ className?: string }> | ReactNode
    disabled?: boolean
    title?: string
  }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => {
      const on = el.querySelector<HTMLElement>(`[data-seg="${CSS.escape(value)}"]`)
      if (on) setThumb((t) => (t && t.x === on.offsetLeft && t.w === on.offsetWidth ? t : { x: on.offsetLeft, w: on.offsetWidth }))
    }
    measure()
    // A web font arriving, or the control given room, moves the segments.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [value, options])
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const live = options.filter((o) => !o.disabled)
    const i = live.findIndex((o) => o.value === value)
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step || i < 0) return
    e.preventDefault()
    const next = live[(i + step + live.length) % live.length]
    onChange(next.value)
    row.current?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(next.value)}"]`)?.focus()
  }
  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label={label}
      onKeyDown={move}
      data-work-segmented=""
      className={cn("relative inline-flex h-7 shrink-0 items-stretch rounded-md bg-press p-0.5", className)}
    >
      {thumb && (
        <span
          aria-hidden="true"
          data-seg-thumb=""
          className="pointer-events-none absolute bottom-0.5 left-0 top-0.5 rounded-[6px] bg-raised shadow-sel transition-transform duration-[180ms] ease-out"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o) => {
        const on = o.value === value
        const icon = isValidElement(o.icon) ? o.icon : o.icon ? createElement(o.icon as ComponentType<{ className?: string }>, { className: "size-3.5" }) : null
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-seg={o.value}
            disabled={o.disabled}
            title={o.title}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-[1] inline-flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 text-xs font-[510] outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring disabled:text-ink-4",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
            )}
          >
            {icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A toolbar's search (W10): an icon button that opens into a 220 px field in
 * place, with `/` to focus it. The field's mask grows from the icon on
 * transform; its width snaps.
 */
export function WorkSearch({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [open, setOpen] = useState(!!value)
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  useLayoutEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      setOpen(true)
      input.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  if (!open) {
    return (
      <button
        type="button"
        aria-label={label}
        title={`${label} (/)`}
        onClick={() => setOpen(true)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-3.5" />
      </button>
    )
  }
  return (
    <div className="relative w-[220px] shrink-0 origin-right [animation:work-pop-in_180ms_var(--ease-out)_both]">
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("")
            setOpen(false)
          }
        }}
        onBlur={() => !value && setOpen(false)}
        className="field-surface h-7 w-full rounded-md pl-8 pr-7 text-xs text-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("")
            input.current?.focus()
          }}
          className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

/** A tab for WorkTabsList: its icon as an element. */
export interface TabsListTab<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
  count?: number
}

/**
 * The same tabs on Radix's TabsList (work.md W17), for a page whose panels are
 * Radix TabsContent (the project page, with its kept tabs): 40 px, 13.5 type, a 14 px
 * icon, the chosen tab at 510 in ink, and ONE underline that slides between
 * tabs on transform (translateX and scaleX, 180 ms), never redrawn per tab.
 * Shared by the project page and the projects overview, so both read as one
 * tab language. The page wires 1 to 9 to its tabs; the tooltip names the key.
 */
export function WorkTabsList<T extends string>({ tabs, value, className }: { tabs: TabsListTab<T>[]; value: T; className?: string }) {
  const list = React.useRef<HTMLDivElement>(null)
  const [bar, setBar] = React.useState<{ x: number; w: number } | null>(null)
  const place = React.useCallback(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-work-tab="${CSS.escape(value)}"]`)
    if (!el) return
    // Inset 8 px from the tab's sides.
    setBar({ x: el.offsetLeft + 8, w: Math.max(0, el.offsetWidth - 16) })
  }, [value])
  React.useLayoutEffect(place, [place, tabs.length])
  React.useEffect(() => {
    const box = list.current
    if (!box || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(place)
    ro.observe(box)
    return () => ro.disconnect()
  }, [place])
  return (
    <TabsList ref={list} data-work-tabs="" className={cn("relative h-10 w-full justify-start gap-0 rounded-none border-b border-line bg-transparent p-0 px-3 overflow-x-auto no-scrollbar", className)}>
      {tabs.map((t, i) => (
        <TabsTrigger
          key={t.value}
          value={t.value}
          data-work-tab={t.value}
          title={i < 9 ? `${t.label} (${i + 1})` : t.label}
          className={cn(
            "relative h-full shrink-0 gap-[7px] rounded-none bg-transparent px-3 text-sm font-normal text-ink-2 shadow-none transition-colors hover:text-foreground",
            "[&_svg]:size-3.5 [&_svg]:text-ink-3 data-[state=active]:bg-transparent data-[state=active]:font-[510] data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:[&_svg]:text-foreground",
          )}
        >
          {t.icon}
          {t.label}
          {t.count != null && t.count > 0 && <span className="text-xs font-normal tabular-nums text-ink-3">{t.count}</span>}
        </TabsTrigger>
      ))}
      {bar && (
        <span
          aria-hidden="true"
          data-tab-underline=""
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-[100px] origin-left rounded-[2px] bg-foreground transition-transform duration-[180ms] ease-out"
          style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / 100})` }}
        />
      )}
    </TabsList>
  )
}
