"use client"

import { MenuCheck } from "@/components/ui/menuCheck"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2 } from "@/lib/icons"
import { nextChoice, shares, type PollOption } from "@/services/pollService"

/**
 * A poll's options as one reader votes in them, the same in a message (chat's
 * PollView) and in a call (its Polls and Q&A): one click to choose, the
 * choice marked, and each option's bar and count as the votes come in.
 * Clicking your choice again takes it back. Without counts (a call's poll
 * whose results are held back from you) the bars stay empty and only your
 * own choice shows.
 */
export function PollChoices({
  poll,
  busy,
  onChoose,
  counts = true,
}: {
  poll: { multiple: boolean; mine: string[]; closed: boolean; options: PollOption[] }
  /** The option being sent, or any other work in flight ("close"): every option waits. */
  busy: string | null
  /** The reader's choices after this click, and the option clicked. */
  onChoose: (next: string[], optionId: string) => void
  counts?: boolean
}) {
  const pct = shares(poll.options)
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {poll.options.map((o, i) => {
        const mine = poll.mine.includes(o.id)
        return (
          <li key={o.id} className="m-0 p-0">
            <button
              type="button"
              disabled={poll.closed || !!busy}
              aria-pressed={mine}
              onClick={() => onChoose(nextChoice(poll, o.id), o.id)}
              className={cn(
                "relative flex min-h-9 w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-1.5 text-left text-ui text-ink transition-colors [@media(pointer:coarse)]:min-h-11",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default",
                mine ? "text-brand-text" : "hover:bg-hover",
              )}
            >
              <span
                aria-hidden
                // The fill grows by scaling, never by animating its width.
                className={cn("absolute inset-0 origin-left transition-transform duration-[320ms] ease-[var(--ease-out)] motion-reduce:transition-none", mine ? "bg-brand-muted" : "bg-press")}
                style={{ transform: `scaleX(${counts ? pct[i] / 100 : mine ? 1 : 0})` }}
              />
              <span className="relative flex min-w-0 items-center gap-2">
                {/* The shared check's slot holds its place, so an option's words never move as it's chosen (oneMenuCheck). */}
                {busy === o.id ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <MenuCheck checked={mine} />}
                <span className="break-words">{o.text}</span>
              </span>
              {counts ? (
                <span className="relative shrink-0 text-meta tabular-nums text-ink-3">
                  {o.votes} · {pct[i]}%
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
