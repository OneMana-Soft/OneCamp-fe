"use client"

// Controls the settings area shares (design v3, admin §1.4).

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** "4dfe57e3…72dd554ee": the head and tail of a long value, the middle elided. */
export function middleEllipsis(value: string, head = 8, tail = 9): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/**
 * Copies a value, morphing its icon to a check for 1.2s, and says so to a
 * screen reader. A clipboard that refuses (outside a secure context) says that
 * instead of pretending.
 */
export function useCopy(ms = 1200) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async (value: string) => {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      setState("failed")
    }
    timer.current = window.setTimeout(() => setState("idle"), ms)
  }
  return { state, copy }
}

/** A 28px icon button that copies, its glyph crossfading to a moss check. */
export function CopyButton({ value, label, className, size = "sm" }: { value: string; label: string; className?: string; size?: "sm" | "md" }) {
  const { state, copy } = useCopy()
  return (
    <>
      <button
        type="button"
        onClick={() => void copy(value)}
        aria-label={state === "copied" ? `${label} copied` : `Copy ${label}`}
        data-copy-state={state}
        className={cn(
          "relative inline-grid shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          size === "md" ? "size-8" : "size-7",
          className,
        )}
      >
        <Copy className={cn("col-start-1 row-start-1 size-3.5 transition-opacity duration-150", state === "copied" ? "opacity-0" : "opacity-100")} aria-hidden="true" />
        <Check
          className={cn(
            "col-start-1 row-start-1 size-3.5 text-success-ink transition-[opacity,transform] duration-[220ms] ease-[var(--ease-spring)]",
            state === "copied" ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
          aria-hidden="true"
        />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? `${label} copied` : state === "failed" ? `Couldn't copy the ${label}. Select it and copy it by hand.` : ""}
      </span>
    </>
  )
}

/**
 * A code or key row: JetBrains Mono 12.5/18 on --sunken, r8, an inset
 * --line-2 ring, with copy as an icon button. `ellipsis="middle"` keeps one
 * line for a fingerprint or a long URL, with the whole value in its title.
 */
export function CodeRow({
  value,
  label,
  ellipsis = "end",
  className,
  copy = true,
  children,
}: {
  value: string
  /** What the value is, for the copy button's name: "endpoint URL". */
  label: string
  ellipsis?: "end" | "middle" | "wrap"
  className?: string
  copy?: boolean
  /** Extra controls after copy (Replace, Reveal). */
  children?: React.ReactNode
}) {
  const shown = ellipsis === "middle" ? middleEllipsis(value) : value
  return (
    <div
      data-code-row=""
      className={cn("flex min-w-0 items-center gap-1 rounded-md bg-sunken py-1 pl-2.5 pr-1 shadow-[inset_0_0_0_1px_var(--line-2)]", className)}
    >
      <code
        title={value}
        className={cn(
          "min-w-0 flex-1 font-mono text-2xs leading-[18px] text-foreground",
          ellipsis === "wrap" ? "whitespace-pre-wrap break-all py-1" : "truncate",
        )}
      >
        {shown}
      </code>
      {copy && <CopyButton value={value} label={label} />}
      {children}
    </div>
  )
}

/**
 * A number with its unit inside the field ("250 MB"): 96px wide, the number
 * right-aligned in tabular figures, the unit a 13px ink-3 suffix.
 */
export const NumberUnitInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & { unit: string; invalid?: boolean }
>(function NumberUnitInput({ unit, className, invalid, ...props }, ref) {
  return (
    <span
      data-number-unit=""
      className={cn(
        "field-surface inline-flex h-11 w-24 items-center gap-1 rounded-md px-2.5 md:h-8",
        className,
      )}
      aria-invalid={invalid || undefined}
    >
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent text-right text-base tabular-nums text-foreground outline-none [appearance:textfield] md:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        {...props}
      />
      <span aria-hidden="true" className="shrink-0 text-xs text-ink-3">
        {unit}
      </span>
    </span>
  )
})
