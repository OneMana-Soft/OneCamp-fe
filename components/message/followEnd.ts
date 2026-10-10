/**
 * Whether a conversation still follows its newest message after a scroll.
 *
 * A reader at the end of a conversation stays there as it grows, and a reader
 * who scrolled up stays where they are. The list used to decide that from the
 * position alone (within 24px of the end, or not), so a scroll the reader never
 * made counted as one: opening a channel with images, link cards and older
 * messages arriving together, the virtualiser corrected its estimates and moved
 * the view about 500px up, that scroll event said "not at the end", and the
 * conversation opened in the middle with "Jump to latest" showing (one open in
 * four in the QA probe of 10 Oct).
 *
 * Now only the reader leaves the end: a scroll within a moment of their own
 * input (wheel, touch, keys, a press on the scrollbar), or one that moved the
 * view without the content changing size (find in page, a jump to a quoted
 * message). A scroll that came with the content changing size, and no input,
 * is the layout settling: a reader who was following keeps following, and is
 * put back at the end.
 */

/** Within this many pixels of the end is at the end. */
export const AT_END_PX = 24

/** How long after the reader's own input a scroll still counts as theirs. */
export const READER_INPUT_MS = 800

export interface ScrollFacts {
    /** Distance from the end after the scroll, in px. */
    fromBottom: number
    /** Whether the list was following its end before this scroll. */
    wasFollowing: boolean
    /** The reader's own input came in the last READER_INPUT_MS. */
    readerInput: boolean
    /** The content's size changed since the previous scroll. */
    contentResized: boolean
}

export interface FollowDecision {
    /** Follow the end from now on. */
    following: boolean
    /** Put the reader back at the end now: the layout moved them off it. */
    repin: boolean
}

export function followAfterScroll({ fromBottom, wasFollowing, readerInput, contentResized }: ScrollFacts): FollowDecision {
    if (fromBottom <= AT_END_PX) return { following: true, repin: false }
    const layoutMoved = !readerInput && contentResized
    if (layoutMoved && wasFollowing) return { following: true, repin: true }
    return { following: false, repin: false }
}
