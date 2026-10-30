import { useWord } from "@/lib/utils/i18n"

import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { CATEGORY_KIND, isBuiltInStatus, type StatusCategory, type StatusHue } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"

/** What a status needs to be shown: a built-in status, or a project's own. */
export interface StatusLike {
  value: string
  label: string
  /** The category it counts as, whose shape it draws. */
  category?: StatusCategory
  kind?: StatusKind
  hue?: StatusHue
}

/** The glyph's shape for a status: its own kind, else its category's, else its value's. */
export function statusKindOf(status: StatusLike): StatusKind {
  if (status.kind) return status.kind
  const category = status.category ?? (isBuiltInStatus(status.value) ? status.value : "todo")
  return CATEGORY_KIND[category]
}

/** A status's name in the reader's language; a project's own status as its admins named it. */
export function useStatusLabel(status: StatusLike | undefined): string {
  return useWord(status && isBuiltInStatus(status.value) ? status.value : "", status?.label ?? "")
}

/**
 * A status (design v3, work.md W01): its category's glyph, in a project
 * status's own hue; alone in rows, cards and bars, named by its tip and
 * aria-label ("tip"), with its word in the panel and pickers ("word").
 */
export function TaskStatusCell({
  status,
  label = "word",
  size = 16,
  className,
}: {
  status: StatusLike
  label?: "word" | "tip"
  size?: number
  className?: string
}) {
  const name = useStatusLabel(status)
  const glyph = <StatusGlyph status={statusKindOf(status)} hue={status.hue} size={size} label={label === "tip" ? name : undefined} />
  if (label === "tip") {
    return (
      <span data-tip={name} className={cn("work-tip inline-flex shrink-0 items-center", className)}>
        {glyph}
      </span>
    )
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-[450] text-foreground", className)}>
      {glyph}
      <span>{name}</span>
    </span>
  )
}
