"use client"

/**
 * Link mode: a conversation opened at a message from a link (?postId= in a
 * channel, ?messageId= in a DM or a group), from Activity, the Inbox, search,
 * Later, Home or an AI citation. The rules the three message lists share:
 *
 * - The link is the main view's. A split pane beside a linked conversation
 *   read the main view's ?postId=, asked for that message in its own
 *   conversation, and showed a load error (FE-BUG-12).
 * - The page around the linked message is shown whenever the list doesn't
 *   hold that message. It was shown only in an empty list, so a link into a
 *   conversation already in memory left the message out (FE-BUG-8).
 * - Leaving the link goes back to the latest page. Jump to latest kept the
 *   link, compared with a latest page never fetched in link mode, and put the
 *   linked page back (FE-BUG-9); it now drops the link from the address, and
 *   the list lets the linked page go, so the latest page seeds it afresh
 *   rather than merging in after it with a gap between.
 *
 * useLinkTarget.test.tsx holds it.
 */
import { createContext, useCallback, useContext, useEffect, useRef } from "react"
import { useDispatch } from "react-redux"
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation"
import { updateChannelPosts, updateChannelScrollToBottom } from "@/store/slice/channelSlice"
import { updateChats, updateChatScrollToBottom } from "@/store/slice/chatSlice"
import { updateGroupChats, updateGroupChatScrollToBottom } from "@/store/slice/groupChatSlice"

/** True inside a split pane (components/split/SplitPane): the page's address isn't the pane's. */
export const InSplitPaneContext = createContext(false)

export const useInSplitPane = () => useContext(InSplitPaneContext)

/** The page's search params (useSearchParams) where they are this view's: the main view's, null in a split pane. */
export function useLinkSearchParams(params: ReadonlyURLSearchParams | null): ReadonlyURLSearchParams | null {
  return useInSplitPane() ? null : params
}

/** Drops the link from the address, keeping the rest of it; says whether there was one. */
export function useLeaveLink(param: "postId" | "messageId"): () => boolean {
  const router = useRouter()
  const pathname = usePathname()
  const params = useLinkSearchParams(useSearchParams())
  return useCallback(() => {
    if (!params?.get(param)) return false
    const rest = new URLSearchParams(params.toString())
    rest.delete(param)
    const query = rest.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    return true
  }, [params, param, pathname, router])
}

type Kind = "channel" | "chat" | "group"
type Message = { post_uuid?: string; chat_uuid?: string }

/**
 * The linked page in a list: shown when the list holds messages but not the
 * linked one (an empty list is seeded by the list itself), once per answer;
 * let go when the link is left, so the list's latest page seeds it, and the
 * list goes to its end once that page is in. hasNewer is told whether newer
 * messages are to be loaded below what is shown.
 */
export function useLinkedPage(kind: Kind, id: string, target: string | undefined, held: Message[], page: Message[] | undefined, hasNewer: (more: boolean) => void) {
  const dispatch = useDispatch()
  const shown = useRef<Message[] | undefined>(undefined)
  const linked = useRef({ id, target })
  const toLatest = useRef(false)
  useEffect(() => {
    const show = (items: Message[]) => {
      if (kind === "channel") dispatch(updateChannelPosts({ channelId: id, posts: items as never }))
      else if (kind === "chat") dispatch(updateChats({ chatId: id, chats: items as never }))
      else dispatch(updateGroupChats({ grpId: id, chats: items as never }))
      hasNewer(items.length > 0)
    }
    const idOf = (m: Message) => (kind === "channel" ? m.post_uuid : m.chat_uuid)
    const was = linked.current
    linked.current = { id, target }
    if (was.id === id && was.target && !target) {
      toLatest.current = true
      return show([])
    }
    if (toLatest.current && held.length > 0) {
      toLatest.current = false
      if (kind === "channel") dispatch(updateChannelScrollToBottom({ channelId: id, scrollToBottom: true }))
      else if (kind === "chat") dispatch(updateChatScrollToBottom({ chatId: id, scrollToBottom: true }))
      else dispatch(updateGroupChatScrollToBottom({ grpId: id, scrollToBottom: true }))
    }
    if (!target || !page?.length || held.length === 0 || shown.current === page) return
    if (held.some((m) => idOf(m) === target) || !page.some((m) => idOf(m) === target)) return
    shown.current = page
    show(page)
  }, [kind, id, target, held, page, hasNewer, dispatch])
}
