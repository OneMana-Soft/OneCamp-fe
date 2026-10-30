/**
 * What someone may do with a doc, in one place (docs incident, 14 Oct 2026).
 *
 * The server decides the level (the Access Resolver: authorship, shares,
 * general access, teams, a space, full access, a hand-over, a lock) and writes
 * it into the counts every doc answer carries (doc_read_access,
 * doc_comment_access, doc_edit_access, doc_full_access: more than none is
 * yes). docLevelOf reads them; docAbilities says what the level allows. Every
 * surface (the comments panel and the phone's page, the selection bar, Ask AI,
 * the header, Share, the access bar) asks these two, never the counts or the
 * sharing lists itself: the comment box once hid from everyone whose right
 * came from anything but a direct share.
 *
 * Ask AI's actions need what the server says each needs (GET /ai/status,
 * doc_action_needs: business/AI DocActionNeeds, which /ai/doc/complete
 * refuses by), so the panel offers exactly what the server will run. An
 * action the server doesn't name, or no list at all, needs edit.
 */

export type DocLevel = "none" | "view" | "comment" | "edit" | "full"

const RANK: Record<DocLevel, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 }

/** Whether a level is at least another. Pure. */
export function atLeast(level: DocLevel, need: DocLevel): boolean {
    return RANK[level] >= RANK[need]
}

/** The counts a doc answer carries, written by the server from the resolver. */
export interface DocAccessCounts {
    doc_read_access?: number
    doc_comment_access?: number
    doc_edit_access?: number
    doc_full_access?: number
}

/** The level the server decided, from a doc answer's counts. Pure. */
export function docLevelOf(doc: DocAccessCounts | null | undefined): DocLevel {
    if (!doc) return "none"
    if ((doc.doc_full_access ?? 0) > 0) return "full"
    if ((doc.doc_edit_access ?? 0) > 0) return "edit"
    if ((doc.doc_comment_access ?? 0) > 0) return "comment"
    if ((doc.doc_read_access ?? 0) > 0) return "view"
    return "none"
}

/** What each Doc AI action needs, as the server says (/ai/status). */
export type DocActionNeeds = Record<string, string>

export interface DocAbilities {
    level: DocLevel
    /** Open the doc and read it. */
    view: boolean
    /** Comment on it. */
    comment: boolean
    /** Change it: its body, its title. */
    edit: boolean
    /** Change who has it (full access). */
    share: boolean
    /** Ask AI something whose answer is read in the panel. */
    askRead: boolean
    /** Ask AI something that changes the doc, and put an answer into it. */
    askWrite: boolean
    /** Whether this Doc AI action may be asked here. */
    canAsk: (action: string) => boolean
}

function needOf(needs: DocActionNeeds | null | undefined, action: string): DocLevel {
    const n = needs?.[action]
    return n && n in RANK ? (n as DocLevel) : "edit"
}

/** What a level allows. needs: the server's list for Ask AI (none: AI asks need edit). Pure. */
export function docAbilities(level: DocLevel, needs?: DocActionNeeds | null): DocAbilities {
    const canAsk = (action: string) => level !== "none" && atLeast(level, needOf(needs, action))
    const reading = Object.keys(needs ?? {}).filter((a) => RANK[needOf(needs, a)] < RANK.edit)
    return {
        level,
        view: atLeast(level, "view"),
        comment: atLeast(level, "comment"),
        edit: atLeast(level, "edit"),
        share: atLeast(level, "full"),
        askRead: reading.some(canAsk),
        askWrite: atLeast(level, "edit"),
        canAsk,
    }
}

/** What the person may do, said as the access bar and the comment panel say it. Pure. */
export function levelSentence(level: DocLevel, locked = false): string {
    if (locked && level === "comment") return "This doc is locked, so you can comment on it"
    switch (level) {
        case "view":
            return "You can view this doc"
        case "comment":
            return "You can comment on this doc"
        case "edit":
            return "You can edit this doc"
        case "full":
            return "You have full access to this doc"
    }
    return ""
}

/** The docs list's mark for a doc the person can't change; "" for one they can. Pure. */
export function levelLabel(level: string | undefined): string {
    if (level === "view") return "View only"
    if (level === "comment") return "Can comment"
    return ""
}

/** Whether someone at a level, under a lock, may decide suggestions (the server's rule). Pure. */
export function maySuggestDecide(level: DocLevel, lock: "" | "soft" | "hard" | undefined): boolean {
    return atLeast(level, "edit") && (lock !== "hard" || level === "full")
}

/** Whether someone at a level, under a lock, chooses between Editing and Suggesting: a hard lock takes no suggestions. Pure. */
export function offersModes(level: DocLevel, lock: "" | "soft" | "hard" | undefined): boolean {
    return atLeast(level, "edit") && lock !== "hard"
}
