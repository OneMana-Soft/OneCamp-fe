"use client"

import { useDispatch, useStore } from "react-redux"
import { usePost } from "@/hooks/usePost"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useStableCallback } from "@/hooks/useStableCallback"
import type { EditTarget } from "@/hooks/useSaveEdit"
import { optimistic, type OptimisticResult } from "@/lib/optimistic"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { removePostByPostId, restorePost } from "@/store/slice/channelSlice"
import { RemoveMessageFromChatList, RestoreMessageInChatList, removeChatByChatId, restoreChat } from "@/store/slice/chatSlice"
import { removeGroupChatByChatId, restoreGroupChat } from "@/store/slice/groupChatSlice"
import type { RootState } from "@/store/store"
import type { CreateOrUpdateChatsReq } from "@/types/chat"
import type { CreateOrUpdatePostsReq } from "@/types/post"
import type { UserProfileInterface } from "@/types/user"

/**
 * A message to delete: a channel's post, a DM's message (chatId is the
 * conversation as chatSlice keeps it), or a group's. The same targets an edit
 * takes (hooks/useSaveEdit), so a list names a message one way for both.
 */
type MessageRef = Extract<EditTarget, { kind: "post" | "dm" | "group" }>

/**
 * Deletes a message the way every list and thread page does (QA F-01, F-02):
 * it leaves at once, and a delete the server refuses puts it back where it
 * was, with its sidebar preview, and takes its tombstone away, so nothing
 * keeps out a message that is still there for everyone. The request says the
 * failure (usePost); nothing is said when it works. A message the screen no
 * longer has is still deleted, and comes back by its next page if refused.
 */
export function useDeleteMessage(): (ref: MessageRef) => Promise<OptimisticResult<unknown>> {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const post = usePost()
  // A DM's sidebar row is keyed by both people; before the reader's profile
  // has loaded, its preview is left alone.
  const selfUuid = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid

  return useStableCallback((ref: MessageRef) => {
    const state = store.getState()
    if (ref.kind === "post") {
      const before = state.channel.channelPosts[ref.channelId]?.find((p) => p.post_uuid === ref.id)
      return optimistic({
        key: ref.id,
        apply: () => dispatch(removePostByPostId({ channelId: ref.channelId, postId: ref.id })),
        revert: () => {
          if (before) dispatch(restorePost({ containerId: ref.channelId, item: before }))
        },
        commit: () =>
          post.makeRequest<CreateOrUpdatePostsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChannelPost,
            payload: { post_id: ref.id },
            showErrorToast: true,
          }),
      })
    }

    const container = ref.kind === "dm" ? ref.chatId : ref.grpId
    const list = (ref.kind === "dm" ? state.chat.chatMessages : state.groupChat.chatMessages)[container] ?? []
    const before = list.find((c) => c.chat_uuid === ref.id)
    // The sidebar row: a DM's is keyed by both people, a group's by the group.
    const row = ref.kind === "group" ? ref.grpId : selfUuid ? getGroupingId(ref.chatId, selfUuid) : undefined
    // A group's messages live in another slice than its row, so the row is
    // handed the message that becomes its preview; a DM's row finds it.
    const remaining = list.filter((c) => c.chat_uuid !== ref.id)
    const fallbackMessage = ref.kind === "group" ? remaining[remaining.length - 1] ?? null : undefined

    return optimistic({
      key: ref.id,
      apply: () => {
        dispatch(
          ref.kind === "dm"
            ? removeChatByChatId({ chatId: ref.chatId, messageId: ref.id })
            : removeGroupChatByChatId({ grpId: ref.grpId, messageId: ref.id }),
        )
        if (row) dispatch(RemoveMessageFromChatList({ grpId: row, messageId: ref.id, chatKey: container, fallbackMessage }))
      },
      revert: () => {
        if (!before) return
        dispatch(
          ref.kind === "dm"
            ? restoreChat({ containerId: ref.chatId, item: before })
            : restoreGroupChat({ containerId: ref.grpId, item: before }),
        )
        if (row) dispatch(RestoreMessageInChatList({ grpId: row, message: before }))
      },
      commit: () =>
        post.makeRequest<CreateOrUpdateChatsReq>({
          apiEndpoint: PostEndpointUrl.DeleteChatMessage,
          payload: { chat_id: ref.id },
          showErrorToast: true,
        }),
    })
  })
}
