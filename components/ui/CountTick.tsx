"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * A count that moves when it changes (work.md §1.5, `tick`): each digit that
 * changed leaves upward (y 0 to -6, fading) while the new one rises in (6 to
 * 0), 180 ms on the out-curve. Digits that stayed stay still, and the figures
 * are tabular, so nothing beside the number jiggles.
 *
 * Only a change ticks: the first render shows the number as it is, so a page
 * that loads never animates its counts (rule 3: motion is for a change the
 * person caused, or one they are watching happen).
 *
 * The one count primitive since the v3 waves met (11 Oct): the hub's
 * (hub.md §1.1, `count`, which took "99+") and the work area's were two files
 * whose names differed only in case. A value may be text, such as "99+".
 */
export function CountTick({ value, className, format }: { value: number | string; className?: string; format?: (n: number) => string }) {
  const text = format && typeof value === "number" ? format(value) : String(value)
  const prev = useRef(text)
  const [from, setFrom] = useState<string | null>(null)
  // A change since the last render is played once: the old text is kept for
  // the length of the tick, then dropped.
  useEffect(() => {
    if (prev.current === text) return
    setFrom(prev.current)
    prev.current = text
    const t = window.setTimeout(() => setFrom(null), 200)
    return () => window.clearTimeout(t)
  }, [text])
  if (from === null) {
    return (
      <span data-count-tick="" className={cn("tabular-nums", className)}>
        {text}
      </span>
    )
  }
  // Right-aligned digit by digit, so units stay over units.
  const width = Math.max(from.length, text.length)
  const a = from.padStart(width, " ")
  const b = text.padStart(width, " ")
  return (
    <span data-count-tick="" data-ticking="" className={cn("inline-flex tabular-nums", className)} aria-label={text}>
      {[...b].map((ch, i) =>
        ch === a[i] ? (
          <span key={i} aria-hidden="true" className={ch === " " ? "hidden" : undefined}>
            {ch}
          </span>
        ) : (
          <span key={i} aria-hidden="true" className="relative inline-block overflow-hidden" style={{ minWidth: ch === " " ? 0 : undefined }}>
            {a[i] !== " " && (
              <span className="absolute inset-0" style={{ animation: "work-tick-out 180ms var(--ease-out) forwards" }}>
                {a[i]}
              </span>
            )}
            <span className="inline-block" style={{ animation: "work-tick-in 180ms var(--ease-out) both", visibility: ch === " " ? "hidden" : undefined }}>
              {ch === " " ? "0" : ch}
            </span>
          </span>
        ),
      )}
    </span>
  )
}
