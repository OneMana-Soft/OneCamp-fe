import { mapChatInfoToBaseMessage, mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { pageEdgeQuery } from "@/lib/chat/pageEdge"
import { GetEndpointUrl } from "@/services/endPoints"
import { ChatGet } from "@/services/endpoints/chat"
import type { ConversationRef, Cursor, Message } from "@/lib/conversation/types"
import type { ChatInfo, CreateChatPaginationResRaw } from "@/types/chat"
import type { CreatePostPaginationResRaw, PostsRes } from "@/types/post"

/** A page of a conversation: its newest, the one before or after a cursor, or the one a link opens at. */
export type Page = "latest" | "older" | "newer" | "around"

/**
 * The order the server writes each page in, the same for every kind (backend
 * domain/Post and domain/Chat): the newest and an older page newest first
 * (orderdesc), a newer page and a link's page oldest first (orderasc).
 * tests/integration/page_edge_test.go pins it on the server.
 */
const NEWEST_FIRST: Record<Page, boolean> = { latest: true, older: true, newer: false, around: false }

/**
 * How each kind of conversation is read (chat A1): a thin map onto today's
 * endpoints and rows, so the server's contract doesn't change. Every page is
 * asked for by an exact cursor beside its edge message (Cursor, lib/chat/
 * pageEdge); a page's rows come oldest first, whichever order the server wrote
 * it in; a row reads as the one message shape. A DM's pages are asked for by
 * the other person, as its routes are.
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
  rowsOf(answer: unknown, page: Page): Row[]
  /** Whether the server holds more beyond a page; undefined before an answer. */
  hasMoreOf(answer: unknown): boolean | undefined
  /** Whether an answer came (the server's envelope), whatever page it holds. */
  answered(answer: unknown): boolean
  /** Whether an answer holds a page, an empty one included (the server may write none as null). */
  hasPage(answer: unknown): boolean
  /** A row's exact place. */
  cursorOf(row: Row): Cursor
  /** A row as the one message shape. */
  toMessage(row: Row): Message
  /** Where the conversation's files are fetched from: a file's url is this, then its id. */
  mediaUrl(ref: ConversationRef): string
}

/** Whole seconds stay in the path for a server from before the exact edge (lib/chat/pageEdge). */
const seconds = (at: string, round: (n: number) => number) => round(Date.parse(at) / 1000)
/** The DM's segment: the other person; a channel's or group's: its id. */
const segment = (ref: ConversationRef) => (ref.kind === "dm" ? ref.other : ref.id)

function adapter<Row>(urls: { latest: string; older: string; newer: string; around: string; media: string }, page: (answer: unknown) => Row[] | undefined, cursorOf: (row: Row) => Cursor, toMessage: (row: Row) => Message): ConversationAdapter<Row> {
  return {
    latestKey: (ref) => `${urls.latest}/${segment(ref)}`,
    olderKey: (ref, c) => `${urls.older}/${segment(ref)}/${seconds(c.at, Math.floor)}${pageEdgeQuery(c.at, c.id)}`,
    newerKey: (ref, c) => `${urls.newer}/${segment(ref)}/${seconds(c.at, Math.ceil)}${pageEdgeQuery(c.at, c.id)}`,
    aroundKey: (ref, message) => `${urls.around}/${segment(ref)}/${message}`,
    rowsOf: (answer, which) => {
      const rows = [...(page(answer) ?? [])]
      return NEWEST_FIRST[which] ? rows.reverse() : rows
    },
    hasMoreOf: (answer) => (answer as { data?: { has_more?: boolean } } | undefined)?.data?.has_more,
    answered: (answer) => !!(answer as { data?: unknown } | undefined)?.data,
    hasPage: (answer) => !!page(answer),
    cursorOf,
    toMessage,
    mediaUrl: (ref) => `${urls.media}/${segment(ref)}`,
  }
}

const postsOf = (answer: unknown) => (answer as CreatePostPaginationResRaw | undefined)?.data?.posts
const chatsOf = (answer: unknown) => (answer as CreateChatPaginationResRaw | undefined)?.data?.chats

export const channelAdapter: ConversationAdapter<PostsRes> = adapter(
  { latest: GetEndpointUrl.GetChannelLatestPost, older: ChatGet.GetOldPostBefore, newer: ChatGet.GetNewPostAfter, around: ChatGet.GetNewPostIncludingCurrentPost, media: GetEndpointUrl.GetChannelMedia },
  postsOf,
  (p) => ({ at: p.post_created_at, id: p.post_uuid }),
  mapPostsResToBaseMessage,
)

export const dmAdapter: ConversationAdapter<ChatInfo> = adapter(
  { latest: GetEndpointUrl.GetChatLatestMessage, older: ChatGet.GetOldChatBefore, newer: ChatGet.GetNewChatAfter, around: ChatGet.GetNewChatIncludingCurrentChat, media: GetEndpointUrl.GetChatMedia },
  chatsOf,
  (c) => ({ at: c.chat_created_at, id: c.chat_uuid }),
  mapChatInfoToBaseMessage,
)

export const groupAdapter: ConversationAdapter<ChatInfo> = adapter(
  { latest: GetEndpointUrl.GetGroupChatLatestMessage, older: ChatGet.GetOldGroupChatBefore, newer: ChatGet.GetNewGroupChatAfter, around: ChatGet.GetNewGroupChatIncludingCurrentChat, media: GetEndpointUrl.GetGroupChatMedia },
  chatsOf,
  (c) => ({ at: c.chat_created_at, id: c.chat_uuid }),
  mapChatInfoToBaseMessage,
)

/** A conversation's adapter. Pure. */
export function adapterOf(ref: ConversationRef): ConversationAdapter<PostsRes> | ConversationAdapter<ChatInfo> {
  return ref.kind === "channel" ? channelAdapter : ref.kind === "dm" ? dmAdapter : groupAdapter
}
