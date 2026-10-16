"use client"

import { useCallback } from "react"
import { useDispatch, useStore } from "react-redux"
import type { RootState } from "@/store/store"
import { usePost } from "@/hooks/usePost"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { optimistic } from "@/lib/optimistic"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import { updatePostByPostId } from "@/store/slice/channelSlice"
import { updateChatByChatId, UpdateMessageTextInChatList } from "@/store/slice/chatSlice"
import { updateGroupChatByChatId } from "@/store/slice/groupChatSlice"
import { updateChannelCommentByCommentUUID } from "@/store/slice/channelCommentSlice"
import { updateChatCommentByCommentId } from "@/store/slice/chatCommentSlice"

/**
 * The message an edit is to: a channel's post, a DM's message (chatId is the
 * conversation as chatSlice keeps it), a group's message, or a reply in a
 * post's thread or in a DM's or a group's (chatMessageId is the message the
 * thread hangs from).
 */
export type EditTarget =
  | { kind: "post"; channelId: string; id: string }
  | { kind: "dm"; chatId: string; id: string }
  | { kind: "group"; grpId: string; id: string }
  | { kind: "postReply"; postId: string; id: string }
  | { kind: "chatReply"; chatMessageId: string; id: string }

/** What a saver needs: how to show words with an edit time, what was shown, and the request. */
interface Edit {
  show: (html: string, updatedAt?: string | null) => void
  before?: { html: string; updatedAt?: string }
  send: () => Promise<unknown>
}

/**
 * Saves a correction made in place, from a message list or a thread alike
 * (F-06, F-07): the new words show at once, "(edited)" with them; a save that
 * fails puts back the words and edit time they had and answers false, so the
 * box opens again holding what was typed (hooks/useEditInPlace). One write
 * per message at a time (lib/optimistic, keyed by its id). An edit that
 * leaves nothing is not sent, and answers true.
 *
 * The lists and threads each had their own save; a thread's waited for the
 * server, closed the box at once, and lost what was typed when it failed.
 */
export function useSaveEdit(): (target: EditTarget, html: string) => Promise<boolean> {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const post = usePost()
  const selfUuid = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid

  return useCallback(
    async (target: EditTarget, raw: string) => {
      const html = removeEmptyPTags(raw)
      if (!html) return true
      const s = store.getState()
      const request = <T,>(apiEndpoint: PostEndpointUrl, payload: T) =>
        post.makeRequest<T>({ apiEndpoint, payload, showToast: false, showErrorToast: true, description: "Saving your edit" })
      let edit: Edit
      switch (target.kind) {
        case "post": {
          const p = s.channel.channelPosts[target.channelId]?.find((x) => x.post_uuid === target.id)
          edit = {
            show: (text, updatedAt) => dispatch(updatePostByPostId({ channelId: target.channelId, postId: target.id, htmlText: text, updatedAt })),
            before: p && { html: p.post_text, updatedAt: p.post_updated_at },
            send: () => request(PostEndpointUrl.UpdateChannelPost, { post_id: target.id, post_text_html: html }),
          }
          break
        }
        case "dm": {
          const c = s.chat.chatMessages[target.chatId]?.find((x) => x.chat_uuid === target.id)
          edit = {
            show: (text, updatedAt) => {
              dispatch(updateChatByChatId({ chatId: target.chatId, messageId: target.id, htmlText: text, updatedAt }))
              if (selfUuid) dispatch(UpdateMessageTextInChatList({ grpId: getGroupingId(target.chatId, selfUuid), messageId: target.id, htmlText: text }))
            },
            before: c && { html: c.chat_body_text, updatedAt: c.chat_updated_at },
            send: () => request(PostEndpointUrl.UpdateChatMessage, { chat_id: target.id, text_html: html }),
          }
          break
        }
        case "group": {
          const c = s.groupChat.chatMessages[target.grpId]?.find((x) => x.chat_uuid === target.id)
          edit = {
            show: (text, updatedAt) => {
              dispatch(updateGroupChatByChatId({ grpId: target.grpId, messageId: target.id, htmlText: text, updatedAt }))
              dispatch(UpdateMessageTextInChatList({ grpId: target.grpId, messageId: target.id, htmlText: text }))
            },
            before: c && { html: c.chat_body_text, updatedAt: c.chat_updated_at },
            send: () => request(PostEndpointUrl.UpdateGroupChatMessage, { chat_id: target.id, text_html: html, grp_id: target.grpId }),
          }
          break
        }
        case "postReply": {
          const r = s.channelComment.postComments[target.postId]?.find((x) => x.comment_uuid === target.id)
          edit = {
            show: (text, updatedAt) => dispatch(updateChannelCommentByCommentUUID({ postId: target.postId, commentUUID: target.id, htmlText: text, updatedAt })),
            before: r && { html: r.comment_text, updatedAt: r.comment_updated_at },
            send: () => request(PostEndpointUrl.UpdatePostComment, { post_id: target.postId, comment_id: target.id, comment_text_html: html }),
          }
          break
        }
        case "chatReply": {
          const r = s.chatComments.chatComments[target.chatMessageId]?.find((x) => x.comment_uuid === target.id)
          edit = {
            show: (text, updatedAt) => dispatch(updateChatCommentByCommentId({ chatId: target.chatMessageId, commentId: target.id, htmlText: text, updatedAt })),
            before: r && { html: r.comment_text, updatedAt: r.comment_updated_at },
            send: () => request(PostEndpointUrl.UpdateChatComment, { chat_id: target.chatMessageId, comment_id: target.id, comment_text_html: html }),
          }
          break
        }
      }
      const { before } = edit
      const saved = await optimistic({
        key: `edit:${target.id}`,
        apply: () => edit.show(html),
        revert: () => {
          if (before) edit.show(before.html, before.updatedAt ?? null)
        },
        commit: async () => {
          const res = await edit.send()
          if (!res) throw new Error("not saved")
          return res
        },
      })
      return saved.ok
    },
    [dispatch, store, post, selfUuid],
  )
}
