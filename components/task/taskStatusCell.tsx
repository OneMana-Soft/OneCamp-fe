import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()
  if (!status) return ""
  return isBuiltInStatus(status.value) ? t(status.value, { defaultValue: status.label }) : status.label
}

/**
 * A status as design v3 draws it (work.md W01): its category's glyph, in its
 * own hue when it is a project's status. In rows, cards and bars it is the
 * glyph alone, named by its tooltip and aria-label ("tip"); in the panel and
 * pickers the word follows it ("word").
 */
export function TaskStatusCell({
  status,
  label = "word",
  size = 16,
  className,
}: {
  status: StatusLike
  /** "word": glyph and name; "tip": the glyph alone, named on hover. */
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
