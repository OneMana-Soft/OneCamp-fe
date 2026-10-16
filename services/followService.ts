import axiosInstance from "@/lib/axiosInstance"
import { patchCached } from "@/lib/swrMutate"

// How much someone hears about one thing (business/Follow; docs programme A6).
//
//   all       every comment and proposal on it;
//   mentions  replies to what they take part in, and @mentions of them (the
//             default for a doc's owner and editors, and anyone who commented);
//   none      only an @mention of them.
//
// The path lives here until the integrator moves it into services/endPoints.ts
// (an append-only file, edited at merge).

export const FOLLOWS_URL = "/follows"

export type FollowMode = "all" | "mentions" | "none"

export interface FollowState {
    resource_kind: string
    resource_uuid: string
    mode: FollowMode
    /** Whether they chose it; otherwise mode is their default. */
    chosen: boolean
    default: FollowMode
}

interface FollowResponse {
    msg: string
    data: FollowState
}

export const followUrl = (docId: string, kind = "doc") =>
    docId ? `${FOLLOWS_URL}?resource_kind=${encodeURIComponent(kind)}&resource_uuid=${encodeURIComponent(docId)}` : ""

/** The modes as a person reads them, in the order they're offered. */
export const FOLLOW_MODES: { mode: FollowMode; label: string; hint: string }[] = [
    { mode: "all", label: "All activity", hint: "Every comment and proposed change" },
    { mode: "mentions", label: "Replies and mentions", hint: "Comments where you take part, and @mentions" },
    { mode: "none", label: "Only @mentions", hint: "Nothing else from this page" },
]

/**
 * Chooses a mode, or with null forgets the choice so the default applies, and
 * writes the answer into the cached state at once.
 */
export async function setFollow(docId: string, mode: FollowMode | null): Promise<FollowState> {
    const res =
        mode === null
            ? await axiosInstance.delete<FollowResponse>(followUrl(docId))
            : await axiosInstance.put<FollowResponse>(FOLLOWS_URL, { resource_kind: "doc", resource_uuid: docId, mode })
    const state = res.data.data
    patchCached<FollowResponse>(followUrl(docId), (cached) => (cached ? { ...cached, data: state } : cached))
    return state
}
