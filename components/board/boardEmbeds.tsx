"use client"

import * as React from "react"
import type { BoardEmbed } from "@/lib/board/cards"
import { Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * What a link on a board draws without reading anything (lib/board/cards says
 * which a link is): another site, framed as a doc frames it (its own address,
 * sandbox, permissions and referrer rule, from lib/embeds/providers), and a
 * card's shell. A guest's board draws only these, so a guest's page never
 * loads the app's store or reads a card (components/board/boardCard draws the
 * live card for members).
 */

/** What a card's kind is called, as the chips call it (boardCard.test holds them to lib/liveEntity's nouns). */
export const CARD_NOUNS: Readonly<Record<string, string>> = { task: "task", doc: "page", project: "project" }

/**
 * Where the pointer is with a card, as Excalidraw keeps it: over its middle ("hover": a click there lets the card's
 * buttons work, a press anywhere else moves it), in use ("active"), or neither.
 */
export type CardPointer = "hover" | "active" | null

export type EmbedView = React.ComponentType<{ embed: NonNullable<BoardEmbed>; pointer?: CardPointer }>

/**
 * A card's box: the place Excalidraw keeps for the embeddable, filled. Over its middle or in use, it is ringed in
 * the brand's colour, in place of Excalidraw's own pill, which covered the card's name (the board's stylesheet hides
 * that pill on cards).
 */
export function CardShell({
  kind,
  state,
  label,
  pointer = null,
  children,
}: {
  kind: string
  state: string
  label: string
  pointer?: CardPointer
  children: React.ReactNode
}) {
  return (
    <div
      data-board-card={kind}
      data-card-state={state}
      data-card-pointer={pointer ?? undefined}
      role="group"
      aria-label={label}
      aria-busy={state === "loading" || undefined}
      className={cn(
        "flex size-full flex-col gap-1.5 overflow-hidden rounded-[inherit] border border-line bg-raised p-3 text-left shadow-e1 transition-shadow",
        pointer && "ring-2 ring-inset ring-brand",
      )}
    >
      {children}
    </div>
  )
}

/** What a click on a card's middle does, said in its top row while the pointer is there: never over its name. */
export function UseHint({ pointer }: { pointer?: CardPointer }) {
  if (pointer !== "hover") return null
  return <span className="shrink-0 rounded-sm bg-brand-muted px-1.5 text-meta font-[510] text-brand-text">Click to use</span>
}

/** Another site, framed as a doc frames it. */
export function EmbedFrame({ embed }: { embed: Extract<NonNullable<BoardEmbed>, { frame: unknown }> }) {
  const f = embed.frame
  return (
    <iframe
      src={f.src}
      title={`${f.name} embed`}
      sandbox={f.sandbox}
      allow={f.allow}
      referrerPolicy={f.referrerPolicy}
      loading="lazy"
      data-board-frame={f.provider}
      className="size-full rounded-[inherit] border-0 bg-raised"
    />
  )
}

/** A card a guest sees: what kind of thing it is, never its name. */
export function ShutCard({ kind }: { kind: string }) {
  const noun = CARD_NOUNS[kind] ?? "item"
  return (
    <CardShell kind={kind} state="shut" label={`A OneCamp ${noun}`}>
      <span className="flex items-center gap-1.5 text-meta text-ink-3">
        <Lock className="size-3.5" aria-hidden="true" />
        {`A OneCamp ${noun}`}
      </span>
      <span className="text-meta text-ink-3">Members of the workspace see it here.</span>
    </CardShell>
  )
}

/** A guest's board: frames, and shut cards. */
export default function GuestEmbedView({ embed }: { embed: NonNullable<BoardEmbed> }) {
  return "frame" in embed ? <EmbedFrame embed={embed} /> : <ShutCard kind={embed.card.kind} />
}
