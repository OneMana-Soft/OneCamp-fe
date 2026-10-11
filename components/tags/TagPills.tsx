import { cn } from "@/lib/utils/helpers/cn"
import { splitTags } from "@/lib/tags"
import { LabelChip } from "@/components/ui/chip"

/**
 * A task's tags as label chips (design v3: neutral, with a dot in the tag's
 * hue). `max` shows that many and "+n" for the rest, so a card stays one line.
 */
export function TagPills({ label, max, className }: { label: string | null | undefined; max?: number; className?: string }) {
  const tags = splitTags(label)
  if (tags.length === 0) return null
  const shown = max !== undefined ? tags.slice(0, max) : tags
  const rest = tags.length - shown.length
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {shown.map((t) => (
        <LabelChip key={t} label={t} />
      ))}
      {rest > 0 && (
        <span className="text-2xs font-medium text-faint-foreground" title={tags.slice(shown.length).join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  )
}
