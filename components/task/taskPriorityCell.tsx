import { useWord } from "@/lib/utils/i18n"

import { PriorityGlyph } from "@/components/ui/graphics/glyphs"
import { cn } from "@/lib/utils/helpers/cn"

/** A priority's level, as its glyph shows it: none 0 to urgent 4. */
const LEVELS: Record<string, 1 | 2 | 3 | 4> = { low: 1, medium: 2, high: 3, urgent: 4 }

export function priorityLevel(value: string | undefined | null): 0 | 1 | 2 | 3 | 4 {
  return (value && LEVELS[value]) || 0
}

const NAMES = ["No priority", "Low", "Medium", "High", "Urgent"] as const

/**
 * A priority (design v3, work.md W02): three ink bars filled to the level,
 * urgent the danger square, never a hue. Alone in rows and cards, named on
 * hover, none only on a hovered row ("tip"); its word follows in the panel
 * and pickers ("word").
 */
export function TaskPriorityCell({
  priority,
  label = "word",
  size = 16,
  className,
}: {
  /** The stored value, such as high, or a priority option with one. */
  priority: string | { value: string; label?: string } | undefined | null
  label?: "word" | "tip"
  size?: number
  className?: string
}) {
  const value = typeof priority === "string" ? priority : priority?.value ?? ""
  const level = priorityLevel(value)
  const name = useWord(level ? value : "", NAMES[level])
  if (label === "tip") {
    return (
      <span
        data-tip={name}
        data-priority-level={level}
        className={cn(
          "work-tip inline-flex shrink-0 items-center",
          // No priority: three faint dashes, only while the row is pointed at.
          level === 0 && "opacity-0 transition-opacity group-hover/row:opacity-30",
          className,
        )}
      >
        <PriorityGlyph level={level} size={size} label={name} />
      </span>
    )
  }
  return (
    <span data-priority-level={level} className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-[450] text-foreground", className)}>
      <PriorityGlyph level={level} size={size} />
      <span className={cn(level === 0 && "text-ink-3")}>{name}</span>
    </span>
  )
}
