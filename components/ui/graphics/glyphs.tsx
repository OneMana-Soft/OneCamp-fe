import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The glyphs OneCamp owns (design v3, §3.12), drawn inline rather than taken
 * from Lucide: the status set and the priority bars (the spark and the
 * progress ring live beside them, in motifs.tsx and ProgressRing.tsx). Each takes currentColor or a token, so it follows
 * the theme with no dark: variant.
 */

export type StatusKind = "backlog" | "todo" | "progress" | "review" | "done" | "cancelled"

/**
 * A task's status as a 16px glyph (§3.11): a dashed ink-3 ring (backlog), an
 * ink-2 ring (to do), a sun ring with its right half filled (in progress), a
 * dusk ring three-quarters filled (review), a moss disc with a check (done),
 * an ink-3 disc with an x (cancelled). The glyph replaces the word in rows;
 * the word stays in the panel, so it is decorative unless labelled.
 */
export function StatusGlyph({
  status,
  size = 16,
  label,
  hue,
  className,
}: {
  status: StatusKind
  size?: number
  label?: string
  /**
   * A project's own status draws its category's shape in its own camp hue
   * (work.md §1.4); "neutral" or none keeps the category's colour.
   */
  hue?: CampHue | "neutral"
  className?: string
}) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }
  const own = hue && hue !== "neutral" ? `var(--camp-${hue})` : null
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" data-status-glyph={status} data-hue={own ? hue : undefined} className={cn("shrink-0", className)} {...a11y}>
      {status === "backlog" && <circle cx="8" cy="8" r="6" fill="none" stroke={own ?? "var(--ink-3)"} strokeWidth="1.5" strokeDasharray="2.2 2.1" />}
      {status === "todo" && <circle cx="8" cy="8" r="6" fill="none" stroke={own ?? "var(--ink-2)"} strokeWidth="1.5" />}
      {status === "progress" && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={own ?? "var(--camp-sun)"} strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill={own ?? "var(--camp-sun)"} />
        </>
      )}
      {status === "review" && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={own ?? "var(--camp-dusk)"} strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 1 1-3.5 3.5H8z" fill={own ?? "var(--camp-dusk)"} />
        </>
      )}
      {status === "done" && (
        <>
          <circle cx="8" cy="8" r="7" fill={own ?? "var(--camp-moss)"} />
          <path d="m5.2 8.2 1.9 1.9 3.8-4" fill="none" stroke="var(--sheet)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === "cancelled" && (
        <>
          <circle cx="8" cy="8" r="7" fill={own ?? "var(--ink-3)"} />
          <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" fill="none" stroke="var(--sheet)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

/**
 * Priority (§3.11): three bars, filled in ink-2 up to the level and empty in
 * ink-4; urgent (4) is a 13px danger square with "!". 0 is no priority: three
 * empty bars.
 */
export function PriorityGlyph({ level, size = 16, label, className }: { level: 0 | 1 | 2 | 3 | 4; size?: number; label?: string; className?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }
  if (level === 4) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" data-priority-glyph="4" className={cn("shrink-0", className)} {...a11y}>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="var(--destructive)" />
        <path d="M8 4.5v4.2M8 11.2v.1" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" data-priority-glyph={level} className={cn("shrink-0", className)} {...a11y}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width="3" height={3 + i * 3.5} rx="1" fill={i < level ? "var(--ink-2)" : "var(--ink-4)"} />
      ))}
    </svg>
  )
}
