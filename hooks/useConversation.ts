"use client"

/**
 * A conversation's list, paged (chat programme, PROGRAM.md §4.2 #22; A1 step
 * 2b): the rows the store holds for it, oldest first, and the pages around
 * them, through its adapter (lib/conversation/adapters), whichever kind it is.
 * It is what each kind's list component did on its own (ChannelMessageList,
 * ChatMessageList and GroupChatMessageList, which it replaced), once:
 * - the latest page, or with a link (?postId=, ?messageId=) the page from the
 *   linked message (useLinkedPage shows it beside a list already held);
 * - older and newer pages by an exact cursor, with whether there are more;
 * - only a list the store doesn't hold is seeded, from a non-empty answer, each
 *   answer once (lib/swrMutate dataToSeed); a held list, even one emptied by
 *   deletes, merges the fresh latest window instead (chat B27);
 * - the latest window again after a long gap in the live feed
 *   (useMessageResync), and newer pages on focus and on coming back to the page;
 * - Jump to latest: leaves a link, else puts the latest page back, then the
 *   list follows its end;
 * - 'loading' while an answer is an effect away from the store and 'error'
 *   when the opening page (or a group's people) failed with nothing held,
 *   never the empty state.
 * A group's latest page waits for its people, as its list did.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'next/navigation'
import { useFetch, useFetchOnlyOnce } from '@/hooks/useFetch'
import { useLeaveLink, useLinkSearchParams, useLinkedPage } from '@/hooks/useLinkTarget'
import { useMessageResync } from '@/hooks/useMessageResync'
import { useMessageCatchUp } from '@/hooks/useMessageCatchUp'
import { useOlderPages } from '@/hooks/useOlderPages'
import { useStableCallback } from '@/hooks/useStableCallback'
import { dataToSeed } from '@/lib/swrMutate'
import { GetEndpointUrl } from '@/services/endPoints'
import { adapterOf, type ConversationAdapter } from '@/lib/conversation/adapters'
import { goToEnd, heldRows, holdRows, listIdOf, mergeLatest } from '@/store/conversations'
import type { RootState } from '@/store/store'
import type { RawUserDMInterface } from '@/types/user'
import { keyOf, type ConversationRef, type ConversationState, type Cursor } from '@/lib/conversation/types'

const NO_ROWS: never[] = []

/** How a list's links are named in the address: a channel's post, a DM's or group's message. */
export const linkParamOf = (ref: ConversationRef): 'postId' | 'messageId' => (ref.kind === 'channel' ? 'postId' : 'messageId')

export function useConversation<Row>(of: ConversationRef, link?: string): ConversationState<Row> {
  const key = keyOf(of)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one ref per conversation, by its key: a caller's new object for the same one leaves the effects alone
  const ref = useMemo(() => of, [key])
  const adapter = adapterOf(ref) as unknown as ConversationAdapter<Row>
  const idOf = useCallback((row: Row) => adapter.cursorOf(row).id, [adapter])
  const dispatch = useDispatch()
  const linkParam = linkParamOf(ref)
  const params = useLinkSearchParams(useSearchParams())
  const anchor = link || params?.get(linkParam) || undefined

  const people = useFetchOnlyOnce<RawUserDMInterface>(ref.kind === 'group' ? `${GetEndpointUrl.GetDmGroupParticipants}/${ref.id}` : '')
  const waitingForPeople = ref.kind === 'group' && !people.data?.data
  const latestKey = anchor || waitingForPeople ? '' : adapter.latestKey(ref)
  const latest = useFetch<unknown>(latestKey)
  const around = useFetch<unknown>(anchor ? adapter.aroundKey(ref, anchor) : '')
  // The linked page as the list shows it, one array per answer (useLinkedPage shows each once).
  const aroundRows = useMemo(() => (around.data === undefined ? undefined : adapter.rowsOf(around.data, 'around')), [adapter, around.data])

  const stored = useSelector((state: RootState) => heldRows(state, ref)) as Row[] | undefined
  // Held, even emptied by deletes: it takes only new answers (holdLoaded).
  const held = stored !== undefined
  const rows: Row[] = stored ?? NO_ROWS

  const [olderFrom, setOlderFrom] = useState<Cursor | null>(null)
  const [hasOlder, setHasOlder] = useState(true)
  const [newerFrom, setNewerFrom] = useState<Cursor | null>(null)
  const [hasNewer, setHasNewer] = useState(!!anchor)
  // Moved to another conversation without a remount: its paging starts afresh,
  // never asking from the last one's place.
  const [pagingFor, setPagingFor] = useState(key)
  if (pagingFor !== key) {
    setPagingFor(key)
    setOlderFrom(null)
    setHasOlder(true)
    setNewerFrom(null)
    setHasNewer(!!anchor)
  }
  const older = useFetch<unknown>(olderFrom ? adapter.olderKey(ref, olderFrom) : '')
  const newer = useFetch<unknown>(newerFrom ? adapter.newerKey(ref, newerFrom) : '')

  useEffect(() => {
    if (anchor) {
      if (!held && aroundRows?.length) dispatch(holdRows(ref, aroundRows))
      return
    }
    // Only a non-empty answer seeds the list: an empty one stored a fresh []
    // each time, a new value, which ran this again, and an empty conversation
    // hit React's update limit instead of drawing.
    if (!held) {
      const page = adapter.rowsOf(latest.data, 'latest')
      if (!page.length) return
      // A list not held has nothing to lose: seeded, and the answer noted.
      dataToSeed(latestKey, latest.data)
      dispatch(holdRows(ref, page))
      return
    }
    // A list held (a revisit, a notification's link) takes the fresh latest
    // window, so what came while away shows without a reload, keeping sends in
    // flight and older pages. Each answer once: merging the same cached answer
    // on every change put back what it held when fetched, so a live edit, a
    // reaction or a reply count snapped back, and a first reaction looped.
    const answer = dataToSeed(latestKey, latest.data)
    if (answer && adapter.hasPage(answer)) {
      dispatch(mergeLatest(ref, adapter.rowsOf(answer, 'latest'), { authoritativeThrough: latest.lastRequestStartedAt }))
    }
  }, [adapter, ref, anchor, held, stored, aroundRows, latest, latestKey, dispatch])

  // An older page in: before what is held, without what is already there.
  useEffect(() => {
    if (!olderFrom || !adapter.answered(older.data)) return
    setHasOlder(!!adapter.hasMoreOf(older.data))
    setOlderFrom(null)
    const page = adapter.rowsOf(older.data, 'older')
    if (!page.length) return
    const have = new Set(rows.map(idOf))
    dispatch(holdRows(ref, page.filter((r) => !have.has(idOf(r))).concat(rows)))
  }, [adapter, ref, olderFrom, older.data, rows, idOf, dispatch])

  // A newer page in: after what is held.
  useEffect(() => {
    if (!newerFrom || !adapter.answered(newer.data)) return
    setHasNewer(!!adapter.hasMoreOf(newer.data))
    setNewerFrom(null)
    const page = adapter.rowsOf(newer.data, 'newer')
    if (!page.length) return
    const have = new Set(rows.map(idOf))
    dispatch(holdRows(ref, rows.concat(page.filter((r) => !have.has(idOf(r))))))
  }, [adapter, ref, newerFrom, newer.data, rows, idOf, dispatch])

  const retryOlder = useOlderPages({ latestHasMore: adapter.hasMoreOf(latest.data), setHasMore: setHasOlder, asking: !!olderFrom, older })

  const askOlder = useStableCallback(() => {
    if (rows.length) setOlderFrom(adapter.cursorOf(rows[0]))
  })
  const askNewer = useStableCallback(() => {
    if (!rows.length) return
    setNewerFrom(adapter.cursorOf(rows[rows.length - 1]))
    setHasNewer(false)
  })

  const leaveLink = useLeaveLink(linkParam)
  const toLatest = useStableCallback(() => {
    // From a link the latest page isn't loaded: leave the link, and it is (FE-BUG-9).
    if (leaveLink()) return
    const page = adapter.rowsOf(latest.data, 'latest')
    const newest = page[page.length - 1]
    const last = rows[rows.length - 1]
    if (newest && (!last || idOf(last) !== idOf(newest))) dispatch(holdRows(ref, page))
    dispatch(goToEnd(ref))
  })

  // After a long gap in the live feed (an idle tab), the latest window is
  // reconciled without clearing what's on screen; not from a link, where the
  // reader is parked on an older message, nor in a group before its people
  // are in, as its latest page.
  const extract = useCallback((payload: unknown) => (adapter.hasPage(payload) ? adapter.rowsOf(payload, 'latest') : undefined), [adapter])
  const onMerge = useCallback((items: Row[], authority: { authoritativeThrough?: number }) => dispatch(mergeLatest(ref, items, authority)), [ref, dispatch])
  useMessageResync<Row>({ enabled: !!latestKey, latestUrl: latestKey, extract, onMerge })

  // A message sent between the first read and the live subscription's answer
  // was in neither: what came after the newest, or the latest page again when
  // nothing is held. Not from a link, nor in a group still waiting for its people.
  useMessageCatchUp(() => (rows.length ? askNewer() : void latest.mutate()), !!latestKey && !!latest.data)

  // Back on the page: what came meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') askNewer()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [askNewer])

  useLinkedPage(ref.kind === 'dm' ? 'chat' : ref.kind, listIdOf(ref), anchor, rows as never[], aroundRows as never[] | undefined, setHasNewer)

  const opening = anchor ? around : latest
  const openingRows = anchor ? aroundRows : adapter.rowsOf(latest.data, 'latest')
  // Answered but not yet in the store (an effect away) is loading, never the
  // empty state for a frame; so is a link's page on its way to a list not held.
  const peopleFailed = !!people.isError && !people.data
  const loading = (waitingForPeople && !peopleFailed) || !!latest.isLoading || (!held && (!!around.isLoading || !!openingRows?.length))
  const failed = rows.length === 0 && (peopleFailed || (!!opening.isError && !opening.data))
  const retryPeople = people.mutate
  const retryOpening = opening.mutate
  const retry = useCallback(() => void (peopleFailed ? retryPeople() : retryOpening()), [peopleFailed, retryPeople, retryOpening])

  return {
    rows,
    status: loading ? 'loading' : failed ? 'error' : 'ready',
    retry,
    anchor,
    older: { has: hasOlder, loading: !!older.isLoading, ask: askOlder, retry: retryOlder },
    newer: { has: hasNewer, loading: !!newer.isLoading, ask: askNewer },
    toLatest,
  }
}
