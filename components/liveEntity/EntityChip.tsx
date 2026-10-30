"use client"

import * as React from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { CHIP_TONE } from "@/lib/ui/chipTone"
import { entityKind, followHref, onMiddleClick, refreshEntity, useLiveEntity, useToday } from "@/lib/liveEntity"
import { useHoverIntent } from "@/lib/hub/hoverIntent"
import { Lock } from "@/lib/icons"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const CardPopover = lazyPiece(() => import("./EntityCardPopover"))

/**
 * A thing named in a line (Live Entity Chips, docs C1): a task, a page, a
 * project, a person or a date, drawn as its kind says (lib/liveEntity) and
 * kept live. Inline and at the text's size, like an @mention, so a line that
 * holds one is no taller.
 *
 * Something the reader can't open reads "No access" and never its name; a
 * deleted one says so; one that couldn't be read says that, and a click
 * tries again (I19). While it loads it holds a quiet place, never the name
 * the line was written with.
 */
export function EntityChip({ kind, id, selected, className }: { kind: string; id: string; selected?: boolean; className?: string }) {
  const spec = entityKind(kind)
  const live = useLiveEntity(kind, id)
  const today = useToday()
  const router = useAppRouter()
  // Its card, and whether the keyboard asked for it (then the card takes the focus, and gives it back).
  const [card, setCard] = React.useState<{ at: HTMLElement; keyed: boolean } | null>(null)
  const keyed = React.useRef(false)
  // Enter opens the thing, as a link does; Space shows its card, as a preview.
  const hover = useHoverIntent({
    open: (at) => setCard({ at, keyed: keyed.current }),
    close: () => setCard(null),
    enabled: !!spec?.card && live.state === "ok",
    key: " ",
  })
  if (!spec) return null

  const Icon = spec.icon
  const view = live.state === "ok" && live.data !== undefined ? spec.view(live.data, id, { today }) : null
  // A thing the reader can't open may still open its page (a doc's offers Request access).
  const href = live.state === "ok" || (live.state === "none" && spec.opensWithoutAccess) ? spec.href(id, live.data) : null

  const open = (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (live.state === "error") return refreshEntity(kind, id)
    const newTab = "metaKey" in e && (e.metaKey || e.ctrlKey || (e as React.MouseEvent).button === 1)
    if (live.state === "ok" && !newTab && spec.open?.(id, live.data, e.currentTarget)) return
    if (href) followHref(href, e as React.MouseEvent, router.push)
  }

  const quiet = "text-ink-3"
  let body: React.ReactNode
  let label: string
  switch (live.state) {
    case "ok":
      label = `${spec.noun[0].toUpperCase()}${spec.noun.slice(1)}: ${view?.tag ? `${view.tag} ` : ""}${view?.title ?? ""}`
      body = (
        <>
          {view?.lead ?? <Icon className="size-3.5 text-ink-3" aria-hidden="true" />}
          {view?.tag ? <span className={cn("shrink-0 font-normal tabular-nums", quiet)}>{view.tag}</span> : null}
          <span className="min-w-0 truncate">{view?.title}</span>
          {view?.trailing ? <span className={cn("shrink-0 font-normal", view.tone ? "" : quiet)}>{view.trailing}</span> : null}
        </>
      )
      break
    case "none":
      label = `A ${spec.noun} you can't open`
      body = (
        <>
          <Lock className="size-3.5" aria-hidden="true" />
          <span>No access</span>
        </>
      )
      break
    case "gone":
      label = `A deleted ${spec.noun}`
      body = (
        <>
          <Icon className="size-3.5" aria-hidden="true" />
          <span>Deleted {spec.noun}</span>
        </>
      )
      break
    case "error":
      label = `This ${spec.noun} couldn't be loaded. Select to try again.`
      body = (
        <>
          <Icon className="size-3.5" aria-hidden="true" />
          <span>Couldn&apos;t load</span>
          <SaysLoadFailure />
        </>
      )
      break
    default:
      label = `Loading a ${spec.noun}`
      body = (
        <>
          <Icon className="size-3.5" aria-hidden="true" />
          <span aria-hidden="true" className="inline-block h-[0.7em] w-14 animate-pulse rounded-sm bg-press motion-reduce:animate-none" />
        </>
      )
  }

  const acts = live.state === "error" || !!href || (live.state === "ok" && !!spec.open)
  return (
    <span
      data-entity-chip={kind}
      data-state={live.state}
      role={acts ? "link" : undefined}
      tabIndex={acts ? 0 : undefined}
      aria-label={label}
      contentEditable={false}
      onClick={acts ? open : undefined}
      onAuxClick={acts && href ? onMiddleClick<React.MouseEvent<HTMLElement>>(open) : undefined}
      onKeyDown={(e) => {
        if (acts && e.key === "Enter") return open(e)
        if (e.key !== " ") return
        // Space never scrolls the page from a chip, card or not.
        e.preventDefault()
        keyed.current = true
        hover.onKeyDown(e)
        keyed.current = false
      }}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      className={cn(
        "mx-px inline-flex max-w-[20rem] items-baseline gap-1 rounded-[5px] bg-hover px-1 align-baseline font-[510] text-ink [&_svg]:self-center",
        "transition-colors duration-[140ms] ease-[var(--ease-out)] motion-reduce:transition-none",
        !view?.tone && "hover:bg-press",
        acts ? "cursor-pointer" : "cursor-default",
        live.state !== "ok" && live.state !== "loading" && quiet,
        view?.tone && CHIP_TONE[view.tone === "today" ? "sun" : "danger"],
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-sheet",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        className,
      )}
    >
      {body}
      {card && live.state === "ok" ? (
        <React.Suspense fallback={null}>
          <CardPopover kind={kind} id={id} data={live.data} anchor={card.at} keyed={card.keyed} onClose={() => setCard(null)} />
        </React.Suspense>
      ) : null}
    </span>
  )
}
