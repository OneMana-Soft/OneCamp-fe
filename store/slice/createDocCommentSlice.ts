import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

/**
 * RETIRED as the doc comment store (docs programme B7). A doc's comments live
 * in their threads (store/slice/threadsSlice.ts): read from the threads API,
 * written through it and through the comment routes by id, and kept live by
 * the doc's events (lib/docComments/events). A composer keeps its own draft and
 * uploads (components/docComments/useCommentDraft), so a late upload can't
 * join another comment (N41).
 *
 * What is left is the comment count the doc's header and the phone's app bar
 * show, and the one draft action the frozen doc page (DocView) still
 * dispatches, which does nothing now: Comment on a selection starts an
 * anchored thread instead (components/docComments/CommentsOverlay). The
 * integrator's wiring moves the count and deletes this file (B7 hand-back).
 *
 * Joins the store with the pages that show the count (store/lazySlices.ts).
 */

interface CountedComments {
    [docId: string]: { added: string[]; removed: string[] }
}

/** How many comment ids each doc remembers having counted (the latest kept). */
const COUNTED_LIMIT = 200

const initialState = {
    docCommentCount: {} as Record<string, number>,
    // Retired: the frozen doc page reads a draft here when its Comments button
    // is pressed; nothing writes one now, so it reads nothing.
    docCommentInputState: {} as Record<string, { commentBody: string } | undefined>,
    // Which comment events each doc's count has taken, so one is never
    // counted twice: the answer to a write and its echo, or an event the
    // router and a page both heard.
    countedComments: {} as CountedComments,
}

type State = typeof initialState

/** Notes a comment's event for a doc's count; false when it was counted already. */
function countOnce(state: State, docId: string, commentId: string | undefined, kind: "added" | "removed"): boolean {
    if (!commentId) return true
    const counted = (state.countedComments[docId] ??= { added: [], removed: [] })
    if (counted[kind].includes(commentId)) return false
    counted[kind].push(commentId)
    if (counted[kind].length > COUNTED_LIMIT) counted[kind].splice(0, counted[kind].length - COUNTED_LIMIT)
    return true
}

export const createDocCommentSlice = createSlice({
    name: "createDocComment",
    initialState,
    reducers: {
        /**
         * Retired: the frozen doc page still puts a selection's quote here
         * when its Comments button is pressed. Nothing reads it; the doc's
         * Comment action starts an anchored thread on the selection.
         */
        createOrUpdateDocCommentBody: {
            reducer() {},
            prepare: (payload: { docUUID: string; body: string }) => ({ payload }),
        },

        /** One comment more, counted once however many times its event arrives. */
        incrementDocCommentCount: (state, action: PayloadAction<{ docId: string; commentId?: string }>) => {
            const { docId, commentId } = action.payload
            if (!countOnce(state, docId, commentId, "added")) return
            state.docCommentCount[docId] = (state.docCommentCount[docId] || 0) + 1
        },

        /** One comment fewer; never below 0, so a delete heard out of order can't show a negative count. */
        decrementDocCommentCount: (state, action: PayloadAction<{ docId: string; commentId?: string }>) => {
            const { docId, commentId } = action.payload
            if (!countOnce(state, docId, commentId, "removed")) return
            state.docCommentCount[docId] = Math.max(0, (state.docCommentCount[docId] || 0) - 1)
        },

        /** The count as the doc's own answer gives it. */
        updateDocCommentCount: (state, action: PayloadAction<{ docId: string; newCount: number }>) => {
            state.docCommentCount[action.payload.docId] = action.payload.newCount
        },
    },
})

export const { createOrUpdateDocCommentBody, incrementDocCommentCount, decrementDocCommentCount, updateDocCommentCount } =
    createDocCommentSlice.actions

declare module "@/store/lazySlices" {
    interface LazySlices {
        createDocComment: ReturnType<typeof createDocCommentSlice.reducer>
    }
}
