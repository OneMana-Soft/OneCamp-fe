import type { UnknownAction } from "@reduxjs/toolkit"
import type { RootState } from "@/store/store"
import type { ConversationRef } from "@/lib/conversation/types"
import type { LatestWindowAuthority } from "@/lib/utils/deletionTombstone"
import { isBlankDraft } from "@/lib/conversation/drafts"
import {
  clearChannelReplyTarget, createPostReactionPostId, deleteChannelPreviewFiles, mergeChannelPosts, removeChannelUploadedFiles, removePostReactionByPostId,
  updateChannelInputText, updateChannelPosts, updateChannelScrollToBottom, updatePostReactionId, updatePostReactionPostId, type FilePreview,
} from "@/store/slice/channelSlice"
import {
  clearChatReplyTarget, createChatReactionChatId, createOrUpdateChatBody, deleteChatPreviewFiles, mergeChats, removeChatReactionByChatId, removeChatUploadedFiles,
  updateChatReactionByChatId, updateChatReactionId, updateChats, updateChatScrollToBottom,
} from "@/store/slice/chatSlice"
import {
  clearGroupChatReplyTarget, createGroupChatReactionChatId, createOrUpdateGroupChatBody, deleteGroupChatPreviewFiles, mergeGroupChats, removeGroupChatReactionByChatId,
  removeGroupChatUploadedFiles, updateGroupChatReactionByChatId, updateGroupChatReactionId, updateGroupChats, updateGroupChatScrollToBottom,
} from "@/store/slice/groupChatSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * The conversations' store (chat A1 host, PROGRAM.md §3.6: frozen once A1
 * merges): what's held for each conversation, read by its ConversationRef
 * whichever slice holds it.
 *
 * Step 1 (A1): a reader over today's per-kind slices (channel, chat,
 * groupChat), which still hold the lists and drafts. CHAT-A1B makes this the
 * one keyed store (lists by keyOf, messages by id, an LRU over lists, drafts
 * kept across reloads) and the slices go. New readers of a conversation's
 * messages read them here (app/chatStacks.test.ts).
 */

/** The id today's slices keep a conversation's list under: a channel's or group's id, a DM's other person. Pure. */
export function listIdOf(ref: ConversationRef): string {
  return ref.kind === "dm" ? ref.other : ref.id
}

/**
 * The list held for a conversation, oldest first, or undefined while none is.
 * A list emptied by deletes is still held: it takes only new answers (chat
 * B27, lib/utils/recentlyLoaded holdLoaded).
 */
export function heldRows(state: RootState, ref: ConversationRef): PostsRes[] | ChatInfo[] | undefined {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return state.channel.channelPosts[id]
    case "dm":
      return state.chat.chatMessages[id]
    case "group":
      return state.groupChat.chatMessages[id]
  }
}

/** Holds these rows, oldest first, as the conversation's list. */
export function holdRows(ref: ConversationRef, rows: readonly unknown[]): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return updateChannelPosts({ channelId: id, posts: rows as PostsRes[] })
    case "dm":
      return updateChats({ chatId: id, chats: rows as ChatInfo[] })
    case "group":
      return updateGroupChats({ grpId: id, chats: rows as ChatInfo[] })
  }
}

/**
 * Brings the fresh latest window into the held list: within its time it adds,
 * edits and deletes, and it keeps older pages and sends in flight (the slices'
 * merge reducers, lib/utils/deletionTombstone reconcileLatestWindow).
 */
export function mergeLatest(ref: ConversationRef, rows: readonly unknown[], authority: LatestWindowAuthority): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return mergeChannelPosts({ channelId: id, posts: rows as PostsRes[], ...authority })
    case "dm":
      return mergeChats({ chatId: id, chats: rows as ChatInfo[], ...authority })
    case "group":
      return mergeGroupChats({ grpId: id, chats: rows as ChatInfo[], ...authority })
  }
}

/** Whether the list was asked to go to its end (after a send, Jump to latest). */
export function goesToEnd(state: RootState, ref: ConversationRef): boolean {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return !!state.channel.channelScrollToBottom[id]?.shouldScrollToBottom
    case "dm":
      return !!state.chat.chatScrollToBottom[id]?.shouldScrollToBottom
    case "group":
      return !!state.groupChat.chatScrollToBottom[id]?.shouldScrollToBottom
  }
}

/** Asks the list to go to its end, or, with false, says it went. */
export function goToEnd(ref: ConversationRef, go = true): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return updateChannelScrollToBottom({ channelId: id, scrollToBottom: go })
    case "dm":
      return updateChatScrollToBottom({ chatId: id, scrollToBottom: go })
    case "group":
      return updateGroupChatScrollToBottom({ grpId: id, scrollToBottom: go })
  }
}

/** A reaction on a held message: its emoji and its id, a temporary one until the server gives it one. */
interface HeldReaction {
  messageId: string
  reactionId: string
  emojiId: string
}

/** Puts a reaction on a held message. */
export function addReaction(ref: ConversationRef, r: HeldReaction & { addedBy: UserProfileDataInterface }): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return createPostReactionPostId({ channelId: id, postId: r.messageId, reactionId: r.reactionId, emojiId: r.emojiId, addedBy: r.addedBy })
    case "dm":
      return createChatReactionChatId({ chatId: id, ...r })
    case "group":
      return createGroupChatReactionChatId({ grpId: id, ...r })
  }
}

/** Gives a held reaction another emoji. */
export function changeReaction(ref: ConversationRef, r: HeldReaction): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return updatePostReactionPostId({ channelId: id, postId: r.messageId, reactionId: r.reactionId, emojiId: r.emojiId })
    case "dm":
      return updateChatReactionByChatId({ chatId: id, ...r })
    case "group":
      return updateGroupChatReactionByChatId({ grpId: id, ...r })
  }
}

/** Gives a reaction made here the id the server made for it. */
export function settleReaction(ref: ConversationRef, r: { messageId: string; oldReactionId: string; newReactionId: string }): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return updatePostReactionId({ channelId: id, postId: r.messageId, oldReactionId: r.oldReactionId, newReactionId: r.newReactionId })
    case "dm":
      return updateChatReactionId({ chatId: id, ...r })
    case "group":
      return updateGroupChatReactionId({ grpId: id, ...r })
  }
}

/** Takes a reaction off a held message. */
export function dropReaction(ref: ConversationRef, r: { messageId: string; reactionId: string }): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return removePostReactionByPostId({ channelId: id, postId: r.messageId, reactionId: r.reactionId })
    case "dm":
      return removeChatReactionByChatId({ chatId: id, ...r })
    case "group":
      return removeGroupChatReactionByChatId({ grpId: id, ...r })
  }
}

/** A conversation's message box as every kind reads it: its words, its files, the message it answers. */
export interface BoxDraft {
  html: string
  /** Uploads that finished: they go with the message. */
  files: AttachmentMediaReq[]
  /** Every file in the box, uploading or done, as it shows. */
  previews: FilePreview[]
  replyToUuid?: string
  replyToAuthorName?: string
  replyToText?: string
  /** Moves each time a message that wasn't sent is put back (the editor's contentRevision). */
  restoredUnsent?: number
}

const NO_DRAFT: BoxDraft = { html: "", files: [], previews: [] }
// One reading per slice entry, so a box redraws only when its own draft changes.
const boxes = new WeakMap<object, BoxDraft>()

type HeldBox = { filesUploaded?: AttachmentMediaReq[]; replyToUuid?: string; replyToAuthorName?: string; replyToText?: string; restoredUnsent?: number }

function boxOf(raw: HeldBox | undefined, html: string | undefined, previews: FilePreview[] | undefined): BoxDraft {
  if (!raw) return NO_DRAFT
  let box = boxes.get(raw)
  if (!box) {
    box = {
      html: html ?? "",
      files: raw.filesUploaded ?? NO_DRAFT.files,
      previews: previews ?? NO_DRAFT.previews,
      replyToUuid: raw.replyToUuid,
      replyToAuthorName: raw.replyToAuthorName,
      replyToText: raw.replyToText,
      restoredUnsent: raw.restoredUnsent,
    }
    boxes.set(raw, box)
  }
  return box
}

/** The conversation's message box: the same object until it changes, and one empty draft for every box with none. */
export function heldDraft(state: RootState, ref: ConversationRef): BoxDraft {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel": {
      const d = state.channel.channelInputState[id]
      return boxOf(d, d?.inputTextHTML, d?.filePreview)
    }
    case "dm": {
      const d = state.chat.chatInputState[id]
      return boxOf(d, d?.chatBody, d?.filesPreview)
    }
    case "group": {
      const d = state.groupChat.chatInputState[id]
      return boxOf(d, d?.chatBody, d?.filesPreview)
    }
  }
}

/**
 * Whether the conversation's box holds nothing to send: no words, picture,
 * file (uploading or done) or reply (lib/conversation/drafts isBlankDraft).
 */
export function boxIsBlank(state: RootState, ref: ConversationRef): boolean {
  const d = heldDraft(state, ref)
  return d.previews.length === 0 && isBlankDraft({ html: d.html, files: d.files, ...(d.replyToUuid ? { replyTo: { uuid: d.replyToUuid } } : {}) })
}

/** Puts these words in the conversation's message box. */
export function writeDraft(ref: ConversationRef, html: string): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return updateChannelInputText({ channelId: id, inputTextHTML: html })
    case "dm":
      return createOrUpdateChatBody({ chatUUID: id, body: html })
    case "group":
      return createOrUpdateGroupChatBody({ grpID: id, body: html })
  }
}

/** Takes the reply off the message box, keeping what's typed. */
export function clearDraftReply(ref: ConversationRef): UnknownAction {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return clearChannelReplyTarget({ channelId: id })
    case "dm":
      return clearChatReplyTarget({ chatUUID: id })
    case "group":
      return clearGroupChatReplyTarget({ grpId: id })
  }
}

/** Takes a file out of the message box: its preview and, once uploaded, the upload. */
export function dropDraftFile(ref: ConversationRef, key: string): UnknownAction[] {
  const id = listIdOf(ref)
  switch (ref.kind) {
    case "channel":
      return [deleteChannelPreviewFiles({ channelId: id, key }), removeChannelUploadedFiles({ channelId: id, key })]
    case "dm":
      return [deleteChatPreviewFiles({ chatUUID: id, key }), removeChatUploadedFiles({ chatUUID: id, key })]
    case "group":
      return [deleteGroupChatPreviewFiles({ grpId: id, key }), removeGroupChatUploadedFiles({ grpId: id, key })]
  }
}
