"use client"

import * as React from "react"

import { useDebounce } from "@/hooks/useDebounce"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { loadFailure } from "@/lib/http/loadFailure"
import { GlobalSearchGet } from "@/services/searchService"
import { EmptyState } from "@/components/ui/empty-state"
import { SearchInput } from "@/components/ui/search-input"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Eyebrow } from "@/components/ui/eyebrow"
import { SpotSearch } from "@/components/ui/graphics/spots"
import { X } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import {
  kindHue,
  kindLabel,
  labelOf,
  pathKey,
  picksOf,
  sentenceOf,
  verbOf,
  type GraphPaths,
  type GraphRootKind,
  type PickHit,
} from "@/lib/workGraph/workGraph"
import { GraphRow, KindTile, ixHue, rowClass, useRovingRows } from "./GraphRow"

/** How long typing settles before a search goes out. */
const SETTLE_MS = 200

/**
 * "How is this connected to…": find a doc, task, project, person, channel or
 * whiteboard, and see at most three shortest ways this connects to it, each
 * step named. Only ways through things the reader can see come back (the
 * server drops the rest whole), so "not connected" means not connected as
 * far as they can see.
 */
export function ConnectionFinder({ kind, id, subject, onNavigate }: { kind: GraphRootKind; id: string; subject: string; onNavigate?: () => void }) {
  const [text, setText] = React.useState("")
  const [picked, setPicked] = React.useState<PickHit | null>(null)
  const query = useDebounce(text.trim(), SETTLE_MS)
  const search = useFetch<{ data?: { page?: Array<{ type: string } & Record<string, unknown>> } }>(
    !picked && query.length >= 2 ? GlobalSearchGet(query) : "",
    undefined,
    { revalidateOnFocus: false, keepPreviousData: true },
    OWN_ERRORS,
  )
  const hits = picksOf(search.data?.data?.page, { kind, id }).slice(0, 12)
  const roving = useRovingRows()
  const input = React.useRef<HTMLInputElement>(null)
  // A pick takes its row away: focus goes to the result's first control, so
  // keys (Escape included) still reach the panel rather than the page.
  const change = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    input.current?.focus()
  }, [])
  React.useEffect(() => {
    if (picked) change.current?.focus()
  }, [picked])

  if (picked) {
    return (
      <div className="flex flex-col gap-3" data-connection-result="">
        <div className="flex items-center gap-2 rounded-lg bg-sunken px-2 py-1.5">
          <KindTile kind={picked.kind} size="sm" />
          <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{picked.title}</span>
          <button
            ref={change}
            type="button"
            onClick={() => {
              setPicked(null)
              requestAnimationFrame(() => input.current?.focus())
            }}
            {...ix("icon")}
            aria-label="Choose something else"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <PathResult from={{ kind, id }} to={picked} subject={subject} onNavigate={onNavigate} />
      </div>
    )
  }

  let list: React.ReactNode = null
  if (query.length < 2) {
    list = <EmptyState tone="muted" illustration={<SpotSearch hue="sky" />} title="Find anything to connect to" description="A doc, a task, a project, a person or a channel." />
  } else if (search.isError && (search.isPrevious || !search.data)) {
    // The hits kept from the last words aren't picks for these (useFetch's isPrevious).
    list = <ErrorState subject="the search" compact onRetry={() => void search.mutate()} />
  } else if (!search.data && search.isLoading) {
    list = (
      <div role="status" aria-label="Searching">
        <SkeletonRows rows={3} avatar lines={1} />
      </div>
    )
  } else if (!hits.length) {
    list = <EmptyState tone="muted" title={`Nothing found for “${query}”`} description="Try another word, or the name of a person or channel." />
  } else {
    list = (
      <ul role="listbox" aria-label="Things to connect to" className="flex flex-col gap-0.5" onKeyDown={roving}>
        {hits.map((h) => (
          <li key={`${h.kind}:${h.id}`} role="none">
            <button
              type="button"
              role="option"
              aria-selected={false}
              data-graph-pick={h.kind}
              onClick={() => setPicked(h)}
              {...ix("row", { hue: ixHue(kindHue(h.kind)) })}
              className={rowClass}
            >
              <KindTile kind={h.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">{h.title}</span>
                <span className="block truncate text-meta text-ink-3">{kindLabel(h.kind)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div data-connection-finder="" className="flex flex-col gap-3">
      <SearchInput
        ref={input}
        name="graph_target"
        aria-label="Find something to connect to"
        placeholder="Search docs, tasks, people…"
        value={text}
        onValueChange={setText}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            e.currentTarget.closest("[data-connection-finder]")?.querySelector<HTMLElement>("[data-graph-pick]")?.focus()
          }
        }}
      />
      {list}
    </div>
  )
}

/** The ways one thing connects to another, each a chain of steps. */
function PathResult({ from, to, subject, onNavigate }: { from: { kind: GraphRootKind; id: string }; to: PickHit; subject: string; onNavigate?: () => void }) {
  const { data, isError, isLoading, mutate } = useFetch<{ data?: GraphPaths }>(pathKey(from, to), undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const paths = data?.data
  if (isError && !paths) {
    return loadFailure(isError) === "failed" ? (
      <ErrorState subject="how these connect" compact onRetry={() => void mutate()} />
    ) : (
      <EmptyState tone="muted" title="You can't open that" description="It may have been deleted, or it isn't shared with you." />
    )
  }
  if (!paths && isLoading) {
    return (
      <div role="status" aria-label="Finding how these connect">
        <SkeletonRows rows={3} avatar lines={2} />
      </div>
    )
  }
  if (!paths?.paths.length) {
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">Not connected</p>
        <EmptyState tone="muted" title="Not connected within four steps" description={`Nothing you can see links ${subject || "this"} to ${to.title} yet.`} />
      </>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="sr-only" role="status" aria-live="polite">
        {paths.paths.length === 1 ? "One way they connect" : `${paths.paths.length} ways they connect`}
      </p>
      {paths.paths.map((p, i) => (
        <section
          key={i}
          aria-label={`Way ${i + 1}: ${sentenceOf(paths.from, p.hops)}`}
          data-graph-path={i}
          className="rounded-xl bg-raised p-2 shadow-e1"
        >
          <Eyebrow as="p" className="block px-2 pb-1">
            {i === 0 ? "Shortest" : `Way ${i + 1}`} · <span className="tabular-nums">{p.hops.length}</span> {p.hops.length === 1 ? "step" : "steps"}
          </Eyebrow>
          <ol className="flex flex-col">
            <li>
              <GraphRow hop={paths.from} why="Here" onNavigate={onNavigate} />
            </li>
            {p.hops.map((h, j) => (
              <li key={j}>
                <Step verb={verbOf(h.rel, h.kind)} />
                <GraphRow hop={h} why={labelOf(h)} onNavigate={onNavigate} />
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="sr-only">{paths.paths.map((p) => sentenceOf(paths.from, p.hops)).join(". ")}</p>
    </div>
  )
}

/**
 * The link between two steps: a 1px rule from one tile to the next (it runs
 * 6px into each row, under its tile, so the path reads as one line) and the
 * verb beside it, upright, in meta ink.
 */
function Step({ verb }: { verb: string }) {
  return (
    <div aria-hidden="true" data-graph-step="" className="flex items-stretch gap-3 px-2">
      <span className="relative flex w-8 shrink-0 justify-center">
        <span className="absolute -bottom-1.5 -top-1.5 w-px bg-line-2" />
      </span>
      <span className={cn("py-0.5 text-meta text-ink-3")}>{verb}</span>
    </div>
  )
}
