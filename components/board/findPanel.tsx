"use client"

// Find and replace on a board (miro-05 to_win 2 and 3): every match on the board's words and frame names, listed
// frames first, lit on the canvas (the current one stronger, and in view once the typing settles), a row or Enter
// going to it; Replace and Replace all for
// those who can edit the board, as one undo step. Matching is a doc's Find's (lib/text/findPattern), so Match case
// and Whole word mean the same in both. Opened from the board's menu, Ctrl or Cmd+F while the board has the focus,
// or a search hit on the board's words (?find=). Loaded with its first opening, never with the board.

import * as React from "react"
import { createPortal } from "react-dom"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSceneElements } from "@/hooks/useSceneElements"
import { useToast } from "@/hooks/use-toast"
import { useDebounce } from "@/hooks/useDebounce"
import { useStableCallback } from "@/hooks/useStableCallback"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { CaseSensitive, ChevronDown, ChevronUp, Replace, ReplaceAll, SunDim, WholeWord } from "@/lib/icons"
import { isComposingKey } from "@/lib/keys/ime"
import { cn } from "@/lib/utils/helpers/cn"
import { CAPTURE } from "@/lib/board/binding"
import { MAX_MATCHES } from "@/lib/text/findPattern"
import { findOnBoard, keptOf, replaceOnBoard, searchMatchesOf, unreplaceOnBoard, wordsOf, type BoardMatch, type FindElement, type FindKind } from "@/lib/board/findOnBoard"
import { fontCss, loadConvert, rewordElements, type Convert } from "@/components/board/boardOps"
import { BoardSidePanel, SIDE_PANELS } from "@/components/board/boardSidePanel"
import { BoardVeil } from "@/components/board/boardVeil"
import { useSheetMode } from "@/components/ui/overlayMode"
import { sceneToLocal } from "@/lib/board/viewport"
import { boxAllInView, offsetsOf, roomAbove, viewBesidePanel } from "@/lib/board/panelView"
import { PHONE_TOOL_ROW } from "@/components/board/excalidrawPart"
import { FindIconButton } from "@/components/ui/findIconButton"
import { useUndoToast } from "@/components/ui/undoToast"

/** Rows the list draws; the count, stepping and Replace all cover every match. */
const LISTED = 200

/** How long the words rest before the current match comes into view: as long as Excalidraw's own search waits. */
const SETTLE_MS = 350

const KIND: Record<FindKind, string> = { frame: "Frame", note: "Note", shape: "Shape", arrow: "Arrow", text: "Text" }

const FIELD = "h-8 min-w-0 flex-1 rounded-md bg-raised px-2 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus:focus-halo max-sm:h-10 max-sm:text-base"

type Element = FindElement & { locked?: boolean }

// What Replace all's Undo says when every word it wrote has changed since (rewordElements counts what it put back).
const undoneNote = (n: unknown) => (n === 0 ? { title: "Nothing to put back", description: "Those words have changed since." } : undefined)

export default function FindPanel({
  api,
  editable,
  query: asked,
  at,
  fromLink = false,
  onMissed,
  onClose,
  veilHost = null,
  onKept,
}: {
  api: ExcalidrawImperativeAPI
  /** Replace and Replace all are for those who can edit the board. */
  editable: boolean
  /** The words to find when it opens (a search hit's), or "". */
  query: string
  /** When it was asked for: each ask focuses the field again. */
  at: number
  /** Opened by a search hit's link: it goes to the first match once the board's words are in. */
  fromLink?: boolean
  /** A link's words aren't on the board (any more), once its words are in. */
  onMissed?: () => void
  onClose: () => void
  /** Where the board's veil goes (over the canvas, under the tag chips): Find dims the rest of the board there. */
  veilHost?: HTMLElement | null
  /** What Find keeps clear while it dims the rest, by id, each time that changes; null once it doesn't dim (V-271). */
  onKept?: (ids: ReadonlySet<string> | null) => void
}) {
  const { toast } = useToast()
  const offerUndo = useUndoToast(undefined, undoneNote)
  const sheet = useSheetMode()
  const [query, setQuery] = React.useState(asked)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [wholeWord, setWholeWord] = React.useState(false)
  const [dim, setDim] = React.useState(true)
  const [current, setCurrent] = React.useState(0)
  const [replacement, setReplacement] = React.useState("")
  const field = React.useRef<HTMLInputElement>(null)

  // Excalidraw's converter and its faces' names: Replace lays words out with it, and the lights are measured in them.
  const [convert, setConvert] = React.useState<Convert | null>(null)
  React.useEffect(() => {
    let live = true
    void loadConvert().then((c) => live && setConvert(() => c))
    return () => {
      live = false
    }
  }, [])

  // Each ask (the menu, Ctrl or Cmd+F again, a link) brings the field back, its words chosen.
  React.useEffect(() => {
    if (asked) setQuery(asked)
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.select()
    })
  }, [asked, at])

  // The board's words, read again only when the scene changes (a pan is no change).
  const elements = useSceneElements<Element>(api)
  const matches = React.useMemo(() => findOnBoard(elements, query, { caseSensitive, wholeWord }), [elements, query, caseSensitive, wholeWord])
  const byId = React.useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])
  const at0 = matches.length ? Math.min(current, matches.length - 1) : -1

  // Dim the rest (V-271), on until it's turned off: while there are matches, all but them and what they are in fade
  // behind the board's veil, as Miro's search dims what doesn't match. The same matches, no second search, and it
  // ends with Find. The workbench hears the ids only when they change (a move is no change), for the tag chips.
  const keptIds = React.useMemo(() => (dim && matches.length ? keptOf(matches) : null), [dim, matches])
  const keptKey = keptIds ? keptIds.join("\n") : null
  React.useEffect(() => {
    onKept?.(keptKey == null ? null : new Set(keptKey.split("\n")))
  }, [keptKey, onKept])
  React.useEffect(() => () => onKept?.(null), [onKept])
  const kept = React.useMemo(() => {
    if (!keptIds) return null
    const ids = new Set(keptIds)
    return elements.filter((e) => ids.has(e.id))
  }, [elements, keptIds])

  // The lights on the canvas: each match's words, the current one stronger. Gone when Find closes.
  const measure = React.useMemo(() => {
    if (!convert) return null
    const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d")
    return (text: string, el: FindElement) => {
      if (!ctx) return text.length * Number(el.fontSize ?? 20) * 0.6
      ctx.font = fontCss(el)
      return ctx.measureText(text).width
    }
  }, [convert])
  React.useEffect(() => {
    if (!measure) return
    api.updateScene({ appState: { searchMatches: searchMatchesOf(elements, matches, at0, measure) } as never, captureUpdate: CAPTURE.NEVER })
  }, [api, elements, matches, at0, measure])
  React.useEffect(() => () => api.updateScene({ appState: { searchMatches: [] } as never, captureUpdate: CAPTURE.NEVER }), [api])

  // What the panel or sheet leaves of the board in view (viewBesidePanel), from the panel this field sits in: a phone's
  // sheet by its top where it comes to rest (offsetTop leaves out the transform it rises by, and a link's jump can come
  // while it rises), a computer's panel by its left edge on the page.
  const openView = React.useCallback(() => {
    const s = api.getAppState()
    const panel = field.current?.closest<HTMLElement>("[data-board-find]")
    const edge = !panel ? undefined : sheet ? panel.offsetTop : panel.getBoundingClientRect().left
    // On a phone the MobileMenu's tool row floats over the board's top, so what is open starts under it.
    const below = sheet ? document.querySelector(PHONE_TOOL_ROW)?.getBoundingClientRect().bottom : undefined
    return viewBesidePanel({ ...s, zoom: s.zoom.value }, sheet, edge, below)
  }, [api, sheet])
  // To a match's target, in that view: on a phone the canvas above the sheet, which stays, to step and replace; on a
  // computer the canvas left of the panel. Without the glide for those who ask for less motion, as a doc's Find.
  const show = React.useCallback(
    (target: Element) => {
      const s = api.getAppState()
      api.scrollToContent([target] as never, { fitToContent: true, animate: !prefersReducedMotion(), canvasOffsets: offsetsOf({ ...s, zoom: s.zoom.value }, openView(), roomAbove(target)) })
    },
    [api, openView],
  )
  // Whether all of an element is in that view, a frame's name over it too (V-270).
  const shown = (el: Element) => {
    const open = openView()
    const from = sceneToLocal(open, el.x, el.y)
    const to = sceneToLocal(open, el.x + el.width, el.y + el.height)
    return boxAllInView(open, from.left, from.top - roomAbove(el), to.left, to.top)
  }

  // The words and options the current match was last brought into view for, by a step or by their settling. The ones
  // it opens with count as shown: a link's go to their first match itself.
  const words = `${Number(caseSensitive)}${Number(wholeWord)}${query}`
  const shownFor = React.useRef(words)

  const go = React.useCallback(
    (i: number) => {
      const m = matches[i]
      const target = m ? byId.get(m.target) : undefined
      if (!m || !target) return
      setCurrent(i)
      shownFor.current = words
      api.updateScene({ appState: { selectedElementIds: { [target.id]: true } } as never, captureUpdate: CAPTURE.NEVER })
      show(target)
    },
    [api, byId, matches, show, words],
  )
  const step = (by: 1 | -1) => matches.length && go((at0 + by + matches.length) % matches.length)

  // Typing, Match case or Whole word: once the words settle, the current match comes into that view as a step brings
  // it, but unselected, so the field keeps the keys and no bar opens over the board. One all in view stays put.
  const settled = useDebounce(words, SETTLE_MS)
  const showCurrent = useStableCallback(() => {
    const m = at0 >= 0 ? matches[at0] : undefined
    const on = m && byId.get(m.id)
    const target = m && byId.get(m.target)
    if (on && target && !shown(on)) show(target)
  })
  React.useEffect(() => {
    if (settled === shownFor.current) return
    shownFor.current = settled
    showCurrent()
  }, [settled, showCurrent])

  // A link's words: the first match, once the board's words are in; or say they're gone, after about a second.
  const linked = React.useRef(fromLink)
  React.useEffect(() => {
    if (!linked.current) return
    if (matches.length) {
      linked.current = false
      go(0)
      return
    }
    const late = setTimeout(() => {
      if (!linked.current) return
      linked.current = false
      onMissed?.()
    }, 1200)
    return () => clearTimeout(late)
  }, [matches, go, onMissed])

  // Replace: the words of a match, never of something locked (as Excalidraw won't edit it either).
  const replaceable = (m: BoardMatch) => !byId.get(m.id)?.locked && !byId.get(m.target)?.locked
  const replace = (which: BoardMatch[]) => {
    if (!convert) return
    const mine = which.filter(replaceable)
    const wrote = replaceOnBoard(elements, mine, replacement)
    const before = new Map(elements.filter((e) => wrote.has(e.id)).map((e) => [e.id, wordsOf(e)]))
    const changed = rewordElements(api, convert, wrote)
    if (which.length < 2) return
    const locked = mine.length < which.length ? "Locked things keep their words." : undefined
    if (!changed) {
      toast({ title: "Nothing was replaced", description: locked })
      return
    }
    // Its Undo writes the old words back as one more step, wherever they are still the ones Replace wrote.
    const undo = () => rewordElements(api, convert, unreplaceOnBoard(api.getSceneElements() as readonly Element[], wrote, before))
    offerUndo(`Replaced ${mine.length.toLocaleString()} ${mine.length === 1 ? "match" : "matches"}`, undo, locked)
  }

  const n = matches.length
  const count = !query ? "" : n === 0 ? "No results" : `${(at0 + 1).toLocaleString()} of ${n.toLocaleString()}${n >= MAX_MATCHES ? "+" : ""}`

  const keys = (e: React.KeyboardEvent, which: "find" | "replace") => {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "Enter" && !isComposingKey(e.nativeEvent)) {
      e.preventDefault()
      if (which === "replace" && editable) replace(mod ? matches : at0 >= 0 ? [matches[at0]] : [])
      else step(e.shiftKey ? -1 : 1)
    }
  }

  const footer = editable
    ? () => (
        <div className="flex items-center gap-1" data-board-find-replace="">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => keys(e, "replace")}
            data-escape-own=""
            placeholder="Replace with"
            aria-label="Replace with"
            className={FIELD}
          />
          <FindIconButton aria-label="Replace" onClick={() => replace(at0 >= 0 ? [matches[at0]] : [])} disabled={at0 < 0 || !convert}>
            <Replace aria-hidden="true" />
          </FindIconButton>
          <FindIconButton aria-label="Replace all" onClick={() => replace(matches)} disabled={!n || !convert}>
            <ReplaceAll aria-hidden="true" />
          </FindIconButton>
        </div>
      )
    : undefined

  return (
    <BoardSidePanel {...SIDE_PANELS.find(editable)} footer={footer} onClose={onClose}>
      {veilHost && createPortal(<BoardVeil api={api} kept={kept} above={roomAbove} data-find-veil={kept?.length ?? 0} />, veilHost)}
      <div role="search" aria-label="Find on board" className="sticky top-0 z-10 flex flex-col gap-1 bg-pop pb-1.5">
        <div className="flex items-center gap-1">
          <input
            ref={field}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCurrent(0)
            }}
            onKeyDown={(e) => keys(e, "find")}
            data-escape-own=""
            placeholder="Find on board"
            aria-label="Find on board"
            className={FIELD}
          />
          <FindIconButton aria-label="Match case" pressed={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
            <CaseSensitive aria-hidden="true" />
          </FindIconButton>
          <FindIconButton aria-label="Whole word" pressed={wholeWord} onClick={() => setWholeWord((v) => !v)}>
            <WholeWord aria-hidden="true" />
          </FindIconButton>
          <FindIconButton aria-label="Dim the rest" pressed={dim} onClick={() => setDim((v) => !v)}>
            <SunDim aria-hidden="true" />
          </FindIconButton>
        </div>
        <div className="flex h-7 items-center gap-1 pl-1">
          <p className="flex-1 text-meta tabular-nums text-ink-3" aria-live="polite" data-board-find-count="">
            {count}
          </p>
          <FindIconButton aria-label="Previous match" onClick={() => step(-1)} disabled={!n}>
            <ChevronUp aria-hidden="true" />
          </FindIconButton>
          <FindIconButton aria-label="Next match" onClick={() => step(1)} disabled={!n}>
            <ChevronDown aria-hidden="true" />
          </FindIconButton>
        </div>
      </div>
      {n > 0 && (
        <ol className="grid gap-px" aria-label="Matches">
          {matches.slice(0, LISTED).map((m, i) => {
            const frame = m.frameId && m.kind !== "frame" ? byId.get(m.frameId)?.name : null
            return (
              <li key={`${m.id}:${m.index}`}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === at0 ? "true" : undefined}
                  data-board-find-row={m.target}
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-left outline-none transition-colors duration-[140ms] focus-visible:ring-2 focus-visible:ring-brand max-sm:py-2.5",
                    i === at0 ? "bg-press" : "hover:bg-hover",
                  )}
                >
                  <span className="block truncate text-ui text-ink-2">
                    {m.preview.before}
                    <mark className="rounded-[3px] bg-[color-mix(in_oklab,var(--brand)_22%,transparent)] px-px text-ink">{m.preview.hit}</mark>
                    {m.preview.after}
                  </span>
                  <span className="block truncate text-meta text-ink-3">{frame ? `${KIND[m.kind]} · ${frame}` : KIND[m.kind]}</span>
                </button>
              </li>
            )
          })}
          {n > LISTED && <li className="px-2 py-2 text-meta text-ink-3">{`${(n - LISTED).toLocaleString()} more: step through them with Enter`}</li>}
        </ol>
      )}
      {query && n === 0 && <p className="px-2 py-6 text-center text-ui-sm text-ink-3">Nothing on this board says that.</p>}
    </BoardSidePanel>
  )
}
