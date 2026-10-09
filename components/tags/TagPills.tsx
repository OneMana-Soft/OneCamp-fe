import { cn } from "@/lib/utils/helpers/cn"
import { splitTags, tagTone } from "@/lib/tags"

/**
 * A task's tags as small tinted pills. `max` shows that many and "+n" for the
 * rest, so a card stays one line.
 */
export function TagPills({ label, max, className }: { label: string | null | undefined; max?: number; className?: string }) {
  const tags = splitTags(label)
  if (tags.length === 0) return null
  const shown = max !== undefined ? tags.slice(0, max) : tags
  const rest = tags.length - shown.length
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((t) => (
        <span key={t} className={cn("inline-flex h-5 max-w-[10rem] items-center truncate rounded-sm px-1.5 text-2xs font-medium", tagTone(t))} title={t}>
          {t}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-2xs font-medium text-muted-foreground" title={tags.slice(shown.length).join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  )
}
