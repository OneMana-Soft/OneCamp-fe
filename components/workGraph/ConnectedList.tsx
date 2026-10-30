"use client"

import * as React from "react"

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { loadFailure } from "@/lib/http/loadFailure"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Eyebrow } from "@/components/ui/eyebrow"
import { SpotPlug } from "@/components/ui/graphics/spots"
import { MenuCheck, menuCheckState } from "@/components/ui/menuCheck"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import {
  connectedKey,
  countLabel,
  groupsIn,
  kindHue,
  kindLabel,
  whyOf,
  type Connected,
  type GraphKind,
  type GraphRootKind,
} from "@/lib/workGraph/workGraph"
import { GraphRow, useRovingRows } from "./GraphRow"

/**
 * What a thing is connected to, one or two steps out, grouped by kind, each
 * row saying why it's here. Every state says what's true: loading, a failure
 * with Try again (never "nothing connected" for a read that failed), a thing
 * the reader can't see, and nothing connected yet.
 */
export function ConnectedList({
  kind,
  id,
  onRoot,
  onHidden,
  onNavigate,
}: {
  kind: GraphRootKind
  id: string
  onRoot?: (title: string) => void
  /** Told when the reader may not see the thing: the panel then offers no search from it. */
  onHidden?: (hidden: boolean) => void
  onNavigate?: () => void
}) {
  const [depth, setDepth] = React.useState<1 | 2>(2)
  const [only, setOnly] = React.useState<GraphKind | "all">("all")
  const { data, isError, isPrevious, isLoading, mutate } = useFetch<{ data?: Connected }>(connectedKey(kind, id, depth), undefined, { revalidateOnFocus: false, keepPreviousData: true }, OWN_ERRORS)
  const [retrying, setRetrying] = React.useState(false)
  const connected = data?.data
  const roving = useRovingRows()

  React.useEffect(() => {
    if (connected?.root?.title) onRoot?.(connected.root.title)
  }, [connected?.root?.title, onRoot])

  // A failed read is said even over the list kept from the other depth: that
  // list isn't this depth's (useFetch's isPrevious).
  const failed = !!isError && (isPrevious || !connected)
  // Refused (403) or gone (400, 404, 410): said once, with nothing to retry or switch.
  const hidden = failed && loadFailure(isError) !== "failed"
  React.useEffect(() => onHidden?.(hidden), [hidden, onHidden])

  const groups = groupsIn(connected, only)
  const all = groupsIn(connected, "all")
  const label = countLabel(connected)

  let content: React.ReactNode
  // Failure before empty (app/errorState.test.ts): a failed read is never "nothing here".
  if (failed) {
    content = hidden ? (
      <EmptyState tone="muted" title="You can't see what this connects to" description="It may have been deleted, or it isn't shared with you." />
    ) : (
      <ErrorState
        subject="what this connects to"
        compact
        retrying={retrying}
        onRetry={() => {
          setRetrying(true)
          void mutate().finally(() => setRetrying(false))
        }}
      />
    )
  } else if (!connected && isLoading) {
    content = (
      <div role="status" aria-label="Loading what this connects to" className="pt-1">
        <SkeletonRows rows={4} avatar lines={2} />
      </div>
    )
  } else if (!all.length) {
    content = (
      <EmptyState
        tone="muted"
        illustration={<SpotPlug hue={kindHue(kind)} />}
        title="Nothing connected yet"
        description="Link a doc to a task, share it in a channel or assign the work, and it shows up here."
      />
    )
  } else {
    content = (
      <div onKeyDown={roving} className="flex flex-col gap-3">
        {groups.map((g) => (
          <section key={g.kind} aria-label={`${kindLabel(g.kind, 2)}, ${g.items.length}${g.more ? " or more" : ""}`} data-graph-group={g.kind}>
            <Eyebrow as="h4" className="flex items-center gap-1.5 px-2 pb-1">
              {kindLabel(g.kind, 2)}
              <span className="tabular-nums text-ink-3">{g.items.length}{g.more ? "+" : ""}</span>
            </Eyebrow>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <li key={`${it.kind}:${it.id}`}>
                  <GraphRow hop={it} why={whyOf(it)} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-connected-list="">
      <p className="sr-only" role="status" aria-live="polite">
        {connected ? label : ""}
      </p>
      {/* The controls stay put under the header while the list scrolls (design
          review, DG6): sticky in the body, its surface painted to the body's
          edges so no row shows beside or through it. */}
      {/* Nothing to switch where the reader can see nothing (DESIGN-BUILD-5). */}
      {hidden ? null : (
        <div
          data-connected-controls=""
          className="sticky top-0 z-10 flex flex-col items-start gap-1.5 bg-pop pb-1 pt-0.5 before:absolute before:inset-y-0 before:-left-4 before:-right-4 before:-z-10 before:bg-pop"
        >
          <div role="radiogroup" aria-label="How far to look" className="inline-flex shrink-0 rounded-lg bg-sunken p-0.5">
            {([1, 2] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={depth === d}
                onClick={() => setDepth(d)}
                {...ix("toggle", { selected: depth === d })}
                className={cn(
                  "h-7 rounded-md px-2.5 text-meta font-medium text-ink-3 outline-none transition-[background-color,color,box-shadow] duration-[160ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
                  depth === d && "bg-raised text-ink shadow-e1",
                )}
              >
                {d === 1 ? "Direct" : "Two steps"}
              </button>
            ))}
          </div>
          {all.length > 1 ? (
            // Their own row, the kinds present only, wrapping: a chip is never cut (DESIGN-BUILD-4).
            <div role="radiogroup" aria-label="Show" data-graph-chips="" className="flex flex-wrap gap-1 py-0.5">
              <Chip on={only === "all"} onClick={() => setOnly("all")} label="All" />
              {all.map((g) => (
                <Chip key={g.kind} on={only === g.kind} onClick={() => setOnly(only === g.kind ? "all" : g.kind)} label={kindLabel(g.kind, 2)} />
              ))}
            </div>
          ) : null}
        </div>
      )}
      {content}
    </div>
  )
}

/**
 * One kind to show: a toggle in the row's radio group. Selected is the
 * selected tint with a check (the cue that isn't colour); never the accent's
 * ring, which reads as focus.
 */
function Chip({ on, onClick, label }: { on: boolean; onClick(): void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      {...menuCheckState(on)}
      onClick={onClick}
      {...ix("toggle")}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-sm px-2.5 text-meta font-medium text-ink-2 outline-none ring-1 ring-inset ring-line transition-[background-color,color,box-shadow] duration-[160ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-sel data-[state=checked]:text-ink data-[state=checked]:ring-line-2"
    >
      <MenuCheck checked={on} className="-ml-0.5 size-3.5 [&>svg]:size-3.5" />
      {label}
    </button>
  )
}
