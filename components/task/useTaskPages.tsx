"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useDispatch, useSelector, useStore } from "react-redux"
import { useSWRConfig } from "swr"

import { useLayoutOnce } from "@/components/task/useLayoutOnce"
import { useFetch } from "@/hooks/useFetch"
import type { AxiosRequestConfig } from "axios"
import { hasPageAfter, pagesToCome } from "@/lib/http/pageCount"
import { clearTaskListVisibleInfo, createListForTaskInfo } from "@/store/slice/taskInfoSlice"
import type { RootState } from "@/store/store"
import type { TaskInfoInterface } from "@/types/task"

/** A task table's page. Growing one page instead stopped at the server's cap, 5,000. */
export const TASK_PAGE = 500

type Read<A> = { data?: A; isLoading: boolean; isError: unknown; mutate: () => Promise<unknown> }

const NO_TASKS: TaskInfoInterface[] = []
const firstPageIn = new WeakMap<object, { address: string; read: Read<unknown>; list: unknown }>()

/** The pages' tasks in order, each once. A `fresh` page gives its answer's; the rest keep the list's, with what reached it since. */
export function joinPages(rows: TaskInfoInterface[][], fresh: (page: number) => boolean, listed: readonly TaskInfoInterface[]) {
  const now = new Map(listed.map((t) => [t.task_uuid, t]))
  const seen = new Set<string>()
  const out: TaskInfoInterface[] = []
  for (let i = 0; i < rows.length && rows[i]; i++)
    for (const t of rows[i])
      if (!seen.has(t.task_uuid)) {
        seen.add(t.task_uuid)
        out.push(fresh(i) ? t : (now.get(t.task_uuid) ?? t))
      }
  return out
}

/** Mounted, SWR keeps a page fresh: useTaskUpdate's patches reach every page. */
function PageReader<A>({ address, index, onRead, requestConfig }: { address: string; index: number; onRead: (address: string, index: number, read: Read<A>) => void; requestConfig?: AxiosRequestConfig }) {
  const read = useFetch<A>(`${address}&pageIndex=${index}`, undefined, undefined, requestConfig)
  useEffect(() => onRead(address, index, read), [address, index, read, onRead])
  return null
}

/**
 * A task table's tasks into the shared list, a page at a time: one more per
 * "Show more" while the last pageCount has one after it. Another `address`
 * (path and query, with pageSize) starts again. `tasksOf` must be stable.
 * Once per `scope`, the shared list is kept if its first page left it and SWR still has
 * that answer, else emptied.
 */
/** requestConfig: how each page is asked (a project's, in the reader's zone: lib/tasks/readerZone). */
export function useTaskPages<A extends { pageCount?: number }>(scope: string, address: string, tasksOf: (answer: A) => TaskInfoInterface[] | undefined, requestConfig?: AxiosRequestConfig) {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const slot = useSelector((s: RootState) => s.TaskInfo.taskListVisibleInfo || NO_TASKS)
  const { cache } = useSWRConfig()
  const held = firstPageIn.get(store)
  const mine = held?.address === address && held.list === slot && cache.get(`${address}&pageIndex=0`)?.data === held.read.data
  const [state, setState] = useState({ address, wanted: 0, reads: (mine ? [held.read] : []) as (Read<A> | undefined)[] })
  let pages = state
  if (state.address !== address) setState((pages = { address, wanted: 0, reads: [] }))

  const onRead = useCallback(
    (at: string, index: number, read: Read<A>) =>
      setState((s) => {
        const prev = s.reads[index]
        if (s.address !== at || (prev && prev.data === read.data && prev.isLoading === read.isLoading && prev.isError === read.isError)) return s
        const reads = [...s.reads]
        // A read again keeps the last answer until its own comes.
        reads[index] = read.data === undefined && prev?.data !== undefined ? { ...read, data: prev.data } : read
        return { ...s, reads }
      }),
    [],
  )

  const took = useRef("")
  useLayoutOnce(scope, () => {
    took.current = scope
    if (!mine) dispatch(clearTaskListVisibleInfo())
  })
  // Once per changed answer; `built` holds the answers last put in.
  const built = useRef({ address, answers: state.reads.map((r) => r!.data!) })
  useEffect(() => {
    if (state.address !== address) return
    const answers: A[] = []
    for (let i = 0; i <= state.wanted && state.reads[i]?.data !== undefined; i++) answers.push(state.reads[i]!.data!)
    const was = built.current.address === address ? built.current.answers : []
    if (!answers.length || (answers.length === was.length && answers.every((a, i) => a === was[i]))) return
    built.current = { address, answers }
    const now = store.getState().TaskInfo.taskListVisibleInfo ?? []
    const tasksInfo = joinPages(answers.map((a) => tasksOf(a) ?? []), (i) => answers[i] !== was[i], now)
    if (answers.length === 1) firstPageIn.set(store, { address, read: state.reads[0]!, list: tasksInfo })
    dispatch(createListForTaskInfo({ tasksInfo }))
  }, [state, address, store, dispatch, tasksOf])

  const first = pages.reads[0]
  const last = pages.reads[pages.wanted]
  const pageCount = last?.data?.pageCount
  const lastIn = last?.data !== undefined
  // In once its first answer is, a render after it comes; a later change leaves it in.
  const inList = lastIn && built.current.address === address && built.current.answers[pages.wanted] !== undefined
  // A later page that couldn't be read: "Show more" asks again.
  const failed = pages.wanted > 0 && !lastIn && !!last?.isError

  const showMore = useCallback(() => {
    if (failed) return void last?.mutate()
    setState((s) => {
      const a = s.reads[s.wanted]?.data
      return a !== undefined && hasPageAfter(s.wanted, a.pageCount) ? { ...s, wanted: s.wanted + 1 } : s
    })
  }, [failed, last])

  return {
    tasks: took.current === scope || mine ? slot : NO_TASKS,
    /** Render under the table; they draw nothing. */
    readers: address ? Array.from({ length: pages.wanted + 1 }, (_, i) => <PageReader<A> key={i} address={address} index={i} onRead={onRead} requestConfig={requestConfig} />) : null,
    first,
    loading: !!address && (!first || first.isLoading),
    more: (lastIn && hasPageAfter(pages.wanted, pageCount)) || failed,
    /** The groups' counts are the list's own only when this is false. */
    toCome: pagesToCome({ wanted: pages.wanted, asked: pages.wanted, loading: !last || last.isLoading, inList, pageCount }),
    showMore,
  }
}
