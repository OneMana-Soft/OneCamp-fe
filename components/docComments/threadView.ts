/**
 * How a doc's threads are listed (docs programme B7). Pure, so each rule is
 * tested without rendering.
 */
import type { Anchor, ResolvedAnchor } from "@/lib/anchors/types"
import type { ThreadView } from "@/components/threads/types"
import type { UserProfileDataInterface } from "@/types/user"
import { displayNameOf } from "@/lib/personName"

export type Tab = "open" | "resolved"

/** A thread on the page as a whole: no anchor, or a comment from before threads. */
export const onPage = (t: ThreadView) => t.legacy || t.anchor.kind === "none" || !t.anchor.kind

/**
 * Whether a lost thread's quote is words that may be found again ("Reattach
 * here"). A block with no words of its own is quoted by its kind ("Image"),
 * which is never matched against the doc's words.
 */
export const quotesWords = (anchor: Anchor) => !!anchor.quote && anchor.meta?.named !== true

/** What a thread that lost its place says happened: its words changed, or its blocks went. */
export function lostLabel(anchor: Anchor): string {
    if (anchor.kind !== "block") return "Original text was changed"
    const ids = anchor.meta?.block_ids
    return Array.isArray(ids) && ids.length > 1 ? "Those blocks were removed" : "The block was removed"
}

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0)

/**
 * The order a tab lists its threads in.
 * - Open: the page's own threads first, oldest first, as a conversation at
 *   the top of a page reads; then those on the text, in the doc's order where
 *   the doc beside it says where each is (where), else as they were started;
 *   then those whose text was changed, newest first.
 * - Resolved: the latest resolved first.
 */
export function orderThreads(threads: ThreadView[], tab: Tab, where?: ReadonlyMap<string, ResolvedAnchor>): ThreadView[] {
    if (tab === "resolved") {
        return [...threads].sort((a, b) => time(b.resolved_at || b.updated_at) - time(a.resolved_at || a.updated_at))
    }
    const rank = (t: ThreadView) => {
        if (onPage(t)) return 0
        return where?.get(t.id)?.state === "detached" ? 2 : 1
    }
    const posOf = (t: ThreadView) => {
        const r = where?.get(t.id)
        return r?.state === "attached" ? r.from : Number.MAX_SAFE_INTEGER
    }
    return [...threads].sort((a, b) => {
        const ra = rank(a)
        const rb = rank(b)
        if (ra !== rb) return ra - rb
        if (ra === 0) return time(a.created_at) - time(b.created_at)
        if (ra === 2) return time(b.created_at) - time(a.created_at)
        return posOf(a) - posOf(b) || time(a.created_at) - time(b.created_at)
    })
}

/** The people who wrote in a doc's threads, each once, the viewer first, then by name. */
export function peopleIn(threads: ThreadView[], me?: string): UserProfileDataInterface[] {
    const byId = new Map<string, UserProfileDataInterface>()
    for (const t of threads) for (const c of t.comments) if (c.comment_by?.user_uuid) byId.set(c.comment_by.user_uuid, c.comment_by)
    return [...byId.values()].sort((a, b) => {
        if (a.user_uuid === me) return -1
        if (b.user_uuid === me) return 1
        return displayNameOf(a).localeCompare(displayNameOf(b))
    })
}

/** Whether a person wrote in a thread: the person filter's rule. */
export const wroteIn = (t: ThreadView, person: string) => t.comments.some((c) => c.comment_by?.user_uuid === person)

/**
 * The comments a card shows while folded: a long thread keeps its first
 * comment and its latest two, and says how many are between. All of them
 * once unfolded, or when there are few.
 */
export function foldComments<T>(comments: T[], unfolded: boolean): { shown: T[]; hidden: number; at: number } {
    if (unfolded || comments.length <= 4) return { shown: comments, hidden: 0, at: comments.length }
    return { shown: [comments[0], ...comments.slice(-2)], hidden: comments.length - 3, at: 1 }
}

/** The thread's quote as one line of words, cut where it is long. */
export function quoteLine(quote: string | undefined, max = 140): string {
    const one = (quote ?? "").replace(/\s+/g, " ").trim()
    return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

/** How many comments, and whether there is news, in words, for the card's name. */
export function threadLabel(t: ThreadView): string {
    const n = t.comments.length
    const what = onPage(t) ? "Comment on the page" : t.anchor.quote ? `Comment on “${quoteLine(t.anchor.quote, 60)}”` : "Comment"
    const count = n === 1 ? "1 comment" : `${n} comments`
    return [what, count, t.unread ? "unread" : "", t.status === "resolved" ? "resolved" : ""].filter(Boolean).join(", ")
}
