import { isCallPane, paneFromHref, type CallPaneKind, type Pane, type PaneKind } from "@/lib/split"

// Kept out of lib/split, which every page with split view loads: only the
// shell's frame (MeetingSplit, SplitPane) needs these.

const CALL_CONVERSATION: Record<CallPaneKind, PaneKind> = { "call-channel": "channel", "call-chat": "chat", "call-group": "group" }

/**
 * The conversation a call's own page belongs to (/app/meet/ch, chat or grp),
 * which the call's Chat opens beside it; null for a meeting, an instant call
 * or any other page. Pure.
 */
export function callConversationOf(pathname: string): Pane | null {
  const here = paneFromHref(pathname)
  return here && isCallPane(here) ? { kind: CALL_CONVERSATION[here.kind], id: here.id } : null
}

/**
 * Whether a pane can swap with the page: never a call, beside the page or as
 * it, since moving a call hangs it up. It is the swap action's own guard
 * (hooks/useSplitView.ts), asked by the pane's button so no button offers a
 * swap that does nothing; a test holds the two together. Pure.
 */
export function canSwapBeside(pane: Pane, pathname: string): boolean {
  const here = paneFromHref(pathname)
  return !isCallPane(pane) && !(here && isCallPane(here))
}
