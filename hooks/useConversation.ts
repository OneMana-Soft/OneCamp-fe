"use client"

/**
 * The conversation a surface shows: its messages, oldest first, whether they
 * could be read, and a way to ask again (chat programme, PROGRAM.md §4.2 #22).
 *
 * A1 step 1: read through the model, by its adapter (lib/conversation/
 * adapters) and the conversations' store (store/conversations): the list the
 * store holds for the conversation (seeded by its list component and kept live
 * by the realtime handlers) or, until it holds one, the latest page the list
 * asks for, on the same key so the two share one request; a group's page waits
 * for its people, as the group list does. It seeds nothing and pages nothing:
 * the list components still do, until CHAT-A1B moves them onto this hook.
 */

import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useFetch, useFetchOnlyOnce } from '@/hooks/useFetch'
import { GetEndpointUrl } from '@/services/endPoints'
import { adapterOf, type ConversationAdapter } from '@/lib/conversation/adapters'
import { storedRows } from '@/store/conversations'
import type { RootState } from '@/store/store'
import type { RawUserDMInterface } from '@/types/user'
import type { ConversationRef, ConversationState } from '@/lib/conversation/types'

export function useConversation(ref: ConversationRef): ConversationState {
  const people = useFetchOnlyOnce<RawUserDMInterface>(ref.kind === 'group' ? `${GetEndpointUrl.GetDmGroupParticipants}/${ref.id}` : '')
  // One adapter for every kind's rows: each reads its own.
  const adapter = adapterOf(ref) as ConversationAdapter<unknown>
  // A group's page waits for its people, as its list does.
  const latestKey = ref.kind === 'group' && !people.data?.data ? '' : adapter.latestKey(ref)
  const latest = useFetch<unknown>(latestKey)
  const stored = useSelector((state: RootState) => storedRows(state, ref))

  const failed = !!latest.isError || !!people.isError
  const waitingForPeople = ref.kind === 'group' && !people.data
  const retryLatest = latest.mutate
  const retryPeople = people.mutate
  return useMemo(() => {
    const rows: unknown[] = stored.length > 0 ? stored : adapter.rowsOf(latest.data)
    const answered = stored.length > 0 || latest.data !== undefined
    return {
      messages: rows.map((row) => adapter.toMessage(row)),
      status: answered ? 'ready' : failed ? 'error' : 'loading',
      retry: () => {
        void (waitingForPeople ? retryPeople() : retryLatest())
      },
    }
  }, [adapter, stored, latest.data, failed, waitingForPeople, retryLatest, retryPeople])
}
