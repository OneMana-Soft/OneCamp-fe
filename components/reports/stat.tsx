import { Sparkline } from "@/components/ui/graphics/Sparkline"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One headline figure (design v3, work.md W44): a 12 ink-2 label, the figure
 * in tabular numbers, a delta against the week before in words and colour
 * (never colour alone), a note line where the measure has one, and a 32 px
 * sparkline of its weeks where it has them. It sits in a <dl>.
 *
 * Two sizes, one markup: "strip", the figure at title-2, for Reports' tiles
 * standing on one sunken band; "tile", a dashboard's number widget, where the
 * figure is the tile's hero at display size and sits at the tile's foot under
 * its label (DB-114 F2, B9-b3: a 20 px numeral at the top of a 160 px tile
 * read unfinished).
 */
export function Stat({
  label,
  value,
  note,
  alert,
  series,
  delta,
  size = "strip",
}: {
  label: string
  value: string | number
  note?: string
  alert?: boolean
  series?: number[]
  delta?: { by: number; good: "up" | "down" }
  size?: "strip" | "tile"
}) {
  const tile = size === "tile"
  return (
    <div className={cn("min-w-0", tile && "flex h-full flex-col")} data-kpi="" data-kpi-size={size}>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={cn("flex items-baseline gap-2", tile ? "mt-auto pt-3" : "mt-1")}>
        <span className={cn("tabular-nums text-foreground", tile ? "text-display" : "text-title-2 font-semibold")}>{value}</span>
        {delta && delta.by !== 0 && (
          <span
            data-delta={delta.by > 0 ? "up" : "down"}
            className={cn("text-xs font-[510] tabular-nums", (delta.by > 0) === (delta.good === "up") ? "text-camp-moss-ink" : "text-danger-ink")}
          >
            {delta.by > 0 ? "↑" : "↓"} {Math.abs(delta.by)} on last week
          </span>
        )}
      </dd>
      {note && <dd className={cn("mt-0.5 text-xs", alert ? "font-[510] text-danger-ink" : "text-ink-3")}>{note}</dd>}
      {series && <Sparkline values={series} />}
    </div>
  )
}
