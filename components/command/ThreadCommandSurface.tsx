"use client"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import type { UserProfileInterface } from "@/types/user"
import { LazyCommandSurface } from "./LazyCommandSurface"

/** A thread's surface: what its reply box's "/" finds (commandSurfaceOf), and what its answers are kept under. */
export const threadSurfaceKey = (thread: string) => `thread:${thread}`

/**
 * A thread reply box's commands: its conversation's, run in that conversation
 * and in that thread (thread_ts), and answered above the box. Each reply box
 * has its own. A thread borrowed its conversation's, which only the
 * conversation's view drew, so a thread open without it offered none (every
 * thread on a phone: its own page). Its own key, not the conversation's: one
 * key holds one registration, so a thread's would take the conversation's
 * away as it closed.
 *
 * conversation is a channel's uuid, a DM's other person or a group's id, as
 * the routes name them.
 */
export function ThreadCommandSurface({ kind, conversation, thread }: {
    kind: "channel" | "dm" | "group"
    conversation: string
    thread: string
}) {
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid || ""
    const where = kind === "channel" ? { channelId: conversation } : { dmGroupId: kind === "dm" ? getGroupingId(conversation, self) : conversation }
    return (
        <LazyCommandSurface
            surfaceKey={threadSurfaceKey(thread)}
            {...where}
            threadTs={thread}
        />
    )
}
