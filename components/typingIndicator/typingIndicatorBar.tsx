"use client"

import { useMemo } from "react"
import { useSelector } from "react-redux"
import { TypingIndicator } from "@/components/typingIndicator/typyingIndicaator"
import type { UserProfileDataInterface } from "@/types/user"
import type { RootState } from "@/store/store"

interface TypingIndicatorBarProps {
    users: UserProfileDataInterface[]
}

/**
 * Layout wrapper for the typing pill below a chat / channel / group message
 * list.
 *
 * Desktop: inline at the bottom of the message column above the sticky input.
 * Mobile: fixed just above the DraggableDrawer. The drawer publishes its
 * current collapsed height to `--mobile-drawer-h` on the document element
 * so the pill tracks it exactly — including when the input grows for
 * multi-line text or attachment previews. Falls back to 126px (the
 * drawer's default initialHeight) when no drawer is mounted.
 *
 * `pointer-events-none` lets taps pass through to the message list / drawer.
 * When the user expands the drawer to compose, its higher z-index naturally
 * occludes the pill — composer takes focus, which is the desired UX.
 */
export function TypingIndicatorBar({ users }: TypingIndicatorBarProps) {
    return (
        <div
            className="fixed inset-x-0 z-[100] px-3 pb-1 pointer-events-none md:static md:bottom-auto md:inset-x-auto md:z-auto md:pointer-events-auto md:shrink-0"
            style={{ bottom: "var(--mobile-drawer-h, 126px)" }}
        >
            <TypingIndicator users={users} />
        </div>
    )
}

type Typing = RootState["typing"]["channelTyping"][string]

// The same people typing, in the same order: nothing to redraw.
const sameTypers = (a: Typing | undefined, b: Typing | undefined) =>
    a === b || (!!a && !!b && a.length === b.length && a.every((t, i) => t.userId === b[i]?.userId))

const NOBODY: Typing = []

function useTypers(select: (state: RootState) => Typing | undefined) {
    const typing = useSelector(select, sameTypers) || NOBODY
    return useMemo(() => typing.map((t) => t.user), [typing])
}

// Each conversation's bar reads who is typing itself. The message lists used
// to, so every "started typing" and "stopped typing" re-rendered the list that
// holds the whole conversation.

export function ChannelTypingBar({ channelId }: { channelId: string }) {
    const users = useTypers((s) => s.typing.channelTyping[channelId])
    return <TypingIndicatorBar users={users} />
}

export function ChatTypingBar({ chatId }: { chatId: string }) {
    const users = useTypers((s) => s.typing.chatTyping[chatId])
    return <TypingIndicatorBar users={users} />
}

export function GroupChatTypingBar({ grpId }: { grpId: string }) {
    const users = useTypers((s) => s.typing.groupChatTyping[grpId])
    return <TypingIndicatorBar users={users} />
}
