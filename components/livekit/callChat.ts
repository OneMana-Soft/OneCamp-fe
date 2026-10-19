"use client"

/**
 * The dock's Chat (step 3, part 2): the conversation the call belongs to (a
 * channel's, a DM's or a group's), beside the call in split view. CallDock
 * had a Chat button, but VideoConference was never given anything for it.
 *   - The conversation is the page the call sits beside: Chat goes to its composer.
 *   - It is open beside the call: Chat closes it.
 *   - Otherwise: Chat opens it beside the call.
 * On a call's own page it opens beside the call there (MeetingSplit).
 * Split view is a computer's (LayoutContent turns it off on phones and
 * tablets), and leaving a call's page there hangs up, so a phone has no Chat.
 * An instant meeting and a guest's call have no conversation, so no Chat.
 */

import { useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"
import { usePathname } from "next/navigation"
import type { RootState } from "@/store/store"
import { closeSplit, openInSplit } from "@/store/slice/splitSlice"
import { MAIN, paneFromHref, type Pane } from "@/lib/split"
import { useSplitActions } from "@/hooks/useSplitView"
import { useMedia } from "@/context/MediaQueryContext"
import { useShellBand } from "@/components/navigationBar/tablet/useShellBand"
import { isTabletBand } from "@/lib/ui/shellBand"

export type CallChatKind = "channel" | "chat" | "group"

/** The pane of the conversation a call belongs to. Pure. */
export const conversationOf = (kind: CallChatKind, id: string): Pane => ({ kind, id })

const same = (a: Pane | null, b: Pane) => !!a && a.kind === b.kind && a.id === b.id

/** What Chat does now, and whether the conversation is already in view. Pure. */
export function callChatAction(conversation: Pane, pathname: string, panes: readonly Pane[]): { action: "focus" | "close" | "open"; open: boolean; index: number } {
  if (same(paneFromHref(pathname), conversation)) return { action: "focus", open: true, index: -1 }
  const index = panes.findIndex((p) => same(p, conversation))
  return index >= 0 ? { action: "close", open: true, index } : { action: "open", open: false, index: -1 }
}

/** The dock's Chat for a call in a conversation: nothing where split view isn't. */
export function useCallChat(kind: CallChatKind, id: string): { onChatToggle?: () => void; isChatOpen?: boolean } {
  const { isMobile } = useMedia()
  const band = useShellBand()
  const splits = !isMobile && !isTabletBand(band)
  const pathname = usePathname() ?? ""
  const panes = useSelector((s: RootState) => s.split.panes)
  const dispatch = useDispatch()
  const run = useSplitActions()
  const conversation = conversationOf(kind, id)
  const { action, open, index } = callChatAction(conversation, pathname, panes)
  const toggle = useCallback(() => {
    if (action === "focus") run({ type: "goTo", view: MAIN })
    else if (action === "close") dispatch(closeSplit(index))
    else dispatch(openInSplit(conversation))
    // conversation is rebuilt each render from kind and id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, index, run, dispatch, kind, id])
  if (!splits || !id) return {}
  return { onChatToggle: toggle, isChatOpen: open }
}
