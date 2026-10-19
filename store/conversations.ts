import type { RootState } from "@/store/store"
import type { ConversationRef } from "@/lib/conversation/types"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"

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

const NO_POSTS: PostsRes[] = []
const NO_CHATS: ChatInfo[] = []

/** The rows held for a conversation, oldest first, as today's slices hold them; the same empty list while none are. */
export function storedRows(state: RootState, ref: ConversationRef): PostsRes[] | ChatInfo[] {
  switch (ref.kind) {
    case "channel":
      return state.channel.channelPosts[ref.id] ?? NO_POSTS
    case "dm":
      return state.chat.chatMessages[ref.other] ?? NO_CHATS
    case "group":
      return state.groupChat.chatMessages[ref.id] ?? NO_CHATS
  }
}
