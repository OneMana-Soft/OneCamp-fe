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
 * Design v3 (shell S5) takes this further: four rows stay (Home, Inbox, My
 * tasks, Later) and More is a popover holding every page that isn't daily,
 * Boards and Teams included, which are no longer sidebar sections.
 *
 * Docs came back out of More (docs programme B5): they are a place people
 * work in, as in Notion's sidebar, so the full sidebar gives them a section of
 * their own (the page tree, its heading the docs home), and the rails, which
 * have no sections, an item.
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
export const FOLDED_NAV_TITLES = [
    "Calendar",
    "Tables",
    "Templates",
    "Boards",
    "Mail",
    "Goals",
    "Reports",
    "Workload",
    "Recordings",
    "Teams",
] as const

/**
 * Destinations the full sidebar shows as a section of their own rather than
 * as a row, and the rails as an item: Docs (its section is the page tree).
 */
export const SECTION_NAV_TITLES = ["Docs"] as const

/**
 * The sidebar's three kinds of place, in order: the rows people live in, the
 * places that are sections in the full sidebar (items in the rails), and what
 * folds behind More. Pure.
 */
export function partitionNav<T extends { title: string }>(items: readonly T[]): { primary: T[]; sections: T[]; folded: T[] } {
    const { kept, folded } = partitionByTitle(items, FOLDED_NAV_TITLES)
    const { kept: primary, folded: sections } = partitionByTitle(kept, SECTION_NAV_TITLES)
    return { primary, sections, folded }
}

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
