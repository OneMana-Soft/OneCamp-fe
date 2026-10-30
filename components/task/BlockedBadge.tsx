import { Lock } from "@/lib/icons"
import { OctagonMinus } from "@/lib/workIcons"
import { cn } from "@/lib/utils/helpers/cn"

function Mark({ words, count, lock, className }: { words: string; count?: number; lock?: boolean; className?: string }) {
  const Glyph = lock ? Lock : OctagonMinus
  return (
    <span title={words} data-restricted-mark={lock ? "" : undefined} className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      <Glyph aria-hidden className={lock ? "size-3" : "size-[13px]"} />
      {count ? <span aria-hidden>{count}</span> : null}
      <span className="sr-only">{words}</span>
    </span>
  )
}

/** Waiting on open tasks: a stop sign and how many, on a card, a row and a timeline bar. */
export function BlockedBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null
  return <Mark words={`Blocked by ${count} ${count === 1 ? "task" : "tasks"}`} count={count} className={cn("font-medium text-warning-ink", className)} />
}

/** A restricted task's lock (WA2b), the only lock. */
export function RestrictedMark({ restricted, className }: { restricted?: boolean; className?: string }) {
  return restricted ? <Mark words="Only some people can see this task" lock className={cn("text-ink-3", className)} /> : null
}
