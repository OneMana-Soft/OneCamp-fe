"use client"

/**
 * The margin's comment markers (docs programme B7; collaboration.md, design
 * gaps): a 'gutter' slot contribution, beside the text at 1,040 px and wider.
 * Notion's margin glyph, kept quiet: one marker per line that has open
 * threads, with how many comments, a dot when one has news for you, and the
 * thread's words drawn strong while the pointer or the keyboard is on it.
 * Choosing it opens the thread beside the doc.
 *
 * Where: each thread's words are where A8's decorations found them; a marker
 * sits level with their first line, in the text's right inset, never over
 * another. When: after the threads change, after typing pauses, and when the
 * text's size changes (a window, a font). Never a layout read per key (I20).
 */
import * as React from "react"
import type { Editor } from "@tiptap/core"
import { MessageSquare } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { anchorDecorationsKey } from "@/components/minimal-tiptap/extensions/anchor-decorations/anchorDecorations"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { setUi, uiOf, useOpenComments, useUi } from "@/components/docComments/commentsUi"
import { onPage, quoteLine } from "@/components/docComments/threadView"
import { useDocThreads } from "@/components/docComments/useDocThreads"
import { UnreadDot } from "@/components/docComments/UnreadDot"
import type { ThreadView } from "@/components/threads/types"

/** Where the margin has room for markers. */
const WIDE = "(min-width: 1040px)"
/** A marker's height, and the least room between two. */
const MARK = 24
const GAP = 4
/** How long typing pauses before the markers are placed again. */
const SETTLE_MS = 150

/** The wide query, where the page can ask it. */
const wideQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE) : null)

function useWide(): boolean {
    const subscribe = React.useCallback((l: () => void) => {
        const m = wideQuery()
        m?.addEventListener("change", l)
        return () => m?.removeEventListener("change", l)
    }, [])
    return React.useSyncExternalStore(subscribe, () => wideQuery()?.matches ?? false, () => false)
}

export interface GutterMark {
    top: number
    ids: string[]
    comments: number
    unread: boolean
    quote: string
}

/** Whether a thread gets a marker: open, and on the doc's words rather than the page. */
const markable = (t: ThreadView | undefined): t is ThreadView => !!t && t.status === "open" && !onPage(t)

/**
 * The markers for the threads found in the doc, one per line, top to bottom,
 * moved down where two would touch. tops is where each thread's words start,
 * measured against the gutter's own box. Pure.
 */
export function marksFor(tops: ReadonlyMap<string, number>, threads: ReadonlyMap<string, ThreadView>): GutterMark[] {
    const rows: GutterMark[] = []
    for (const [id, top] of tops) {
        const t = threads.get(id)
        if (!markable(t)) continue
        const row = rows.find((m) => Math.abs(m.top - top) < MARK / 2)
        if (row) {
            row.ids.push(id)
            row.comments += t.comments.length
            row.unread ||= t.unread
        } else {
            rows.push({ top, ids: [id], comments: t.comments.length, unread: t.unread, quote: t.anchor.quote ?? "" })
        }
    }
    rows.sort((a, b) => a.top - b.top)
    for (let i = 1; i < rows.length; i++) rows[i].top = Math.max(rows[i].top, rows[i - 1].top + MARK + GAP)
    return rows
}

const sameMarks = (a: GutterMark[], b: GutterMark[]) =>
    a.length === b.length &&
    a.every((m, i) => m.top === b[i].top && m.comments === b[i].comments && m.unread === b[i].unread && m.ids.join() === b[i].ids.join())

/** In words, for the marker's name. */
function markLabel(m: GutterMark): string {
    if (m.ids.length > 1) return `${m.ids.length} threads on this line, ${m.comments} comments${m.unread ? ", unread" : ""}`
    const quote = quoteLine(m.quote, 60)
    return `${quote ? `Comment on “${quote}”` : "Comment"}, ${m.comments === 1 ? "1 comment" : `${m.comments} comments`}${m.unread ? ", unread" : ""}`
}

export default function ThreadGutter({ docId, editor }: SlotProps) {
    const wide = useWide()
    if (!editor || !docId || !wide) return null
    return <Gutter docId={docId} editor={editor} />
}

function Gutter({ docId, editor }: { docId: string; editor: Editor }) {
    const t = useDocThreads(docId)
    const open = useOpenComments(docId)
    const active = useUi(docId, (ui) => ui.active)
    const box = React.useRef<HTMLDivElement>(null)
    const [marks, setMarks] = React.useState<GutterMark[]>([])
    const threads = React.useMemo(() => new Map(t.threads.map((x) => [x.id, x])), [t.threads])

    const measure = React.useCallback(() => {
        const el = box.current
        const found = editor.isDestroyed ? undefined : anchorDecorationsKey.getState(editor.state)
        if (!el || !found) return
        const todo: [string, number][] = []
        for (const [id, r] of found.resolved) if (r.state === "attached" && markable(threads.get(id))) todo.push([id, r.from])
        // Nothing to place, nothing to read: a doc with no open thread on its
        // words reads no layout as it is typed in (I20).
        if (!todo.length) {
            setMarks((prev) => (prev.length ? [] : prev))
            return
        }
        const top0 = el.getBoundingClientRect().top
        const tops = new Map<string, number>()
        for (const [id, from] of todo) {
            try {
                const at = editor.view.coordsAtPos(from)
                tops.set(id, Math.round((at.top + at.bottom) / 2 - top0 - MARK / 2))
            } catch {
                // Not drawn yet: placed on the next pass.
            }
        }
        const next = marksFor(tops, threads)
        setMarks((prev) => (sameMarks(prev, next) ? prev : next))
    }, [editor, threads])

    React.useEffect(() => {
        let frame = 0
        let timer: ReturnType<typeof setTimeout> | undefined
        const soon = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(measure)
        }
        const settled = () => {
            clearTimeout(timer)
            timer = setTimeout(soon, SETTLE_MS)
        }
        soon()
        editor.on("transaction", settled)
        const resized = new ResizeObserver(soon)
        resized.observe(editor.view.dom)
        void document.fonts?.ready.then(soon)
        return () => {
            editor.off("transaction", settled)
            resized.disconnect()
            clearTimeout(timer)
            cancelAnimationFrame(frame)
        }
    }, [editor, measure])

    const hover = (id: string | null) => {
        const now = uiOf(docId).hovered
        if (id) setUi(docId, { hovered: id })
        else if (now && marks.some((m) => m.ids.includes(now))) setUi(docId, { hovered: null })
    }

    return (
        <div ref={box} data-thread-gutter="" className="relative">
            {marks.map((m) => {
                const on = !!active && m.ids.includes(active)
                return (
                    <button
                        key={m.ids[0]}
                        type="button"
                        data-thread-marker=""
                        aria-label={markLabel(m)}
                        title={m.ids.length > 1 ? "Open these threads" : "Open the thread"}
                        onClick={() => open({ thread: m.ids[0] })}
                        onPointerEnter={() => hover(m.ids[0])}
                        onPointerLeave={() => hover(null)}
                        onFocus={() => hover(m.ids[0])}
                        onBlur={() => hover(null)}
                        style={{ top: m.top }}
                        className={cn(
                            "absolute right-1 flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1 text-meta tabular-nums transition-[background-color,color] duration-[140ms] ease-out",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                            on ? "bg-press text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
                        )}
                    >
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {m.comments > 1 && <span>{m.comments}</span>}
                        {m.unread && <UnreadDot className="absolute right-0.5 top-0.5" />}
                    </button>
                )
            })}
        </div>
    )
}
