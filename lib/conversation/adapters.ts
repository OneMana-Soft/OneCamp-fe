import { mapChatInfoToBaseMessage, mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { pageEdgeQuery } from "@/lib/chat/pageEdge"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ConversationRef, Cursor, Message } from "@/lib/conversation/types"
import type { ChatInfo, CreateChatPaginationResRaw } from "@/types/chat"
import type { CreatePostPaginationResRaw, PostsRes } from "@/types/post"

/**
 * How each kind of conversation is read (chat A1): a thin map onto today's
 * endpoints and rows, so the server's contract doesn't change. Every page is
 * asked for by an exact cursor beside its edge message (Cursor, lib/chat/
 * pageEdge); a page's rows come oldest first; a row reads as the one message
 * shape. A DM's pages are asked for by the other person, as its routes are.
 */
export interface ConversationAdapter<Row> {
  /** The newest page. */
  latestKey(ref: ConversationRef): string
  /** The page before a cursor. */
  olderKey(ref: ConversationRef, before: Cursor): string
  /** The page after a cursor. */
  newerKey(ref: ConversationRef, after: Cursor): string
  /** The page that starts at a message: a link to it. */
  aroundKey(ref: ConversationRef, message: string): string
  /** A page's rows, oldest first. */
  rowsOf(answer: unknown): Row[]
  /** A row's exact place. */
  cursorOf(row: Row): Cursor
  /** A row as the one message shape. */
  toMessage(row: Row): Message
}

/** Whole seconds stay in the path for a server from before the exact edge (lib/chat/pageEdge). */
const seconds = (at: string, round: (n: number) => number) => round(Date.parse(at) / 1000)
/** The DM's segment: the other person; a channel's or group's: its id. */
const segment = (ref: ConversationRef) => (ref.kind === "dm" ? ref.other : ref.id)

function adapter<Row>(urls: { latest: string; older: string; newer: string; around: string }, page: (answer: unknown) => Row[] | undefined, cursorOf: (row: Row) => Cursor, toMessage: (row: Row) => Message): ConversationAdapter<Row> {
  return {
    latestKey: (ref) => `${urls.latest}/${segment(ref)}`,
    olderKey: (ref, c) => `${urls.older}/${segment(ref)}/${seconds(c.at, Math.floor)}${pageEdgeQuery(c.at, c.id)}`,
    newerKey: (ref, c) => `${urls.newer}/${segment(ref)}/${seconds(c.at, Math.ceil)}${pageEdgeQuery(c.at, c.id)}`,
    aroundKey: (ref, message) => `${urls.around}/${segment(ref)}/${message}`,
    // The API answers newest first.
    rowsOf: (answer) => [...(page(answer) ?? [])].reverse(),
    cursorOf,
    toMessage,
  }
}

const postsOf = (answer: unknown) => (answer as CreatePostPaginationResRaw | undefined)?.data?.posts
const chatsOf = (answer: unknown) => (answer as CreateChatPaginationResRaw | undefined)?.data?.chats

export const channelAdapter: ConversationAdapter<PostsRes> = adapter(
  { latest: GetEndpointUrl.GetChannelLatestPost, older: GetEndpointUrl.GetOldPostBefore, newer: GetEndpointUrl.GetNewPostAfter, around: GetEndpointUrl.GetNewPostIncludingCurrentPost },
  postsOf,
  (p) => ({ at: p.post_created_at, id: p.post_uuid }),
  mapPostsResToBaseMessage,
)

export const dmAdapter: ConversationAdapter<ChatInfo> = adapter(
  { latest: GetEndpointUrl.GetChatLatestMessage, older: GetEndpointUrl.GetOldChatBefore, newer: GetEndpointUrl.GetNewChatAfter, around: GetEndpointUrl.GetNewChatIncludingCurrentChat },
  chatsOf,
  (c) => ({ at: c.chat_created_at, id: c.chat_uuid }),
  mapChatInfoToBaseMessage,
)

export const groupAdapter: ConversationAdapter<ChatInfo> = adapter(
  { latest: GetEndpointUrl.GetGroupChatLatestMessage, older: GetEndpointUrl.GetOldGroupChatBefore, newer: GetEndpointUrl.GetNewGroupChatAfter, around: GetEndpointUrl.GetNewGroupChatIncludingCurrentChat },
  chatsOf,
  (c) => ({ at: c.chat_created_at, id: c.chat_uuid }),
  mapChatInfoToBaseMessage,
)

/** A conversation's adapter. Pure. */
export function adapterOf(ref: ConversationRef): ConversationAdapter<PostsRes> | ConversationAdapter<ChatInfo> {
  return ref.kind === "channel" ? channelAdapter : ref.kind === "dm" ? dmAdapter : groupAdapter
}
