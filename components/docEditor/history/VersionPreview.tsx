"use client"

/**
 * A version, read-only, in the doc's own type (docs programme B8), and with
 * "Show changes" what changed against another body: the version before it, or
 * the doc as it is now. The diff loads only when changes are turned on.
 *
 * The reader keeps their place. Blocks keep their ids from version to version,
 * so turning changes on or choosing another version comes back to the block
 * that was at the top of the screen: the new render is staged off the page
 * until it holds that block (the old one stays readable meanwhile), then
 * swapped in and scrolled to it. Opened fresh, a version paints its first
 * screen at once and the rest in slices.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DOC_EDITOR_CLASS } from "@/components/docEditor/useDocEditor"
import { renderVersion, type RenderTarget } from "./preview/renderVersion"
import { isAbort } from "./preview/slices"
import { attrValue, refusalWords } from "./versions"
import type { DiffStats } from "./diff"

/** What the preview says about the changes it drew: null while it isn't showing any. */
export interface Drawn {
  stats: DiffStats
  targets: HTMLElement[]
}

export interface VersionPreviewProps {
  versionId: string
  /** The version's body; undefined while it loads. */
  html: string | undefined
  failed: unknown
  onRetry(): void
  /** What to compare with when changes are on; its html undefined while it loads. Null: changes off. */
  compare: { key?: string; html: string | undefined } | null
  onDrawn(drawn: Drawn | null): void
  /** Whether a diff is being worked out (the bar says "Comparing…"). */
  onBusy(busy: boolean): void
  className?: string
  /** The preview's scroller, for the change stepper. */
  scrollerRef?: React.RefObject<HTMLDivElement | null>
}

/** Where the reader is: the block at the top of the screen and how far down it starts. */
interface Place {
  id: string
  offset: number
}

function placeIn(scroller: HTMLElement, box: HTMLElement): Place | null {
  if (scroller.scrollTop < 8) return null
  const r = scroller.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 12)
  const block = hit instanceof Element ? hit.closest<HTMLElement>("[data-block-id]") : null
  if (!block || !box.contains(block)) return null
  return { id: block.getAttribute("data-block-id")!, offset: block.getBoundingClientRect().top - r.top }
}

const blockSel = (id: string) => `[data-block-id="${attrValue(id)}"]:not([data-history-change="removed"])`

/**
 * A render target that holds what is drawn until it reaches the reader's
 * place, then swaps it in and scrolls back to it; without a place it draws
 * straight away.
 */
function stagedTarget(box: HTMLElement, scroller: HTMLElement, place: Place | null) {
  const stage = document.createElement("div")
  let live = !place
  let cleared = false
  const commit = () => {
    if (live) return
    live = true
    box.replaceChildren(...Array.from(stage.childNodes))
    const at = place && box.querySelector<HTMLElement>(blockSel(place.id))
    if (at) scroller.scrollTop += at.getBoundingClientRect().top - scroller.getBoundingClientRect().top - place!.offset
  }
  const target: RenderTarget = {
    replaceChildren: (...nodes) => {
      if (live) box.replaceChildren(...nodes)
      else stage.replaceChildren(...nodes)
      cleared = true
    },
    append: (...nodes) => {
      if (live) {
        // A render that starts by appending (never cleared) replaces what was there.
        if (!cleared) {
          box.replaceChildren()
          cleared = true
        }
        box.append(...nodes)
        return
      }
      stage.append(...nodes)
      const sel = blockSel(place!.id)
      if (nodes.some((n) => n instanceof Element && (n.matches(sel) || n.querySelector(sel)))) commit()
    },
  }
  return { target, finish: commit }
}

export function VersionPreview({ versionId, html, failed, onRetry, compare, onDrawn, onBusy, className, scrollerRef }: VersionPreviewProps) {
  const ownScroller = React.useRef<HTMLDivElement>(null)
  const scroller = scrollerRef ?? ownScroller
  const box = React.useRef<HTMLDivElement>(null)
  const [painted, setPainted] = React.useState(false)
  const [broken, setBroken] = React.useState(false)
  const latest = React.useRef({ onDrawn, onBusy })
  latest.current = { onDrawn, onBusy }

  const changes = compare !== null
  const baseHtml = compare?.html
  const baseKey = compare?.key

  React.useEffect(() => {
    const el = box.current
    const sc = scroller.current
    if (!el || !sc || html === undefined) return
    const ctrl = new AbortController()
    const place = placeIn(sc, el)
    const { target, finish } = stagedTarget(el, sc, place)
    setBroken(false)
    const diffing = changes && baseHtml !== undefined
    latest.current.onBusy(changes)
    const run: Promise<DiffStats | null> = diffing
      ? import("./diff").then((m) => m.renderDiff(target, baseHtml!, html, { signal: ctrl.signal, beforeKey: baseKey, afterKey: versionId }))
      : renderVersion(target, html, { signal: ctrl.signal, key: versionId }).then(() => null)
    // Changes asked for but the other body still loading: the plain version
    // shows meanwhile, and the bar keeps saying "Comparing…".
    run
      .then(async (stats) => {
        if (ctrl.signal.aborted) return
        finish()
        setPainted(true)
        if (stats) {
          const { changeTargets } = await import("./diff")
          latest.current.onDrawn({ stats, targets: changeTargets(el) })
        } else {
          latest.current.onDrawn(null)
        }
        if (diffing || !changes) latest.current.onBusy(false)
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return
        console.error("The version could not be drawn", e)
        setBroken(true)
        latest.current.onBusy(false)
      })
    setPainted(el.childElementCount > 0)
    return () => ctrl.abort()
  }, [html, versionId, changes, baseHtml, baseKey, scroller])

  return (
    <div
      ref={scroller}
      // The size container the doc's wide blocks measure against (.doc-scroll).
      className={cn("doc-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain", className)}
      data-history-preview-scroller=""
    >
      <div className="doc-measure mx-auto w-full pt-8">
        <div className={cn(DOC_EDITOR_CLASS)}>
          <div ref={box} className="ProseMirror history-preview" aria-label="The version's text" role="document" data-version-id={versionId} />
        </div>
      </div>
      {(failed || broken) && (
        <div className="absolute inset-0 flex items-center justify-center bg-pop">
          <ErrorState subject="this version" onRetry={onRetry} detail={refusalWords(failed)} />
        </div>
      )}
      {!failed && !broken && (html === undefined || !painted) && (
        <div role="status" aria-label="Loading the version" className="absolute inset-x-0 top-0 mx-auto max-w-[784px] space-y-3 px-8 pt-8">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
    </div>
  )
}
