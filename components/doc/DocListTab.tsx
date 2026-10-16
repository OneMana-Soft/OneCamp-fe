"use client"

// One tab of the docs home (docs programme B5): a list the server keeps
// (A3's GET /doc/list), its pages read by cursor, each the server's own count
// of what the person may open. It replaces the Private and Public copies,
// which each carried the N31 bugs: a failed search left a skeleton for good,
// answers arrived out of order, pages were appended twice, and a failed first
// page held the whole page on a skeleton.

import * as React from "react"

import { DocListResult, type DocsView } from "@/components/doc/docListResult"
import { usePagedList, type ListPage } from "@/components/doc/usePagedList"
import { listKey, type Envelope } from "@/services/docGraphService"
import type { DocTab } from "@/lib/utils/docTab"
import type { DocList, DocListItem, DocListSort, DocSpace } from "@/types/docGraph"

/** A page of a list: enough rows to fill a screen of cards. */
export const DOC_LIST_PAGE = 30

export interface DocListQuery {
  sort?: DocListSort
  owner?: string
  space?: DocSpace
}

// Module-level, so a page's rows are read once per answer.
const readList = (d: Envelope<DocList>): ListPage<DocListItem> => ({
  items: d?.data?.docs ?? [],
  count: d?.data?.count ?? 0,
  next: d?.data?.next_cursor || undefined,
})
const docId = (d: DocListItem) => d.doc_uuid

/** One page of a tab's list, as the docs home asks for it. Pure. */
export const tabPageKey = (tab: DocTab, q: DocListQuery, cursor?: string) =>
  listKey(tab, { sort: q.sort, owner: q.owner, space: q.space, cursor, limit: DOC_LIST_PAGE })

export function DocListTab({
  tab,
  query,
  view,
  selfId,
  onCount,
  onClearFilters,
}: {
  tab: DocTab
  query: DocListQuery
  view: DocsView
  /** Who is looking: their own docs' menus offer Rename and the trash. */
  selfId?: string
  /** The list's count, for the page's heading. */
  onCount?: (tab: DocTab, count: number | undefined) => void
  onClearFilters?: () => void
}) {
  const keyOf = React.useCallback((cursor?: string) => tabPageKey(tab, query, cursor), [tab, query])
  const list = usePagedList(keyOf, readList, docId)
  const filtered = !!(query.owner || query.space)

  React.useEffect(() => {
    onCount?.(tab, list.count)
  }, [onCount, tab, list.count])

  const canEdit = React.useCallback((d: DocListItem) => !!selfId && d.owner?.user_uuid === selfId, [selfId])

  return (
    <>
      {list.loaders}
      <DocListResult
        items={list.items}
        view={view}
        tab={tab}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.retry}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        moreFailed={list.moreFailed}
        onRetryMore={list.retryMore}
        withCreateCard={(tab === "recent" || tab === "mine") && !filtered}
        filtered={filtered}
        onClearFilters={onClearFilters}
        canEdit={canEdit}
      />
    </>
  )
}
