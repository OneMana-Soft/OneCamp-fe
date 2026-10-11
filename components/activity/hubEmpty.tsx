/**
 * The hub's empty, caught-up and failed states (hub.md A9, L7): start-aligned
 * in the column where the rows begin, never centred in the screen. Each carries
 * a small spot v3: a tinted disc in the state's hue, the thing itself on a
 * raised tile, a sun dot and the one brand spark.
 */
import type { ReactNode } from "react"

import { Bell, Bookmark, Check, Search, Shield } from "@/lib/icons"
import { SPARK_PATH } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"

export type HubSpotKind = "bell" | "shield" | "bookmark" | "check" | "search"

const SPOT: Record<HubSpotKind, { tint: string; ink: string; glyph: ReactNode }> = {
  bell: { tint: "var(--camp-sky-tint)", ink: "text-camp-sky", glyph: <Bell /> },
  shield: { tint: "var(--agent-muted)", ink: "text-agent", glyph: <Shield /> },
  bookmark: { tint: "var(--camp-dusk-tint)", ink: "text-camp-dusk", glyph: <Bookmark /> },
  check: { tint: "var(--camp-moss-tint)", ink: "text-camp-moss", glyph: <Check /> },
  search: { tint: "var(--camp-lake-tint)", ink: "text-camp-lake", glyph: <Search /> },
}

export function HubSpot({ kind, size = 64 }: { kind: HubSpotKind; size?: number }) {
  const s = SPOT[kind]
  return (
    <span aria-hidden data-hub-spot={kind} className="relative block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full overflow-visible">
        <circle cx="32" cy="32" r="27" fill={s.tint} />
        <circle cx="32" cy="32" r="31" fill="none" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="1.5 4" strokeLinecap="round" />
        <circle cx="56" cy="44" r="2.5" fill="var(--camp-sun)" />
        <path transform="translate(46 4) scale(.5)" d={SPARK_PATH} fill="var(--brand)" />
      </svg>
      <span className={cn("absolute left-1/2 top-1/2 grid size-[44%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[30%] bg-raised shadow-e2 [&_svg]:size-[46%]", s.ink)}>
        {s.glyph}
      </span>
    </span>
  )
}

export function HubEmpty({
  spot,
  title,
  description,
  action,
  role,
}: {
  spot: HubSpotKind
  title: string
  description?: ReactNode
  action?: ReactNode
  role?: "status" | "alert"
}) {
  return (
    <div data-hub-empty="" role={role} className="flex max-w-[520px] items-start gap-4 text-left">
      <HubSpot kind={spot} />
      <div className="min-w-0 pt-1.5">
        <h2 className="text-heading text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-ui text-ink-2">{description}</p> : null}
        {action ? <div className="mt-3 flex gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

/** A failed load (A9): a sunken r12 card with the sentence and a ghost Try again. */
export function HubError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div data-hub-error="" role="alert" className="flex w-full max-w-[520px] items-center gap-3 rounded-lg bg-sunken px-4 py-3 ring-1 ring-inset ring-line">
      <p className="min-w-0 flex-1 text-xs text-ink-2">{text}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="h-7 rounded-md px-2.5 text-xs font-medium text-ink-2 hover:bg-hover hover:text-foreground">
          Try again
        </button>
      ) : null}
    </div>
  )
}
