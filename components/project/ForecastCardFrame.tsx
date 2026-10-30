import type { ReactNode } from "react"
import { holdWords, openCutWords, paceWords, rangeWords, type ForecastHold, type ProjectForecast } from "@/lib/work/forecast"

/** What the card is drawn from: the project's forecast, the chip's words for its date, and whether late work holds it up. */
export interface ForecastCardProps {
  forecast: ProjectForecast
  lands: string
  held: boolean
}

const asWords = (words: string): ReactNode => words
const asLine = (_: ForecastHold, line: ReactNode): ReactNode => line

/**
 * The forecast card (linear-20), drawn in ONE place from the card's own props,
 * for the card and for its slot: the date and how it's forecast (or that late
 * work moves it), the pace's range and the pace, the late tasks on the
 * critical path that hold the date up (the first few; "and more" when there
 * are more), then, only when the server counted some of a very large
 * project's open tasks, the one sentence that says so.
 *
 * ForecastCard, a chunk of its own, draws it with its words, each late task a
 * link to its task. While that chunk comes, the chip's CardSlot draws it with
 * each run of words as a bar of that run's room, hidden from a screen reader.
 * So the slot holds the room of every shape of the card, line for line and
 * wrap for wrap, and the phone's sheet and the laptop's popover open once
 * (DB-36, DB-37). On the chip's chunk.
 */
export function ForecastCardFrame({
  forecast,
  lands,
  held,
  ink = asWords,
  task = asLine,
  "aria-hidden": hidden,
}: ForecastCardProps & {
  /** How a run of the card's words is drawn: as the words, or as a bar of their room. */
  ink?: (words: string) => ReactNode
  /** What a late task's line is: in the card, a link to its task. */
  task?: (hold: ForecastHold, line: ReactNode) => ReactNode
  "aria-hidden"?: boolean
}) {
  const range = rangeWords(forecast)
  const cut = openCutWords(forecast)
  return (
    <div aria-hidden={hidden} className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-sm font-[590] text-foreground tabular-nums">{ink(lands)}</p>
        <p className="text-meta text-ink-3">
          {ink(held ? "Late work it waits on moves it past the pace." : "At the pace its tasks got done lately, and after what they wait on.")}
        </p>
      </div>
      <dl className="space-y-2 text-meta">
        {range && <Row term={ink("At this pace")}>{ink(range)}</Row>}
        <Row term={ink("Pace")}>{ink(paceWords(forecast))}</Row>
        {forecast.held_by.length > 0 && (
          <div>
            <dt className="text-ink-3">{ink("Held up by")}</dt>
            {forecast.held_by.map((h) => (
              // One line each, cut short with an ellipsis.
              <dd key={h.task_uuid} className="min-w-0">
                {task(h, <span className="block truncate">{ink(holdWords(h))}</span>)}
              </dd>
            ))}
            {forecast.held_count > forecast.held_by.length && <dd className="text-ink-3">{ink("and more late work")}</dd>}
          </div>
        )}
      </dl>
      {cut && (
        <p data-forecast-cut="" className="text-meta text-ink-3">
          {ink(cut)}
        </p>
      )}
    </div>
  )
}

/** One of the card's rows: what it is, then its value. */
function Row({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-3">{term}</dt>
      <dd className="text-ink tabular-nums">{children}</dd>
    </div>
  )
}
