"use client"

// The docs home's search (docs programme B5, structure.md P0.6): the words in
// docs' bodies, not only their titles (it searched titles with a regexp),
// best first, each with the passages it was found in. Every answer is its
// search's own cache entry, so a slow answer to an earlier search never
// replaces a later one, and a failure says so with Try again instead of
// leaving a skeleton for good (N31).

import * as React from "react"
import { Virtuoso } from "react-virtuoso"

import { DocRow } from "@/components/doc/docRows"
import { DocRowsSkeleton } from "@/components/doc/docListResult"
import { usePagedList, type ListPage } from "@/components/doc/usePagedList"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotSearch } from "@/components/ui/graphics"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { Loader2 } from "@/lib/icons"
import { searchKey } from "@/services/docHomeService"
import type { Envelope } from "@/services/docGraphService"
import type { DocSearchItem, DocSearchPage } from "@/types/docHome"

const SEARCH_PAGE = 20

const readSearch = (d: Envelope<DocSearchPage>): ListPage<DocSearchItem> => ({
  items: d?.data?.docs ?? [],
  count: d?.data?.count ?? 0,
  next: d?.data?.next_cursor || undefined,
})
const docId = (d: DocSearchItem) => d.doc_uuid

/** "12 docs", "1 doc", and "the best 200" when more matched than were searched. Pure. */
export function searchCountLabel(count: number | undefined, capped: boolean): string {
  if (count === undefined) return ""
  const n = `${count} ${count === 1 ? "doc" : "docs"}`
  return capped ? `${n}, from the 200 that match best` : n
}

export function DocSearchResults({
  q,
  owner,
  selfId,
  onClear,
  onCount,
}: {
  q: string
  owner?: string
  selfId?: string
  onClear: () => void
  /** The answer's count, for the page's heading. */
  onCount?: (label: string) => void
}) {
  const keyOf = React.useCallback((cursor?: string) => searchKey(q, { owner, cursor, limit: SEARCH_PAGE }), [q, owner])
  const list = usePagedList(keyOf, readSearch, docId)
  // Whether more matched than were searched is the first page's to say: the
  // same cached answer its page reads, so no request of its own.
  const firstPage = useFetch<Envelope<DocSearchPage>>(keyOf(undefined) ?? "", undefined, { revalidateOnFocus: false }, OWN_ERRORS).data
  const capped = !!firstPage?.data?.capped

  React.useEffect(() => {
    onCount?.(firstPage ? searchCountLabel(list.count, capped) : "")
  }, [onCount, firstPage, list.count, capped])

  if (list.isLoading && list.items.length === 0) {
    return (
      <>
        {list.loaders}
        <DocRowsSkeleton rows={5} />
      </>
    )
  }
  if (list.isError) {
    return (
      <>
        {list.loaders}
        <ErrorState subject="your search" onRetry={list.retry} className="pt-10" />
      </>
    )
  }
  if (list.items.length === 0) {
    return (
      <>
        {list.loaders}
        <EmptyState
          illustration={<SpotSearch />}
          title={`No docs match “${q.trim()}”`}
          description="Search finds words in a doc's title and in its body. Check the spelling, or try fewer words."
          className="pt-10"
          action={
            <Button variant="secondary" size="sm" onClick={onClear}>
              Clear search
            </Button>
          }
        />
      </>
    )
  }

  return (
    <div className="min-h-0 w-full flex-1" data-doc-search-results="">
      {list.loaders}
      <Virtuoso
        style={{ height: "100%", width: "100%" }}
        data={list.items}
        computeItemKey={(_, d) => d.doc_uuid}
        endReached={() => {
          if (list.hasMore && !list.moreFailed) list.loadMore()
        }}
        components={{
          Header: () => <div className="h-3 sm:h-4" />,
          Footer: () => (
            <div className="flex w-full justify-center py-4">
              {list.moreFailed ? (
                <span role="alert" className="flex items-center gap-2 text-ui-sm text-ink-3">
                  Couldn&apos;t load more results.
                  <button type="button" onClick={list.retryMore} className="font-medium text-ink-2 underline-offset-2 hover:underline">
                    Try again
                  </button>
                </span>
              ) : list.hasMore ? (
                <span role="status" className="flex items-center gap-2 text-ui-sm text-ink-3">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading…
                </span>
              ) : null}
            </div>
          ),
        }}
        itemContent={(_, d) => (
          <div className="mx-auto max-w-[1040px] px-4 sm:px-8">
            <DocRow doc={d} passages={d.highlights} canEdit={!!selfId && d.owner?.user_uuid === selfId} />
          </div>
        )}
      />
    </div>
  )
}
