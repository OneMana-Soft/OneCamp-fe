"use client"

/**
 * The conversation a surface shows: its messages, oldest first, whether they
 * could be read, and a way to ask again (chat programme, PROGRAM.md §4.2 #22;
 * A1 builds it, with one keyed store, exact cursors, an anchor, threads and
 * paging).
 *
 * DAY 0. Today's reads, per kind: the list today's store holds for the
 * conversation (seeded by its list component and kept live by the realtime
 * handlers) or, until the store holds one, the latest page today's list asks
 * for, on the same key so the two share one request; a group's page waits for
 * its people, as the group list does. Rows read as today's rows do
 * (mapPostsResToBaseMessage, mapChatInfoToBaseMessage). It seeds nothing and
 * pages nothing: the list components still do, until A1 moves them onto this
 * hook. Nothing calls it yet, so nothing changes by its existing.
 */

import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useFetch, useFetchOnlyOnce } from '@/hooks/useFetch'
import { mapChatInfoToBaseMessage, mapPostsResToBaseMessage } from '@/components/message/baseMessageCard'
import { GetEndpointUrl } from '@/services/endPoints'
import type { RootState } from '@/store/store'
import type { ChatInfo, CreateChatPaginationResRaw } from '@/types/chat'
import type { CreatePostPaginationResRaw, PostsRes } from '@/types/post'
import type { RawUserDMInterface } from '@/types/user'
import type { ConversationRef, ConversationState, Message } from '@/lib/conversation/types'

const NO_POSTS: PostsRes[] = []
const NO_CHATS: ChatInfo[] = []

/** The latest page's key, as the kind's list asks for it ('' while a group's people load). */
function latestKey(ref: ConversationRef, groupKnown: boolean): string {
  switch (ref.kind) {
    case 'channel':
      return `${GetEndpointUrl.GetChannelLatestPost}/${ref.id}`
    case 'dm':
      return `${GetEndpointUrl.GetChatLatestMessage}/${ref.other}`
    case 'group':
      return groupKnown ? `${GetEndpointUrl.GetGroupChatLatestMessage}/${ref.id}` : ''
  }
}

/** The list today's store holds for the conversation, oldest first. */
function storedOf(state: RootState, ref: ConversationRef): PostsRes[] | ChatInfo[] {
  switch (ref.kind) {
    case 'channel':
      return state.channel.channelPosts[ref.id] ?? NO_POSTS
    case 'dm':
      return state.chat.chatMessages[ref.other] ?? NO_CHATS
    case 'group':
      return state.groupChat.chatMessages[ref.id] ?? NO_CHATS
  }
}

/** Rows as today's rows read them, oldest first. */
function messagesOf(kind: ConversationRef['kind'], rows: PostsRes[] | ChatInfo[]): Message[] {
  return kind === 'channel'
    ? (rows as PostsRes[]).map(mapPostsResToBaseMessage)
    : (rows as ChatInfo[]).map(mapChatInfoToBaseMessage)
}

/** The latest page's rows, newest first as the API answers, turned oldest first. */
function pageRows(answer: CreatePostPaginationResRaw | CreateChatPaginationResRaw | undefined): PostsRes[] | ChatInfo[] {
  const page = answer?.data
  if (!page) return NO_POSTS
  if ('posts' in page) return [...(page.posts ?? [])].reverse()
  return [...(page.chats ?? [])].reverse()
}

export function useConversation(ref: ConversationRef): ConversationState {
  const people = useFetchOnlyOnce<RawUserDMInterface>(ref.kind === 'group' ? `${GetEndpointUrl.GetDmGroupParticipants}/${ref.id}` : '')
  const latest = useFetch<CreatePostPaginationResRaw | CreateChatPaginationResRaw>(latestKey(ref, !!people.data?.data))
  const stored = useSelector((state: RootState) => storedOf(state, ref))

  const kind = ref.kind
  const failed = !!latest.isError || !!people.isError
  // A group's page waits for its people: until they answer, asking again asks for them.
  const waitingForPeople = kind === 'group' && !people.data
  const retryLatest = latest.mutate
  const retryPeople = people.mutate
  return useMemo(() => {
    const rows = stored.length > 0 ? stored : pageRows(latest.data)
    const answered = stored.length > 0 || latest.data !== undefined
    return {
      messages: messagesOf(kind, rows),
      status: answered ? 'ready' : failed ? 'error' : 'loading',
      retry: () => {
        void (waitingForPeople ? retryPeople() : retryLatest())
      },
    }
  }, [kind, stored, latest.data, failed, waitingForPeople, retryLatest, retryPeople])
}
