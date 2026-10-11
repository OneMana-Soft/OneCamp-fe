"use client"

import "./ai.css"
/**
 * The marks that tie an answer to what it read (hub.md S11, AI8): inline
 * markers, 16 px circles in the agent tint, and the source chips under the
 * answer. Hovering either lights the other: the chip rises to e2 with an agent
 * ring, the marker to e1. Numbering is components/ai/citations.ts.
 */
import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { ArrowUpRight } from "@/lib/icons"

export interface CitationContextValue {
  /** The model's number to the number shown; a marker not in it is dropped. */
  shown: Map<number, number>
  hovered: number | null
  setHovered: (n: number | null) => void
  /** Opens the source behind a shown number. */
  open?: (shownNumber: number) => void
}

export const CitationContext = React.createContext<CitationContextValue | null>(null)

/**
 * A [n] in Markdown: a marker inside an answer with sources (dropped when it
 * names none), and the brackets as written anywhere else.
 */
export function CiteToken({ n, raw }: { n: number; raw: string }) {
  const ctx = React.useContext(CitationContext)
  if (!ctx) return <>{raw}</>
  return <CiteMarker n={n} />
}

/** One inline marker. Renders nothing for a number that names no source. */
export function CiteMarker({ n }: { n: number }) {
  const ctx = React.useContext(CitationContext)
  const shown = ctx?.shown.get(n)
  if (!ctx || !shown) return null
  const lit = ctx.hovered === shown
  return (
    <button
      type="button"
      data-cite={shown}
      data-lit={lit ? "" : undefined}
      aria-label={`Source ${shown}`}
      onMouseEnter={() => ctx.setHovered(shown)}
      onMouseLeave={() => ctx.setHovered(null)}
      onFocus={() => ctx.setHovered(shown)}
      onBlur={() => ctx.setHovered(null)}
      onClick={() => ctx.open?.(shown)}
      className={cn(
        "mx-px inline-grid size-4 place-items-center rounded-full bg-agent-muted align-[2px] text-3xs font-semibold leading-none text-agent-ink transition-shadow",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        lit && "shadow-e1",
      )}
    >
      {shown}
    </button>
  )
}

export interface SourceChipItem {
  key: string
  n?: number
  title: string
  glyph?: React.ReactNode
  external?: boolean
  onOpen: () => void
  /** The full preview, as the chip's tooltip. */
  hint?: string
}

/** The sources as 26 px chips: number, glyph, title. More than six fold into "+N more". */
export function SourceChips({ items, label = "Sources", className }: { items: SourceChipItem[]; label?: string; className?: string }) {
  const ctx = React.useContext(CitationContext)
  const [all, setAll] = React.useState(false)
  if (items.length === 0) return null
  const visible = all ? items : items.slice(0, 6)
  const more = items.length - visible.length
  return (
    <div className={cn("mt-3 min-w-0", className)} data-sources="">
      <p className="mb-1.5 text-meta font-medium text-ink-3">{label}</p>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {visible.map((it) => {
          const lit = it.n !== undefined && ctx?.hovered === it.n
          return (
            <button
              key={it.key}
              type="button"
              data-source-chip={it.n ?? ""}
              data-lit={lit ? "" : undefined}
              title={it.hint || it.title}
              onClick={it.onOpen}
              onMouseEnter={() => it.n !== undefined && ctx?.setHovered(it.n)}
              onMouseLeave={() => ctx?.setHovered(null)}
              className={cn(
                "ai-source-chip inline-flex h-[26px] min-w-0 max-w-[200px] items-center gap-1.5 rounded-md bg-sheet pl-[5px] pr-2 text-meta font-medium shadow-e1 transition-shadow dark:bg-raised",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              )}
            >
              {it.n !== undefined ? (
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-agent-muted text-3xs font-semibold leading-none text-agent-ink">
                  {it.n}
                </span>
              ) : null}
              {it.glyph ? <span className="grid size-3.5 shrink-0 place-items-center text-ink-3 [&_svg]:size-3.5">{it.glyph}</span> : null}
              <span className="min-w-0 truncate">{it.title}</span>
              {it.external ? <ArrowUpRight className="size-3 shrink-0 text-ink-3" aria-label="Opens outside OneCamp" /> : null}
            </button>
          )
        })}
        {more > 0 ? (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex h-[26px] items-center rounded-md px-2 text-meta font-medium text-ink-2 hover:bg-hover"
          >
            +{more} more
          </button>
        ) : null}
      </div>
    </div>
  )
}
