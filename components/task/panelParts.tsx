"use client"

import * as React from "react"

import { ChevronDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { prefersReducedMotion } from "@/lib/celebrate"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"
import { DateField } from "@/components/task/taskDateField"
import { DueLabel } from "@/components/task/DueLabel"

/*
 * The task panel's pieces (design v3, work.md W28, W29): how its content
 * enters, the Dates property, and "More fields".
 */

// When a task panel last went away. Another one mounting in the same moment
// is a switch from one task to the next (the panel is keyed by task), which
// crossfades; one mounting on its own is the panel opening, which slides in.
let lastUnmount = 0

export type PanelEntrance = "in" | "swap" | "none"

/**
 * How this panel's content enters: "in" (panel-in: 16px from the right and a
 * fade, 240ms in-out), "swap" (panel-swap: a 120ms crossfade, the title rising
 * 4px), or "none" under reduced motion. Widths never animate; the frame
 * around the content is the shell's.
 */
export function usePanelEntrance(): PanelEntrance {
  const [entrance] = React.useState<PanelEntrance>(() => {
    if (typeof window === "undefined" || prefersReducedMotion()) return "none"
    return performance.now() - lastUnmount < 120 ? "swap" : "in"
  })
  React.useEffect(
    () => () => {
      lastUnmount = performance.now()
    },
    [],
  )
  return entrance
}

/** The content's entrance as inline styles: the body, and the title within it. */
export function entranceStyle(entrance: PanelEntrance, part: "body" | "title"): React.CSSProperties | undefined {
  if (entrance === "in" && part === "body") return { animation: "work-panel-in 240ms var(--ease-in-out) both" }
  if (entrance === "swap" && part === "body") return { animation: "work-fade-in 120ms var(--ease-out) both" }
  if (entrance === "swap" && part === "title") return { animation: "work-rise-in 120ms var(--ease-out) both" }
  return undefined
}

/**
 * Dates (W29): "8 Oct → 10 Oct", each end its own picker, then the due chip
 * (Due today in sun, Overdue in danger). One row where Start and Due were two.
 */
export function DatesProperty({
  isAdmin,
  start,
  due,
  done,
  onStart,
  onDue,
}: {
  isAdmin: boolean
  start?: Date
  due?: Date
  done: boolean
  onStart: (d: Date | undefined) => void
  onDue: (d: Date | undefined) => void
}) {
  return (
    <div className={propertyRow()} data-property="dates">
      <span className={propertyLabel}>Dates</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <DateField bare isAdmin={isAdmin} label="Start date" emptyText={due ? "Start" : "Add dates"} value={start} onSelect={onStart} onClear={() => onStart(undefined)} />
        {(start || due) && <span className="text-ink-4" aria-hidden>→</span>}
        {(start || due) && <DateField bare isAdmin={isAdmin} label="Due date" emptyText="Due" value={due} onSelect={onDue} onClear={() => onDue(undefined)} />}
        {due && !done && <DueLabel date={due} variant="panel" className="ml-1" />}
      </div>
    </div>
  )
}

const MORE_KEY = "oc_task_more_fields"

function readMore(): boolean {
  try {
    return window.localStorage.getItem(MORE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * "More fields" (W29): Repeat, Cycle, the project's own fields and the rest,
 * below the six that always show. Closed, it folds away only the ones that
 * hold nothing (rows marked data-field-empty); a field with a value always
 * shows. Open or closed is remembered for this person. The toggle names what
 * it hides. Opening snaps the space and fades the rows in, 16ms apart.
 */
export function MoreFields({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [hidden, setHidden] = React.useState<string[]>([])
  const [opened, setOpened] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => setOpen(readMore()), [])
  // What the toggle names: the labels of the empty rows, read again whenever
  // a row fills, empties or loads (Cycle and the fields load on their own).
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => {
      const names = [...el.querySelectorAll<HTMLElement>("[data-field-empty]")]
        .map((row) => row.querySelector("label, span")?.textContent?.trim() ?? "")
        .filter(Boolean)
      setHidden((prev) => (prev.join("|") === names.join("|") ? prev : names))
    }
    read()
    if (typeof MutationObserver === "undefined") return
    const watch = new MutationObserver(read)
    watch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-field-empty"] })
    return () => watch.disconnect()
  }, [])
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) setOpened(true)
    try {
      window.localStorage.setItem(MORE_KEY, next ? "1" : "0")
    } catch {
      /* private mode: it is not remembered */
    }
  }
  return (
    <div data-more-fields={open ? "open" : "closed"}>
      <div ref={box} className={cn(!open && "[&_[data-field-empty]]:hidden", open && opened && "[&>*]:[animation:work-row-in_180ms_var(--ease-out)_both]")}>
        {children}
      </div>
      {(hidden.length > 0 || open) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          data-touch-target=""
          className="-ml-2 mt-0.5 inline-flex h-7 max-w-full items-center gap-1.5 rounded-sm px-2 text-meta font-[510] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
        >
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open ? "rotate-180" : "-rotate-90")} aria-hidden />
          <span className="shrink-0">{open ? "Fewer fields" : "More fields"}</span>
          {!open && hidden.length > 0 && <span className="truncate font-normal">· {hidden.join(", ")}</span>}
        </button>
      )}
    </div>
  )
}
