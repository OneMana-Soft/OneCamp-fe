"use client"

import { ZOOMS, zoomStep, type Zoom } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The zoom as a 28px segmented control (work.md W23): a --press track, the
 * chosen segment raised, its thumb sliding on transform. Radio semantics, so
 * arrows move the choice.
 */
export function ZoomSwitch({ value, onChange }: { value: Zoom; onChange: (z: Zoom) => void }) {
  const index = Math.max(0, ZOOMS.findIndex((z) => z.value === value))
  const W = 64
  return (
    <div
      role="radiogroup"
      aria-label="Zoom"
      aria-keyshortcuts="- +"
      className="relative inline-flex h-7 rounded-md bg-press p-0.5"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
        e.preventDefault()
        e.stopPropagation()
        onChange(zoomStep(value, e.key === "ArrowRight" ? 1 : -1))
      }}
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-sm bg-raised shadow-sel transition-transform duration-[180ms] ease-out"
        style={{ width: W, transform: `translateX(${index * W}px)` }}
      />
      {ZOOMS.map((z) => (
        <button
          key={z.value}
          type="button"
          role="radio"
          aria-checked={z.value === value}
          tabIndex={z.value === value ? 0 : -1}
          onClick={() => onChange(z.value)}
          className={cn(
            "relative z-[1] h-full rounded-sm text-xs font-[510] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            z.value === value ? "text-foreground" : "text-ink-3 hover:text-ink-2",
          )}
          style={{ width: W }}
        >
          {z.label}
        </button>
      ))}
    </div>
  )
}
