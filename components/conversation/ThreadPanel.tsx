"use client"

import dynamic from "next/dynamic"
import { ComposerHost } from "@/components/conversation/ComposerHost"
import type { ThreadRef } from "@/lib/conversation/types"

// Each kind's panel loads the first time one is opened, not with the page: a
// thread's reply box brings the whole editor (components/rightPanel).
const loaders = {
    channel: () => import("@/components/rightPanel/channelComments"),
    dm: () => import("@/components/rightPanel/chatComments"),
    group: () => import("@/components/rightPanel/groupChatComments"),
}
const ChannelComments = dynamic(() => loaders.channel().then((m) => m.ChannelComments))
const ChatComments = dynamic(() => loaders.dm().then((m) => m.ChatComments))
const GroupChatComments = dynamic(() => loaders.group().then((m) => m.GroupChatComments))

/** Fetches the thread panels' code ahead of their first use (the right panel's idle preload). */
export function preloadThreadPanels(): void {
    Object.values(loaders).forEach((load) => void load().catch(() => {}))
}

/**
 * A thread, beside its conversation (chat A1 host, PROGRAM.md §3.6: frozen
 * once A1 merges, its slots the integrator's): its root and replies, and the
 * reply box, which writes to the thread (ComposerHost).
 *
 * Step 1 (A1): today's per-kind panels, which read the open thread from the
 * right panel's state; CHAT-A1B moves them in, and a panel then loads its own
 * root, so a link to a reply whose root isn't loaded still opens.
 */
export function ThreadPanel({ thread }: { thread: ThreadRef }) {
    const panel = thread.in.kind === "channel" ? <ChannelComments /> : thread.in.kind === "dm" ? <ChatComments /> : <GroupChatComments />
    return <ComposerHost target={thread}>{panel}</ComposerHost>
}
