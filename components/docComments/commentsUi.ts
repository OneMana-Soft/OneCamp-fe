"use client"

/**
 * What a doc's comment surfaces share, beyond the threads themselves (which
 * are in the threads store): the thread being looked at, the one the pointer
 * is over, and a new thread being written on an anchor. The margin, the doc's
 * highlights and the panel all read it, from wherever they are drawn (the
 * panel is outside the editor). The viewer's own state: never in the doc
 * (I5), never sent anywhere.
 */
import { useCallback, useSyncExternalStore } from "react"
import { useDispatch } from "react-redux"
import { useRouter } from "next/navigation"
import { useMedia } from "@/context/MediaQueryContext"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { Anchor, ResolvedAnchor } from "@/lib/anchors/types"

interface CommentsUi {
    /** The thread looked at: its words drawn strong, its card open. */
    active: string | null
    /** The thread the pointer is over, in the margin or the panel. */
    hovered: string | null
    /** A new thread being written, and what it is on. */
    pending: Anchor | null
    /**
     * Asks the panel to bring a thread into view, by its id or by a comment in
     * it (a notice names the comment); n is new each time it is asked.
     */
    reveal: { thread?: string; comment?: string; n: number } | null
}

const EMPTY: CommentsUi = { active: null, hovered: null, pending: null, reveal: null }

const docs = new Map<string, CommentsUi>()
const listeners = new Map<string, Set<() => void>>()
let asked = 0

export function uiOf(docId: string): CommentsUi {
    return docs.get(docId) ?? EMPTY
}

export function setUi(docId: string, patch: Partial<CommentsUi>) {
    const was = uiOf(docId)
    const next = { ...was, ...patch }
    if ((Object.keys(patch) as (keyof CommentsUi)[]).every((k) => was[k] === next[k])) return
    docs.set(docId, next)
    for (const l of [...(listeners.get(docId) ?? [])]) l()
}

function subscribe(docId: string, listener: () => void) {
    let set = listeners.get(docId)
    if (!set) listeners.set(docId, (set = new Set()))
    set.add(listener)
    return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(docId)
    }
}

/**
 * One part of it, so a component renders only when that part changes: the
 * pointer moving over the margin re-renders no card. pick returns a value
 * held in the state as it is (no new object).
 */
export function useUi<T>(docId: string, pick: (ui: CommentsUi) => T): T {
    const sub = useCallback((l: () => void) => subscribe(docId, l), [docId])
    return useSyncExternalStore(sub, () => pick(uiOf(docId)), () => pick(EMPTY))
}

/** Asks the panel to bring a thread into view, and looks at it. */
export function revealThread(docId: string, to: { thread?: string; comment?: string }) {
    setUi(docId, { active: to.thread ?? null, reveal: { ...to, n: ++asked } })
}

// Where each thread's words are in the doc's editor, for the panel beside it:
// published by the editor's overlay (CommentsOverlay) when what the panel
// shows would change (a thread's words found, lost, or in another order; how
// many exact matches a lost thread's words have), never on every key typed.
const NO_PLACES: ReadonlyMap<string, ResolvedAnchor> = new Map()
const NO_MATCHES: ReadonlyMap<string, number> = new Map()
interface Placed {
    map: ReadonlyMap<string, ResolvedAnchor>
    /** For each thread whose words changed, how many exact matches of them the doc has now. */
    matches: ReadonlyMap<string, number>
    sig: string
}
const places = new Map<string, Placed>()
const placeListeners = new Map<string, Set<() => void>>()

/** What the panel would show differently: each thread's state, the order of those found, the matches of those lost. */
function signature(map: ReadonlyMap<string, ResolvedAnchor>, matches: ReadonlyMap<string, number>): string {
    const found = [...map].filter(([, r]) => r.state === "attached") as [string, { state: "attached"; from: number }][]
    found.sort((a, b) => a[1].from - b[1].from)
    const rest = [...map].filter(([, r]) => r.state !== "attached").map(([id, r]) => `${id}:${r.state}:${matches.get(id) ?? 0}`)
    return `${found.map(([id]) => id).join(",")}|${rest.sort().join(",")}`
}

function told(docId: string) {
    for (const l of [...(placeListeners.get(docId) ?? [])]) l()
}

/** Where each thread's words are now; the matches of the lost ones stay as last counted unless given. */
export function publishPlaces(docId: string, map: ReadonlyMap<string, ResolvedAnchor>, matches?: ReadonlyMap<string, number>) {
    const held = matches ?? places.get(docId)?.matches ?? NO_MATCHES
    const sig = signature(map, held)
    if (places.get(docId)?.sig === sig) return
    places.set(docId, { map, matches: held, sig })
    told(docId)
}

/** The doc's editor is gone: nothing is placed. */
export function forgetPlaces(docId: string) {
    if (!places.delete(docId)) return
    told(docId)
}

function usePlaced<T>(docId: string, pick: (p: Placed | undefined) => T): T {
    const sub = useCallback((l: () => void) => {
        let set = placeListeners.get(docId)
        if (!set) placeListeners.set(docId, (set = new Set()))
        set.add(l)
        return () => {
            set.delete(l)
            if (set.size === 0) placeListeners.delete(docId)
        }
    }, [docId])
    return useSyncExternalStore(sub, () => pick(places.get(docId)), () => pick(undefined))
}

export function usePlaces(docId: string): ReadonlyMap<string, ResolvedAnchor> {
    return usePlaced(docId, (p) => p?.map ?? NO_PLACES)
}

/** For each thread whose words changed, how many exact matches of them the doc has (for "Reattach here"). */
export function useMatches(docId: string): ReadonlyMap<string, number> {
    return usePlaced(docId, (p) => p?.matches ?? NO_MATCHES)
}

/**
 * Opens a doc's comments where the screen keeps them: the panel beside the
 * doc, or on a phone the comments page; at a thread when one is named, or
 * with a new thread to write when an anchor is.
 */
export function useOpenComments(docId: string) {
    const dispatch = useDispatch()
    const router = useRouter()
    const { isMobile } = useMedia()
    return useCallback(
        (to?: { thread?: string; start?: Anchor }) => {
            if (to?.start) setUi(docId, { pending: to.start, active: null })
            if (isMobile) {
                const path = to?.start ? "/new" : to?.thread ? `/${encodeURIComponent(to.thread)}` : ""
                router.push(`/app/doc/${docId}/comment${path}`)
                return
            }
            if (to?.thread) revealThread(docId, { thread: to.thread })
            dispatch(openRightPanel({ docUUID: docId }))
        },
        [docId, dispatch, router, isMobile],
    )
}
