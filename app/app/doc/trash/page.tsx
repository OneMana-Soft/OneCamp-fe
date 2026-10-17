"use client"

// The trash (docs programme B5, structure.md P0.6; A3's trash): the docs the
// person deleted, or could change, that were deleted lately, newest first. A
// page deleted with the pages inside it is one entry, and restoring it brings
// them all back; someone who may delete it for good can, after a
// confirmation. Each says when it goes for good on its own.

import * as React from "react"
import Link from "next/link"
import { Virtuoso } from "react-virtuoso"

import { RestoreRow } from "@/components/doc/RestoreRow"
import { DocRowsSkeleton } from "@/components/doc/docListResult"
import { PagedListFooter, usePagedList, type ListPage } from "@/components/doc/usePagedList"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotDocs } from "@/components/ui/graphics"
import { ChevronLeft } from "@/lib/icons"
import { DocGraphEndpoint, type Envelope } from "@/services/docGraphService"
import type { DocTrash, DocTrashItem } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

const TRASH_PAGE = 30

// The trash's pages are asked for with a size of their own, so a list showing
// it and the docs home's count ("?limit=1") are separate answers.
const pageKey = (cursor?: string) => `${DocGraphEndpoint.Trash}?limit=${TRASH_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
const readTrash = (d: Envelope<DocTrash>): ListPage<DocTrashItem> => ({ items: d?.data?.items ?? [], count: d?.data?.count ?? 0, next: d?.data?.next_cursor || undefined })
const idOf = (t: DocTrashItem) => t.doc_uuid

/** The line under the title: how many, and that each row says when it goes. Pure. */
function trashSummary(count: number | undefined): string {
  if (count === undefined) return " "
  if (count === 0) return "Nothing here"
  return count === 1 ? "1 doc. It goes for good on the date it shows." : `${count} docs. Each goes for good on the date it shows.`
}

export default function DocTrashPage() {
  const list = usePagedList(pageKey, readTrash, idOf)

  let body: React.ReactNode
  if (list.isLoading && list.items.length === 0) body = <DocRowsSkeleton rows={6} />
  else if (list.isError) body = <ErrorState subject="the trash" onRetry={list.retry} className="pt-10" />
  else if (list.items.length === 0)
    body = (
      <EmptyState
        illustration={<SpotDocs hue="sky" />}
        title="The trash is empty"
        description="A doc you delete waits here, with the pages inside it, until it goes for good."
        className="pt-10"
      />
    )
  else
    body = (
      <div className="min-h-0 w-full flex-1" data-doc-trash="">
        <Virtuoso
          style={{ height: "100%", width: "100%" }}
          data={list.items}
          computeItemKey={(_, t) => t.doc_uuid}
          endReached={() => {
            if (list.hasMore && !list.moreFailed) list.loadMore()
          }}
          components={{
            Header: () => <div className="h-3" />,
            Footer: () => <PagedListFooter what="of the trash" failed={list.moreFailed} loading={list.hasMore} onRetry={list.retryMore} />,
          }}
          itemContent={(_, t) => (
            <div className="mx-auto max-w-[1040px] px-4 sm:px-8">
              <RestoreRow
                id={t.doc_uuid}
                title={t.doc_title}
                icon={t.doc_icon}
                at={t.deleted_at}
                verb="Deleted"
                by={t.deleted_by}
                subpages={t.subpages}
                purgeAt={t.purge_at}
                canPurge={t.can_purge}
              />
            </div>
          )}
        />
      </div>
    )

  return (
    <div className="flex h-full min-h-0 flex-col" data-doc-trash-page="">
      {list.loaders}
      <div className="mx-auto w-full max-w-[1040px] shrink-0 px-4 pt-4 sm:px-8 sm:pt-8">
        <Link href={app_doc_path} className="inline-flex h-7 items-center gap-1 rounded-lg pr-2 text-ui-sm text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand max-sm:hidden">
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Docs
        </Link>
        <h1 className="mt-1 text-title-1 text-ink max-sm:hidden">Trash</h1>
        <p className="mt-0.5 text-ui text-ink-2" aria-live="polite">
          {trashSummary(list.count)}
        </p>
      </div>
      {body}
    </div>
  )
}
