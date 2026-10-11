"use client"

/**
 * The assistant before the first question (hub.md AI3): a small composition
 * that says what it reads (an agent square at the centre, a ring, a dashed
 * orbit carrying three hue dots: sky for channels, moss for tasks, dusk for
 * docs, and one brand spark), the title, one true sentence, then questions
 * built from this person's day (components/ai/suggestions). A click asks.
 *
 * The rings draw and the dots pop once per session (lib/hub/motion rise).
 */
import * as React from "react"

import { CalendarDays, CheckCircle2, Hash, Pencil } from "@/lib/icons"
import { SPARK_PATH } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"
import { useRiseOnce } from "@/lib/hub/motion"
import type { Suggestion, SuggestionIcon } from "@/components/ai/suggestions"

const ICON: Record<SuggestionIcon, React.ReactNode> = {
  hash: <Hash />,
  tasks: <CheckCircle2 />,
  calendar: <CalendarDays />,
  pen: <Pencil />,
  spark: (
    <svg viewBox="0 0 24 24" className="fill-current">
      <path d={SPARK_PATH} />
    </svg>
  ),
}

const TILE: Record<Suggestion["hue"], string> = {
  sky: "bg-camp-sky-tint text-camp-sky",
  moss: "bg-camp-moss-tint text-camp-moss",
  sun: "bg-camp-sun-tint text-camp-sun",
  dusk: "bg-camp-dusk-tint text-camp-dusk",
  berry: "bg-camp-berry-tint text-camp-berry",
  lake: "bg-camp-lake-tint text-camp-lake",
  agent: "bg-agent-muted text-agent",
}

/** The 120 × 96 composition. */
export function AiComposition({ play, locked }: { play: boolean; locked?: boolean }) {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden data-ai-composition="" className="overflow-visible">
      <circle className={play ? "hub-draw" : undefined} cx="60" cy="48" r="30" fill="none" stroke="var(--line-2)" strokeWidth="1.5" pathLength={1} strokeDasharray="1" />
      <circle cx="60" cy="48" r="44" fill="none" stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="1.5 5" strokeLinecap="round" />
      <rect x="46" y="34" width="28" height="28" rx="9" fill="var(--agent-a1)" />
      <path transform="translate(52 40) scale(.66)" d={SPARK_PATH} fill="#fff" />
      {[
        { cx: 98, cy: 30, r: 4, fill: "var(--camp-sky)" },
        { cx: 28, cy: 70, r: 4, fill: "var(--camp-moss)" },
        { cx: 30, cy: 22, r: 3.5, fill: "var(--camp-dusk)" },
      ].map((d, i) => (
        <circle key={i} {...d} className={play ? "hub-pop-in" : undefined} style={play ? ({ ["--i" as string]: i } as React.CSSProperties) : undefined} />
      ))}
      <path transform="translate(96 62) scale(.4)" d={SPARK_PATH} fill="var(--brand)" />
      {locked ? (
        <g transform="translate(66 56)">
          <circle r="9" fill="var(--sheet)" />
          <circle r="7.5" fill="var(--ink-2)" />
          <rect x="-3" y="-1" width="6" height="4.5" rx="1" fill="var(--sheet)" />
          <path d="M-2 -1v-1.5a2 2 0 0 1 4 0V-1" fill="none" stroke="var(--sheet)" strokeWidth="1.2" />
        </g>
      ) : null}
    </svg>
  )
}

export function AiEmpty({
  suggestions,
  onAsk,
  layout = "stack",
  locked,
  className,
  children,
}: {
  suggestions: Suggestion[]
  onAsk: (text: string) => void
  layout?: "stack" | "grid"
  /** AI is off for this workspace. */
  locked?: boolean
  className?: string
  /** Between the sentence and the suggestions: the page's composer. */
  children?: React.ReactNode
}) {
  const play = useRiseOnce("ai-empty")
  return (
    <div data-ai-empty="" className={cn("flex flex-col items-center px-5 pt-7 pb-2 text-center", className)}>
      <AiComposition play={play} locked={locked} />
      <h3 className="mt-1.5 text-title-3 font-semibold">{locked ? "AI is off in this workspace" : "Ask about your workspace"}</h3>
      <p className="mt-1 max-w-[300px] text-ui leading-[21px] text-ink-2">
        {locked ? "An admin can turn it on in AI settings." : "It answers from the channels, docs and tasks you can open."}
      </p>
      {children}
      {!locked ? (
        <>
          <div className={cn("mt-[18px] grid w-full gap-2", layout === "grid" ? "sm:grid-cols-2" : "grid-cols-1")}>
            {suggestions.map((s, i) => (
              <button
                key={s.text}
                type="button"
                data-suggestion=""
                onClick={() => onAsk(s.text)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg bg-sheet px-3 py-2.5 text-left text-ui font-medium leading-5 tracking-[-0.005em] shadow-e1 dark:bg-raised",
                  "transition-[box-shadow,translate] duration-[140ms] hover:-translate-y-px hover:shadow-e2 active:translate-y-0 active:scale-[.98]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  play && "hub-rise",
                )}
                style={play ? ({ ["--i" as string]: i } as React.CSSProperties) : undefined}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4", TILE[s.hue])}>{ICON[s.icon]}</span>
                <span className="line-clamp-2 min-w-0">{s.text}</span>
              </button>
            ))}
          </div>
          <p className="mt-3.5 hidden items-center gap-1 text-meta text-ink-3 sm:flex [@media(pointer:coarse)]:hidden">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">J</kbd>
            opens this anywhere
          </p>
        </>
      ) : null}
    </div>
  )
}
