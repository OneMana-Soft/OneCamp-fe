"use client"

import { TypingIndicator } from "@/components/typingIndicator/typyingIndicaator"
import type { UserProfileDataInterface } from "@/types/user"

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
