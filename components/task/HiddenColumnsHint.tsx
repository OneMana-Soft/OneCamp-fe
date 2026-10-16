"use client"

/** A column a board hides: its status's name, and how many tasks it holds when known. */
export interface HiddenColumn {
  value: string
  label: string
  count?: number
}

/**
 * The statuses a board hides, said in a quiet line with Show (PTC-5). Backlog,
 * In review and Cancelled are hidden by default, and nothing said so: a task
 * in Backlog was nowhere on the board. The names and their counts are the
 * line's title, and Show brings every hidden column back.
 */
export function HiddenColumnsHint({ hidden, onShow }: { hidden: HiddenColumn[]; onShow: () => void }) {
  if (hidden.length === 0) return null
  const names = hidden.map((c) => (c.count ? `${c.label} (${c.count})` : c.label)).join(", ")
  return (
    <span data-hidden-columns="" title={`Hidden: ${names}`} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-ui-sm text-ink-3">
      <span>{hidden.length === 1 ? `${hidden[0].label} hidden` : `${hidden.length} statuses hidden`}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        data-touch-target=""
        onClick={onShow}
        aria-label={`Show ${names}`}
        className="rounded-sm font-[510] text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        Show
      </button>
    </span>
  )
}
