"use client"

/**
 * Citations, as the hub draws them (hub.md S11 and AI8): an inline marker is a
 * 16px circle in the agent's tint, and each source is a 26px chip with its
 * number, a type glyph and its title. Hovering a marker lifts its chip, and
 * hovering a chip lifts its marker, so the reader sees which passage came from
 * where. External sources (Gmail, GitHub) carry an arrow and open in a new tab.
 */
import * as React from "react"

import { ArrowUpRight, FileText, Github, Hash, Mail, MessageSquare, CheckSquare, FolderKanban } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

export function CitationMarker({
  n,
  title,
  lit,
  onHover,
  onOpen,
}: {
  n: number
  title?: string
  lit?: boolean
  onHover?: (n: number | null) => void
  onOpen?: () => void
}) {
  return (
    <button
      type="button"
      data-citation-marker={n}
      title={title}
      aria-label={title ? `Source ${n}: ${title}` : `Source ${n}`}
      onMouseEnter={() => onHover?.(n)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(n)}
      onBlur={() => onHover?.(null)}
      onClick={onOpen}
      className={cn(
        "hub-cite-num relative -top-0.5 mx-px inline-grid size-4 place-items-center align-middle transition-shadow",
        lit && "shadow-e1",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
      )}
    >
      {n}
    </button>
  )
}

/** The glyph for a source's kind: what it is, in ink-3. */
function SourceGlyph({ kind, source }: { kind?: string; source?: string }) {
  const k = (kind || "").toLowerCase()
  const Icon =
    source === "gmail" ? Mail : source === "github" ? Github : k.includes("task") ? CheckSquare : k.includes("doc") ? FileText : k.includes("project") ? FolderKanban : k.includes("channel") ? Hash : MessageSquare
  return <Icon className="size-3.5 shrink-0 text-ink-3" />
}

export function CitationChip({
  n,
  title,
  kind,
  source,
  external,
  disabled,
  lit,
  step = 0,
  onHover,
  onOpen,
}: {
  n: number
  title: string
  kind?: string
  source?: string
  external?: boolean
  disabled?: boolean
  lit?: boolean
  /** Its place in the row, for the 30ms opacity stagger. */
  step?: number
  onHover?: (n: number | null) => void
  onOpen?: () => void
}) {
  return (
    <button
      type="button"
      data-citation-chip={n}
      data-lit={lit ? "" : undefined}
      disabled={disabled}
      onMouseEnter={() => onHover?.(n)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(n)}
      onBlur={() => onHover?.(null)}
      onClick={onOpen}
      style={{ animationDelay: `${step * 30}ms` }}
      className={cn(
        "hub-fade-in inline-flex h-[26px] max-w-[200px] items-center gap-1.5 rounded-md bg-sheet py-0 pl-[5px] pr-2 text-left text-meta font-medium hub-source-chip transition-shadow dark:bg-raised",
        lit && "hub-lit",
        !disabled && "hub-lit-hover",
        disabled && "cursor-default",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      )}
    >
      <span className="hub-cite-num grid size-4 shrink-0 place-items-center">{n}</span>
      <SourceGlyph kind={kind} source={source} />
      <span className="min-w-0 truncate">{title || "Untitled"}</span>
      {external ? <ArrowUpRight className="size-3 shrink-0 text-ink-3" aria-label="opens in a new tab" /> : null}
    </button>
  )
}
