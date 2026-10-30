"use client"

import { useMemo, useRef } from "react"
import { useDispatch, useStore } from "react-redux"
import { useToast } from "@/hooks/use-toast"
import { useDeleteMessage } from "@/hooks/useDeleteMessage"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useSaveEdit, type EditTarget } from "@/hooks/useSaveEdit"
import { useStableCallback } from "@/hooks/useStableCallback"
import { REACTION_NOT_ADDED, REACTION_NOT_REMOVED } from "@/lib/chat/reactionNotAdded"
import { adapterOf, type ConversationAdapter } from "@/lib/conversation/adapters"
import type { ConversationRef } from "@/lib/conversation/types"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { addReaction, changeReaction, dropReaction, heldRows, settleReaction } from "@/store/conversations"
import type { RootState } from "@/store/store"
import type { CreateOrUpdateChatReaction, CreateOrUpdatePostReaction } from "@/types/reaction"
import type { UserProfileInterface } from "@/types/user"

/** What a conversation's rows do from a message. */
export interface RowActions {
  /** Adds the reader's reaction (reactionId ""), or gives one of theirs another emoji. */
  react: (messageId: string, emojiId: string, reactionId: string) => void
  /** Takes a reaction back. */
  unreact: (messageId: string, reactionId: string) => void
  /** A correction (hooks/useSaveEdit). */
  save: (messageId: string, html: string) => Promise<boolean>
  /** A delete, confirmed where it was chosen (hooks/useDeleteMessage). */
  remove: (messageId: string) => void
}

type Reaction = CreateOrUpdatePostReaction | CreateOrUpdateChatReaction

/** A message as the edit and delete hooks name it. Pure. */
function messageOf(ref: ConversationRef, id: string): Extract<EditTarget, { kind: "post" | "dm" | "group" }> {
  switch (ref.kind) {
    case "channel":
      return { kind: "post", channelId: ref.id, id }
    case "dm":
      return { kind: "dm", chatId: ref.other, id }
    case "group":
      return { kind: "group", grpId: ref.id, id }
  }
}

/** A kind's reaction endpoints, and how they name a message: a channel's post, a DM's or a group's message. Pure. */
function reactionApi(ref: ConversationRef) {
  return ref.kind === "channel"
    ? { set: PostEndpointUrl.CreateOrUpdatePostReaction, remove: PostEndpointUrl.RemovePostReaction, on: (id: string): Reaction => ({ post_id: id }) }
    : { set: PostEndpointUrl.CreateOrUpdateChatReaction, remove: PostEndpointUrl.RemoveChatReaction, on: (id: string): Reaction => ({ chat_id: id }) }
}

/**
 * What a conversation's rows do from a message, whichever kind (chat A1 step
 * 2b; each kind's list did it on its own). A reaction shows at once and goes
 * back when the server refuses it, or answers without its id, with a toast
 * saying so (QA F-14, design v3 chat C21); one taken back while it's still
 * being added is taken back on the server once it has its id. Corrections and
 * deletes show at once too. The actions stay the same for the life of the
 * conversation, so the rows they're handed stay memoised.
 */
export function useRowActions(ref: ConversationRef): RowActions {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { toast } = useToast()
  const post = usePost()
  const saveEdit = useSaveEdit()
  const deleteMessage = useDeleteMessage()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  // Taken back while still being added.
  const pendingRemovals = useRef(new Set<string>())

  // A message's reactions as the store holds them now.
  const reactionsOf = (messageId: string) => {
    const adapter: ConversationAdapter<unknown> = adapterOf(ref)
    const rows: readonly unknown[] = heldRows(store.getState(), ref) ?? []
    const row = rows.find((r) => adapter.cursorOf(r).id === messageId)
    return row === undefined ? undefined : adapter.toMessage(row).reactions
  }

  const unreact = useStableCallback((messageId: string, reactionId: string) => {
    if (reactionId.startsWith("temp-")) {
      pendingRemovals.current.add(reactionId)
      dispatch(dropReaction(ref, { messageId, reactionId }))
      return
    }
    // Kept, to put back if the server refuses.
    const was = reactionsOf(messageId)?.find((r) => r.uid === reactionId)
    dispatch(dropReaction(ref, { messageId, reactionId }))
    const api = reactionApi(ref)
    post.makeRequest<Reaction>({
      apiEndpoint: api.remove,
      payload: { ...api.on(messageId), reaction_dgraph_id: reactionId },
      showErrorToast: true,
      failureTitle: REACTION_NOT_REMOVED,
    }).catch(() => {
      if (was) dispatch(addReaction(ref, { messageId, reactionId, emojiId: was.reaction_emoji_id, addedBy: was.reaction_added_by }))
    })
  })

  const react = useStableCallback((messageId: string, emojiId: string, reactionId: string) => {
    if (!messageId) return
    const reactions = reactionsOf(messageId)
    const api = reactionApi(ref)
    const send = () => post.makeRequest<Reaction, Reaction>({
      apiEndpoint: api.set,
      payload: { ...api.on(messageId), reaction_emoji_id: emojiId, reaction_dgraph_id: reactionId },
      showErrorToast: true,
      failureTitle: REACTION_NOT_ADDED.title,
    })
    if (reactionId) {
      // Changed at once; the old emoji goes back if the server refuses.
      const was = reactions?.find((r) => r.uid === reactionId)?.reaction_emoji_id
      dispatch(changeReaction(ref, { messageId, reactionId, emojiId }))
      send().catch(() => {
        if (was) dispatch(changeReaction(ref, { messageId, reactionId, emojiId: was }))
      })
      return
    }
    // Once per person and emoji.
    if (!self || reactions?.some((r) => r.reaction_emoji_id === emojiId && r.reaction_added_by?.user_uuid === self.user_uuid)) return
    const tempId = `temp-${Date.now()}`
    dispatch(addReaction(ref, { messageId, reactionId: tempId, emojiId, addedBy: self }))
    send().then((res) => {
      const id = res?.reaction_dgraph_id
      if (!id) {
        toast(REACTION_NOT_ADDED)
        throw new Error("no reaction id")
      }
      dispatch(settleReaction(ref, { messageId, oldReactionId: tempId, newReactionId: id }))
      if (pendingRemovals.current.delete(tempId)) unreact(messageId, id)
    }).catch(() => {
      pendingRemovals.current.delete(tempId)
      dispatch(dropReaction(ref, { messageId, reactionId: tempId }))
    })
  })

  const save = useStableCallback((messageId: string, html: string) => saveEdit(messageOf(ref, messageId), html))
  const remove = useStableCallback((messageId: string) => {
    if (messageId) void deleteMessage(messageOf(ref, messageId))
  })

  return useMemo(() => ({ react, unreact, save, remove }), [react, unreact, save, remove])
}
