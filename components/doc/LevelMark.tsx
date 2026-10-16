import { cn } from "@/lib/utils/helpers/cn"
import { levelLabel } from "@/lib/docs/abilities"

/**
 * The docs list's quiet mark for a doc the person can't change: "View only",
 * or "Can comment", from the level the server gives each row (GET /doc/list).
 * Nothing for a doc they can edit (docs incident, 14 Oct 2026).
 */
export function LevelMark({ level, className }: { level?: string; className?: string }) {
    const label = levelLabel(level)
    if (!label) return null
    return (
        <span data-doc-level={level} className={cn("shrink-0 rounded-md bg-sunken px-1.5 text-meta text-ink-2", className)}>
            {label}
        </span>
    )
}
