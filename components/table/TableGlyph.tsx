import { Table as TableIcon } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

/**
 * A table's tile (content.md T02). The one content object allowed a hue: its
 * owner picks an emoji or a hue, so the tile names the table. A tint tile in
 * the table's hue with the strong-cut glyph; an emoji brings its own colour,
 * so it sits on --sunken instead, at 60 % of the tile. 20 / 32 / 36 px at
 * r6 / r9 / r10; the header's 36 px tile has an inner top highlight.
 */
const SIZE = {
  sm: { box: "size-5 rounded-md", px: 20, icon: "size-3" },
  md: { box: "size-8 rounded-[9px]", px: 32, icon: "size-4" },
  lg: { box: "relative size-9 overflow-hidden rounded-[10px] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/40 before:content-['']", px: 36, icon: "size-[18px]" },
} as const

export function TableGlyph({ icon, id, size = "md", className }: { icon?: string | null; id?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = SIZE[size]
  const emoji = icon?.trim()
  const hue = hueFor(id || "table")
  if (emoji) {
    return (
      <span
        aria-hidden="true"
        data-table-glyph="emoji"
        className={cn("inline-flex shrink-0 items-center justify-center bg-sunken ring-1 ring-inset ring-line", s.box, className)}
      >
        <span className="leading-none" style={{ fontSize: Math.round(s.px * 0.6) }}>
          {emoji}
        </span>
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      data-table-glyph="tile"
      data-hue={hue}
      className={cn(HUE_CLASS[hue], "inline-flex shrink-0 items-center justify-center bg-hue-tint text-hue", s.box, className)}
    >
      <TableIcon className={s.icon} />
    </span>
  )
}
