import { campHueOf } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { parseFieldConfig, type TableField } from "@/services/tableService"

/**
 * An option's chip, wherever a table shows one: the members' grid and board,
 * the record panel and a guest's read-only view (content.md §1.4, T08).
 *
 * By default a chip is NEUTRAL: the --hover fill with an inset --line ring and
 * a 6 px dot in the option's hue, so a grid of twenty select columns stays
 * calm and the colour names the option without painting the cell. A column
 * whose options carry meaning (Status, Priority) may switch on "Tinted chips"
 * in its column menu; then each option takes its camp hue's tint behind its
 * ink. Options are categories, not statuses, so a picked colour is a camp hue,
 * never danger or success.
 *
 * One function, so a member and a guest see the same chip.
 */
export function optionColorClass(color?: string | null, tinted = false): string {
  const hue = campHueOf(color)
  if (tinted && hue) return `${HUE_CLASS[hue]} bg-hue-tint text-hue-ink`
  return "bg-hover text-ink ring-1 ring-inset ring-line"
}

/** Whether a select column has opted into tinted chips (its config's "tinted"). */
export function chipsTinted(field: TableField | undefined | null): boolean {
  return !!field && parseFieldConfig(field).tinted === true
}

/**
 * The columns of a table whose chips are tinted: each that switched it on,
 * or, while none has, the table's first single select, unless it switched it
 * off. That is the column a board groups by unless told otherwise, the one
 * most like a status: Notion's tinted pills read state faster than a dot (the
 * rivals review, 16 Oct 2026), and one tinted column a table keeps the grid
 * calm, as the column menu advises.
 */
export function tintedFields(fields: TableField[]): Set<string> {
  const said = fields.filter((f) => parseFieldConfig(f).tinted === true)
  if (said.length) return new Set(said.map((f) => f.id))
  const first = fields.filter((f) => f.type === "select").sort((a, b) => a.position - b.position)[0]
  return first && parseFieldConfig(first).tinted !== false ? new Set([first.id]) : new Set()
}

export function OptionChip({
  label,
  color,
  tinted = false,
  className,
}: {
  label: string
  color?: string | null
  /** The column opted into tinted chips. */
  tinted?: boolean
  className?: string
}) {
  const hue = campHueOf(color)
  const showTint = tinted && !!hue
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full shrink-0 items-center gap-1.5 truncate rounded-md px-2 text-meta font-medium",
        optionColorClass(color, tinted),
        className,
      )}
      data-option-chip=""
      data-tinted={showTint || undefined}
    >
      {!showTint ? (
        <span
          aria-hidden="true"
          data-chip-dot=""
          className={cn("size-1.5 shrink-0 rounded-[3px]", hue ? cn(HUE_CLASS[hue], "bg-hue") : "bg-ink-3")}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  )
}
