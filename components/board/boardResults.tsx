"use client"

import { ix } from "@/lib/ui/interactive"

export interface ResultsListProps {
  /** A closed round's notes, most votes first. */
  results: { id: string; count: number }[]
  textOf: (id: string) => string
  /** Goes to a row's note. */
  onGo: (id: string) => void
}

/**
 * A closed round's results, most votes first: the list in the facilitation bar's Results, whose button
 * and popover (a sheet on a phone) the bar draws itself (components/board/boardFacilitation). It comes
 * with the bar's own code, which is a chunk of its own (page.tsx: lazyPart), so Results opens whole, with
 * no loading state between the button and the list (design review, 29 Oct). A row goes to its note.
 */
export default function ResultsList({ results, textOf, onGo }: ResultsListProps) {
  if (results.length === 0) return <p className="text-ui-sm text-ink-2">Nobody voted.</p>
  const max = results[0].count || 1
  return (
    <ol className="grid w-72 gap-0.5 max-sm:w-full">
      {results.slice(0, 10).map((r, i) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onGo(r.id)}
            {...ix("item")}
            className="relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-ui max-sm:h-12"
          >
            <span
              aria-hidden="true"
              className="board-grow absolute inset-y-1 left-1 origin-left rounded-md bg-press"
              style={{ width: `calc(${(r.count / max) * 100}% - 8px)`, ["--i" as string]: i }}
            />
            <span className="relative w-4 text-meta tabular-nums text-ink-3">{i + 1}</span>
            <span className="relative min-w-0 flex-1 truncate text-ink">{textOf(r.id)}</span>
            <span className="relative text-meta font-semibold tabular-nums text-ink">{r.count}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
