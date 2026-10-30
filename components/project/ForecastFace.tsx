import type { ReactNode } from "react"
import { SignalDot } from "@/components/projectUpdates/HealthPill"

/**
 * A project's forecast as it is said everywhere (linear-20): "Lands ~25 Nov", and, held up, the at-risk dot and
 * "· held up" in words too, never by the dot's colour alone. ONE face: the project header's chip wraps it in its
 * button (with its calendar mark when on pace), and a listed project's line (ForecastWhen) in a quiet span. Its
 * parts are the wrapper's flex items, so the wrapper sets the gap and the size; when room runs out, the date's words
 * give (they truncate) and "held up" stays.
 */
export function ForecastFace({ lands, held, pace }: { lands: string; held: boolean; pace?: ReactNode }) {
  return (
    <>
      {held ? <SignalDot health="at_risk" /> : pace}
      <span className="min-w-0 truncate tabular-nums">{lands}</span>
      {held && <span className="shrink-0 text-ink-2">· held up</span>}
    </>
  )
}
