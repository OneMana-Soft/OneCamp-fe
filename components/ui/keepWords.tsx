import { cn } from "@/lib/utils/helpers/cn"

/**
 * `text` as it is drawn (trimmed, one space between words), cut after its first `words` words: the head, and the rest
 * with its leading space ("" when there's no more). Fewer than one word (0, a negative, NaN) keeps none: ["", text].
 */
export function splitWords(text: string, words: number): [string, string] {
  const shown = text.trim().replace(/\s+/g, " ")
  if (!(words >= 1)) return ["", shown]
  const at = [...shown.matchAll(/\S+/g)][Math.floor(words) - 1]
  if (!at || at.index === undefined) return [shown, ""]
  const end = at.index + at[0].length
  return [shown.slice(0, end), shown.slice(end)]
}

/**
 * A name in a crowded row that keeps its first `words` words whole and lets only the rest give (an ellipsis), so
 * what sits beside it in the row gives first (V-280: at 1280 "Q4 launch" read "Q4 l…" beside its next milestone).
 * Its floor is its head's width, capped at its cell: a head wider than the cell (one long word, a name with no
 * spaces, a narrow window) ellipsizes rather than paint past it (CR-202). The whole name is its title.
 */
export function KeepWords({ text, words = 2, className }: { text: string; words?: number; className?: string }) {
  const [head, tail] = splitWords(text, words)
  return (
    <span title={text} className={cn("flex max-w-full", className)}>
      {head && <span className="max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-pre">{head}</span>}
      {tail && <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">{tail}</span>}
    </span>
  )
}
