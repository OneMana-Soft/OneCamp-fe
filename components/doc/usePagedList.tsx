"use client"

import * as React from "react"

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { Loader2 } from "@/lib/icons"

/** One page of a list, as read from its answer: its rows, the whole list's count, the next page's cursor. */
export interface ListPage<T> {
  items: T[]
  count: number
  next?: string
}

interface PageState<T> {
  page: ListPage<T> | undefined
  isLoading: boolean
  isError: boolean
  retry: () => void
}

/** One page, subscribed to its own cached answer. Renders nothing. */
function PageLoader<T, D>({ url, index, read, onPage }: { url: string; index: number; read: (data: D) => ListPage<T>; onPage: (index: number, page: PageState<T>) => void }) {
  // The page says a failure itself (an error state, "Try again"), so the
  // read stays quiet (OWN_ERRORS).
  const { data, isLoading, isError, mutate } = useFetch<D>(url, undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const page = React.useMemo(() => (data === undefined ? undefined : read(data)), [data, read])
  React.useEffect(() => {
    onPage(index, { page, isLoading, isError: !!isError, retry: () => void mutate() })
  }, [page, isLoading, isError, mutate, index, onPage])
  return null
}

/** Pages as one list: each row the first time it appears, in page order. Pure. */
function joinPages<T>(pages: Array<T[] | undefined>, idOf: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const page of pages) {
    for (const row of page ?? []) {
      const id = idOf(row)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(row)
    }
  }
  return out
}

/**
 * A list read a page at a time by cursor (the doc lists, the trash, a
 * search), made from the pages' cached answers on every render. Each page
 * stays subscribed to its own answer, so a page asked for again (on focus,
 * after a write) replaces itself rather than being appended twice, and a
 * change made to a cached page (a rename, a delete: lib/docCache) reaches the
 * list (N31). The next page is asked for with the cursor the last one gave.
 *
 * keyOf(cursor) names a page's answer; null asks for nothing. Give the hook's
 * caller a React key that changes with what is listed (a scope, a sort), so a
 * new list starts from its first page.
 */
export function usePagedList<T, D>(keyOf: (cursor?: string) => string | null, read: (data: D) => ListPage<T>, idOf: (row: T) => string) {
  const [cursors, setCursors] = React.useState<Array<string | undefined>>([undefined])
  const [pages, setPages] = React.useState<Record<number, PageState<T>>>({})
  const onPage = React.useCallback((index: number, page: PageState<T>) => {
    setPages((prev) => {
      const was = prev[index]
      if (was && was.page === page.page && was.isLoading === page.isLoading && was.isError === page.isError) return prev
      return { ...prev, [index]: page }
    })
  }, [])

  const loaders = cursors.map((cursor, i) => {
    const url = keyOf(cursor)
    return url ? <PageLoader<T, D> key={`${i}:${url}`} url={url} index={i} read={read} onPage={onPage} /> : null
  })

  const ordered = cursors.map((_, i) => pages[i])
  const items = React.useMemo(() => joinPages(cursors.map((_, i) => pages[i]?.page?.items), idOf), [cursors, pages, idOf])
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const asked = keyOf(undefined) !== null
  const isLoading = asked && ordered.some((p) => !p || (p.isLoading && !p.page))
  const isError = !!first?.isError && !first.page
  const moreFailed = ordered.length > 1 && !!last?.isError && !last.page
  const next = last?.page?.next
  const hasMore = !!next

  const loadMore = React.useCallback(() => {
    if (!next) return
    setCursors((cs) => (cs.includes(next) ? cs : [...cs, next]))
  }, [next])

  return {
    loaders,
    items,
    /** The whole list's count, from its first page: exact (the server counts what the person may open). */
    count: first?.page?.count,
    isLoading,
    isError,
    retry: () => first?.retry(),
    hasMore,
    loadMore,
    moreFailed,
    retryMore: () => last?.retry(),
  }
}

/**
 * The foot of a list read a page at a time (the doc lists, a search, the
 * trash): "Couldn't load more docs." with Try again when the next page
 * failed, Loading… while one is on its way, and nothing at the end. The
 * failure is said here, so no toast says it too (SaysLoadFailure).
 */
export function PagedListFooter({ what, failed, loading, onRetry }: { what: string; failed: boolean; loading: boolean; onRetry: () => void }) {
  return (
    <div className="flex w-full justify-center py-4">
      {failed ? (
        <span role="alert" className="flex items-center gap-2 text-ui-sm text-ink-3">
          <SaysLoadFailure />
          Couldn&apos;t load more {what}.
          <button type="button" onClick={onRetry} className="font-medium text-ink-2 underline-offset-2 hover:underline">
            Try again
          </button>
        </span>
      ) : loading ? (
        <span role="status" className="flex items-center gap-2 text-ui-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </span>
      ) : null}
    </div>
  )
}
