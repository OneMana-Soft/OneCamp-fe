/**
 * Focus mode — what the sidebar shows first, and what it folds away.
 *
 * The rail grew one peer per module: Home, Channels, DMs, My Tasks,
 * Calendar, Tables, Templates, Activity, Admin, sitting directly above a
 * second taxonomy (projects, teams, channels, chats, Docs, Boards). Two
 * competing taxonomies at equal weight is what makes the app read as a
 * lobby of doors rather than a place to work, and it is the single most
 * repeated ask in the public feedback: fewer peers, not more modules.
 *
 * So the peers that are destinations people visit occasionally fold
 * behind one disclosure, and the surfaces people live in stay in the
 * rail. Folding is a default, not a cage: the disclosure remembers being
 * opened (see useSidebarDisclosure), and navigating to a folded
 * destination opens it.
 *
 * Boards is deliberately not folded. It is not a peer destination but a
 * collection section alongside Docs, already closed by default and
 * carrying its own inline creator, so folding it would bury the
 * per-board list two levels down and take the creator with it.
 */

/** Title of the disclosure the folded destinations live behind. */
export const FOCUS_SECTION_TITLE = "More"

/** Key the disclosure's open state is remembered under. */
export const FOCUS_SECTION_KEY = "more"

/**
 * Peer destinations that start folded behind {@link FOCUS_SECTION_TITLE}.
 *
 * Matched on the title the user reads rather than on a path, so renaming
 * a rail entry and forgetting this list is a failing test rather than a
 * silently unfolded module.
 */
export const FOLDED_NAV_TITLES = ["Calendar", "Tables", "Templates"] as const

/**
 * Split a nav list into what stays and what folds, preserving order in
 * both halves. Generic over anything with a title so the desktop rail,
 * the mobile drawer and the tests all partition the same way.
 */
export function partitionByTitle<T extends { title: string }>(
    items: readonly T[],
    titles: readonly string[],
): { kept: T[]; folded: T[] } {
    const fold = new Set(titles)
    const kept: T[] = []
    const folded: T[] = []
    for (const item of items) {
        if (fold.has(item.title)) {
            folded.push(item)
        } else {
            kept.push(item)
        }
    }
    return { kept, folded }
}
