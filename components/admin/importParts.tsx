"use client"

/**
 * The import screens' parts (design v3, admin §A14, mock M5), shared by the
 * Slack import and every other tool's import:
 *
 * - ImportJobFrame: one import as a row. The tool's 28px mark, "Asana ·
 *   Kestrel client work" at 14/510 with where it stands (a dot and a word),
 *   a tabular meta line, and on the right the 160px bar while it runs, the
 *   next step while it waits, or a ⋯ menu once it is done. The "7 errors"
 *   chip (sun, because it means something) opens the error log. On a phone
 *   the right side drops under the words: two lines, not three buttons.
 * - ImportProgressBar: the fill moves by scaleX, never width, with a sheen.
 * - useFinishCelebration: an import finishing on screen is one of the four
 *   moments the area may celebrate (§1.6). Once per import, ever: the ids
 *   already celebrated are kept in this browser, so a reload, a second tab or
 *   a retried run that finishes again stays quiet.
 * - ImportDigest: what came across, streaming in line by line when fresh.
 * - ImportStepper: where a plan dialog sits in the flow.
 */

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { celebrate } from "@/lib/celebrateSoon"
import { springPop } from "@/lib/spring"
import { SourceMark, StateWord, RowMenu, type RowMenuItem, type StateTone } from "@/components/admin/connectParts"
import { AlertTriangle, Sparkles } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** Where an import stands, as a word and a status tone. Running and uploading pulse. */
export const IMPORT_STATE: Record<string, { label: string; tone: StateTone; pulse?: boolean }> = {
  pending: { label: "Uploading", tone: "warning", pulse: true },
  // A Slack import read through Slack's API, while it reads (status pending, stage reading),
  // while it waits for one of the server's reads (queued), and, read, while its
  // workspace's import under way finishes (waiting).
  reading: { label: "Reading", tone: "warning", pulse: true },
  queued: { label: "Queued", tone: "neutral" },
  waiting: { label: "Waiting", tone: "neutral" },
  validating: { label: "To plan", tone: "neutral" },
  planned: { label: "Planned", tone: "info" },
  running: { label: "Running", tone: "warning", pulse: true },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Finished", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rolled_back: { label: "Rolled back", tone: "neutral" },
}

const CELEBRATED_KEY = "onecamp:import-celebrated"

function celebratedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(CELEBRATED_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

/** Marks an import as celebrated; false when it already was. Keeps the last 50. */
export function claimCelebration(jobId: string): boolean {
  const ids = celebratedIds()
  if (ids.includes(jobId)) return false
  try {
    window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...ids, jobId].slice(-50)))
  } catch {
    // Storage refused (a private window): the on-screen transition still
    // limits it to once per visit.
  }
  return true
}

/**
 * Bursts from `el` when `status` turns "completed" while on screen, once per
 * job id. An import that loads finished has no last status, and stays quiet:
 * its news was told already. Returns whether it has just finished, for the
 * digest's stream and ring.
 */
export function useFinishCelebration(jobId: string | undefined, status: string, el: React.RefObject<HTMLElement | null>): boolean {
  const last = useRef<string | null>(null)
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    const was = last.current
    last.current = status
    if (status !== "completed" || was === null || was === "completed") return
    if (jobId && !claimCelebration(jobId)) return
    celebrate(el.current)
    springPop(el.current)
    setFresh(true)
  }, [status, jobId, el])
  return fresh
}

/** The 160×6 bar: the fill scales on X, with a sheen crossing it while it runs. */
export function ImportProgressBar({ pct, running }: { pct: number; running?: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <span
      role="progressbar"
      aria-label={`${clamped}% done`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      data-running={running ? "true" : undefined}
      className="cx-imp-bar"
    >
      <span className="cx-imp-bar-fill bg-progress" style={{ transform: `scaleX(${clamped / 100})` }} />
    </span>
  )
}

/** A number that crossfades when it changes ("4 of 10 parts" → "5 of 10 parts"). */
export function Ticking({ children }: { children: string }) {
  return (
    <span key={children} className="cx-imp-tick">
      {children}
    </span>
  )
}

/** The sun "7 errors" chip; opens the error log. */
export function ErrorsChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" data-import-errors="" className="cx-imp-errors" onClick={onClick}>
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  )
}

/** What came across, in lines that stream in when the import has just finished. */
export function ImportDigest({ digest, fresh }: { digest: string; fresh?: boolean }) {
  const lines = digest.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  return (
    <div data-import-digest="" data-fresh={fresh ? "true" : undefined} className="cx-imp-digest space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        What came across
      </p>
      <p className="max-w-[65ch] text-sm leading-relaxed text-foreground">
        {lines.map((l, i) => (
          <span key={i} className="cx-imp-line block" style={{ "--i": i } as React.CSSProperties}>
            {l}
          </span>
        ))}
      </p>
    </div>
  )
}

export interface ImportJobFrameProps {
  jobId: string
  /** The vendor key ("asana", "slack") and its name, for the mark. */
  vendor: string
  vendorName: string
  /** Shown before the name: "Asana" reads "Asana · Kestrel client work". */
  showVendor?: boolean
  name: string
  status: string
  /** What it is doing now, beside its state while it runs ("Importing threads"). */
  stage?: string
  /** The meta line's pieces, joined by " · ". */
  meta: string[]
  /** 0 to 100, drawn while it runs or is paused. */
  pct?: number
  /** The next steps while it waits or runs, as buttons. */
  actions?: React.ReactNode
  /** The steps once it is done, behind ⋯. */
  menu?: RowMenuItem[]
  errorsLabel?: string
  onShowErrors?: () => void
  /** Lines under the row: why it failed, why it waits, what came across. */
  below?: (fresh: boolean) => React.ReactNode
  highlighted?: boolean
  rowRef?: React.Ref<HTMLDivElement>
}

export function ImportJobFrame({
  jobId,
  vendor,
  vendorName,
  showVendor = true,
  name,
  status,
  stage,
  meta,
  pct,
  actions,
  menu,
  errorsLabel,
  onShowErrors,
  below,
  highlighted,
  rowRef,
}: ImportJobFrameProps) {
  const s = IMPORT_STATE[status] ?? IMPORT_STATE.pending
  const dot = useRef<HTMLSpanElement>(null)
  const fresh = useFinishCelebration(jobId, status, dot)
  const moving = status === "running" || status === "paused" || status === "reading"
  const extra = below?.(fresh)
  return (
    <div
      ref={rowRef}
      data-job-id={jobId}
      data-import-job={status}
      data-highlighted={highlighted ? "true" : undefined}
      tabIndex={highlighted ? -1 : undefined}
      className="cx-imp-job"
    >
      <SourceMark vendor={vendor} name={vendorName} size={28} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {showVendor && <span>{vendorName} · </span>}
            {name}
          </span>
          <span data-import-status={status} className="inline-flex shrink-0">
            <StateWord tone={s.tone} pulse={s.pulse} dotRef={dot}>
              {s.label}
            </StateWord>
          </span>
          {stage && moving && <span className="text-xs text-muted-foreground">{stage}</span>}
        </div>
        <p className="cx-imp-meta mt-0.5 flex min-w-0 flex-wrap gap-x-1">
          {meta.map((m, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-3">
                  ·
                </span>
              )}
              {/^\d[\d,]* of /.test(m) ? <Ticking>{m}</Ticking> : <span>{m}</span>}
            </React.Fragment>
          ))}
        </p>
      </div>
      <div className="cx-imp-job-side">
        {moving && pct !== undefined && <ImportProgressBar pct={pct} running={status === "running"} />}
        {errorsLabel && onShowErrors && <ErrorsChip label={errorsLabel} onClick={onShowErrors} />}
        {actions}
        {menu && menu.length > 0 && <RowMenu label={`More for ${name}`} items={menu} />}
      </div>
      {extra && <div className={cn("cx-imp-job-below space-y-1")}>{extra}</div>}
    </div>
  )
}

/** Where a plan dialog sits in the flow: one 3px segment per step. */
export function ImportStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Steps" className="cx-imp-steps">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "next"
        return (
          <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined} className="cx-imp-step">
            <span aria-hidden="true" className="cx-imp-step-bar" />
            <span className="cx-imp-step-label">
              {label}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Sent by the import picker's Slack card. The Slack section (SlackImportCard)
 * owns the upload and opens it; here, so the picker needn't load that card.
 */
export const SLACK_IMPORT_NEW_EVENT = "onecamp:slack-import-new"

/** The three steps every import really takes. */
export const SLACK_STEPS = ["Upload the export", "Check the plan", "Bring it in"]
/** A read through Slack's API takes the same three, read rather than uploaded. */
export const SLACK_READ_STEPS = ["Read from Slack", "Check the plan", "Bring it in"]
export const TOOL_STEPS = ["Connect", "Check the plan", "Bring it in"]
