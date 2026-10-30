"use client"

/**
 * A row's page (tables T2, rows as pages): a doc of the row's own under its
 * fields, as every row of a Notion database is a page. Anyone who may edit
 * the row writes in it, live with whoever else has it open (the docs'
 * session, which opens a row's page by its row); anyone who may open the row
 * reads it. It is in no docs list: it lives with its row.
 *
 * - The record reads it with the row (GET /tables/{id}/rows/{rowId}/page):
 *   its doc and saved body, which show at once, before the live copy syncs.
 * - A row with no page offers one to someone who may write in it: "Write a
 *   page" makes it (POST) and puts the cursor in it. Anyone else sees nothing.
 * - The editor is a chunk of its own (RowPageEditor), loaded only for a row
 *   that has a page or is being given one, never with the grid or the record.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import { FileText, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { rowPagePath, type RowPage as RowPageInfo } from "@/services/tableService"
import { ensureRowPage } from "@/services/tableCalls"

const RowPageEditor = dynamic(() => import("./RowPageEditor"), { loading: () => <PageLoading /> })

function PageLoading() {
  return <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Opening the row's page" />
}

export interface RowPageProps {
  tableId: string
  rowId: string
  /** The page the row says it has (row.page); the record's read says it too. */
  page?: string
}

export default function RowPage({ tableId, rowId, page }: RowPageProps) {
  const { toast } = useToast()
  const read = useFetch<{ data?: RowPageInfo }>(rowPagePath(tableId, rowId), undefined, undefined, OWN_ERRORS)
  const info = read.data?.data
  // The page this record just made: it opens with the cursor in it.
  const [made, setMade] = React.useState<{ row: string; doc: string } | null>(null)
  const [making, setMaking] = React.useState(false)
  const mine = made?.row === rowId ? made.doc : null
  const doc = mine ?? info?.doc_uuid ?? undefined

  // Someone else gave the row a page a moment ago (its live "page" message):
  // the record reads it again for the doc.
  const { mutate } = read
  React.useEffect(() => {
    if (page && info && !info.doc_uuid && !mine) void mutate()
  }, [page, info, mine, mutate])

  const start = React.useCallback(async () => {
    if (making) return
    setMaking(true)
    try {
      const got = await ensureRowPage(tableId, rowId)
      setMade({ row: rowId, doc: got.doc_uuid })
      void mutate()
    } catch {
      toast({ title: "Couldn't start the page", description: "Nothing was lost. Try again in a moment.", variant: "destructive" })
    } finally {
      setMaking(false)
    }
  }, [making, mutate, rowId, tableId, toast])

  if (read.isError && !info) {
    return (
      <section aria-label="Page" className="mt-6" data-row-page="">
        <div role="alert" className="flex flex-wrap items-center gap-2 text-meta text-danger-ink">
          Couldn&apos;t read this row&apos;s page.
          <Button size="sm" variant="ghost" onClick={() => void mutate()}>
            Try again
          </Button>
        </div>
      </section>
    )
  }
  if (!info) {
    return (
      <section aria-label="Page" className="mt-6" data-row-page="">
        <PageLoading />
      </section>
    )
  }
  if (doc) {
    return (
      <section aria-label="Page" className="mt-6" data-row-page={doc}>
        <RowPageEditor key={doc} docId={doc} body={mine ? "" : info.body ?? ""} level={info.level} autoFocus={!!mine} />
      </section>
    )
  }
  if (info.level !== "edit") return null
  return (
    <section aria-label="Page" className="mt-6" data-row-page="">
      <button
        type="button"
        onClick={() => void start()}
        disabled={making}
        aria-busy={making || undefined}
        data-row-page-start=""
        className="group/start -mx-3 flex min-h-11 w-[calc(100%+24px)] items-center gap-2 rounded-lg px-3 text-left text-ui-sm text-ink-3 transition-colors duration-[140ms] ease-out hover:bg-hover hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-progress"
      >
        {making ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
        <span>Write a page for this row</span>
        <span className="ml-auto text-meta text-ink-3 opacity-0 transition-opacity duration-[140ms] group-hover/start:opacity-100 group-focus-visible/start:opacity-100 max-sm:hidden [@media(hover:none)]:opacity-100">
          Notes, a brief, a checklist
        </span>
      </button>
    </section>
  )
}
