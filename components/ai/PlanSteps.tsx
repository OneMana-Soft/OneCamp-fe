"use client"

/**
 * The work behind an answer, as typed steps (hub.md AI7; Linear's agent
 * activities, Claude's collapsed reasoning).
 *
 * A disclosure row sits above the answer: "Working · step 2 of 4" with the
 * shimmer while it runs, "Worked through 4 steps · 3.2 s" after. Expanded while
 * it runs, it folds 400 ms after the answer's first words arrive; a person who
 * opens it again keeps it open for the session. Each step is a 28 px row on a
 * hairline connector with a 14 px glyph:
 *
 *   running   an agent-hued ring spinning (the one spinner the assistant keeps,
 *             because it is a step's own state, not a wait);
 *   done      a moss disc with a check that springs as it lands;
 *   refused   an agent-tint shield: the permission system answering, never red;
 *   failed    a danger-ink x;
 *   thought   no glyph, ink-3 text.
 *
 * The server streams steps as `step` events (services/aiService); an answer
 * with none shows no plan at all.
 */
import * as React from "react"

import { Check, ChevronDown, Shield, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type PlanStepState = "running" | "done" | "refused" | "failed" | "thought"

export interface PlanStep {
  id: string
  text: string
  state: PlanStepState
  /** How long it took, once it has. */
  ms?: number
}

const OPEN_KEY = "ai-plan-open"
const FOLD_AFTER_MS = 400

/** The disclosure row's words. Pure. */
export function planSummary(steps: PlanStep[], running: boolean): string {
  const real = steps.filter((s) => s.state !== "thought")
  if (running) {
    const at = real.findIndex((s) => s.state === "running")
    const n = at >= 0 ? at + 1 : real.length
    return `Working · step ${Math.max(1, n)} of ${Math.max(1, real.length)}`
  }
  return `Worked through ${real.length} step${real.length === 1 ? "" : "s"}`
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function StepGlyph({ state }: { state: PlanStepState }) {
  if (state === "running")
    return (
      <span
        data-step-glyph="running"
        aria-label="Running"
        className="block size-3 animate-spin rounded-full border-[1.5px] border-[color-mix(in_oklab,var(--agent)_25%,transparent)] border-r-agent border-t-agent [animation-duration:900ms]"
      />
    )
  if (state === "done")
    return (
      <span data-step-glyph="done" aria-label="Done" className="grid size-3.5 place-items-center rounded-full bg-camp-moss text-white motion-safe:animate-spring dark:text-frame">
        <Check className="size-[9px]" />
      </span>
    )
  if (state === "refused")
    return (
      <span data-step-glyph="refused" aria-label="Refused" className="grid size-3.5 place-items-center rounded-full bg-agent-muted text-agent-ink">
        <Shield className="size-[9px]" />
      </span>
    )
  if (state === "failed")
    return (
      <span data-step-glyph="failed" aria-label="Failed" className="grid size-3.5 place-items-center text-danger-ink">
        <X className="size-3" />
      </span>
    )
  return null
}

function readOpenChoice(): boolean {
  try {
    return window.sessionStorage.getItem(OPEN_KEY) === "1"
  } catch {
    return false
  }
}

export function PlanSteps({ steps, running, answering, totalMs }: { steps: PlanStep[]; running: boolean; answering: boolean; totalMs?: number }) {
  const [kept, setKept] = React.useState(false)
  const [folded, setFolded] = React.useState(!running)
  React.useEffect(() => setKept(readOpenChoice()), [])

  // Fold 400 ms after the first words of the answer, unless the person chose to keep it open.
  React.useEffect(() => {
    if (!answering || kept) return
    const t = window.setTimeout(() => setFolded(true), FOLD_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [answering, kept])

  if (steps.length === 0) return null
  const open = !folded || kept
  const toggle = () => {
    const next = !open
    setFolded(!next)
    setKept(next)
    try {
      window.sessionStorage.setItem(OPEN_KEY, next ? "1" : "0")
    } catch {
      /* a private window: the choice lasts this render tree */
    }
  }
  const total = totalMs ?? steps.reduce((sum, s) => sum + (s.ms ?? 0), 0)

  return (
    <div data-plan="" data-open={open ? "" : undefined} className="text-ui-sm">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex h-6 items-center gap-1.5 font-medium text-ink-2 hover:text-foreground">
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform duration-[180ms]", open && "rotate-180")} aria-hidden />
        <span className={running ? "hub-shimmer" : undefined}>{planSummary(steps, running)}</span>
        {!running && total > 0 ? <span className="text-meta font-normal text-ink-3 tabular-nums">· {secs(total)}</span> : null}
      </button>
      {open ? (
        <ol className="relative mt-1 before:absolute before:bottom-3.5 before:left-[6.5px] before:top-3.5 before:w-px before:bg-line-2">
          {steps.map((s) => (
            <li key={s.id} data-step={s.state} className="relative grid h-7 grid-cols-[14px_1fr_auto] items-center gap-2.5 text-ink-2">
              <span className="relative grid size-3.5 place-items-center rounded-full bg-sheet dark:bg-panel">
                <StepGlyph state={s.state} />
              </span>
              <span className={cn("min-w-0 truncate", s.state === "thought" && "text-meta text-ink-3")}>{s.text}</span>
              {s.ms ? <span className="font-mono text-3xs text-ink-3">{secs(s.ms)}</span> : <span />}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

/** The agent asks you something mid-plan (an elicitation): options as buttons, or a short answer. */
export function PlanElicitation({ question, options, onAnswer }: { question: string; options?: string[]; onAnswer: (answer: string) => void }) {
  const [text, setText] = React.useState("")
  return (
    <div data-elicitation="" className="relative mt-2 overflow-hidden rounded-lg bg-raised p-3 pl-4 shadow-e1 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-agent">
      <p className="text-ui font-medium">{question}</p>
      {options && options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Button key={o} size="sm" variant="secondary" onClick={() => onAnswer(o)}>
              {o}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) onAnswer(text.trim())
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" className="h-8" />
          <Button size="sm" type="submit" disabled={!text.trim()}>
            Send
          </Button>
        </form>
      )}
    </div>
  )
}
