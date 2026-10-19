"use client"

import * as React from "react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { useFetch } from "@/hooks/useFetch"
import { EmbedCard, EmbedGone } from "@/components/minimal-tiptap/components/embed-card"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { TableBundle, tableBundleKey } from "@/services/tableService"
import { TableGlyph } from "@/components/table/TableGlyph"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { tablePath } from "@/lib/tables/route"

// The grid (DataTableGrid, its cells, menus and virtual rows: about 38 KB
// gzip) is fetched with the first table a doc embeds, not with every doc: it
// came with the doc's blocks, so every doc open carried it (the doc route's
// weight, routeKbOverHome). This view is made for each embed the doc holds,
// however it came (its first content, an insert, a paste, another person's
// edit), so that is when it loads; until then the embed shows its rows loading.
const DataTableGrid = React.lazy(() => import("@/components/table/DataTableGrid").then((m) => ({ default: m.DataTableGrid })))

/** The embed's rows while they load: the table's own, or the grid's code. */
function RowsLoading() {
  return (
    <div aria-busy="true" className="space-y-2 px-3.5 pb-3.5 pt-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-6 rounded-md bg-press [animation:skeleton-breathe_1.8s_ease-in-out_400ms_infinite]" />
      ))}
    </div>
  )
}

// TableEmbedView renders a live, interactive view of a referenced table inside
// a doc. It fetches the table bundle by id and renders the grid; edits go
// straight to the table entity (the doc stores only the reference), so the same
// data shows everywhere the table is embedded or opened full-page.
export const TableEmbedView: React.FC<NodeViewProps> = ({ node, editor, deleteNode, selected }) => {
  const tableId = String(node.attrs.tableId || "")
  // A guest reading a shared doc has no session, and the link shares the doc,
  // not its tables: nothing is fetched for them (a 401 would sign the page out).
  const guest = useGuestReader()
  const { data, isLoading, isError, mutate } = useFetch<{ data: TableBundle }>(
    tableId && !guest ? tableBundleKey(tableId) : "",
    undefined,
    undefined,
    // The referenced table may have been deleted or be inaccessible; render a
    // friendly fallback below instead of firing the global error toast.
    OWN_ERRORS,
  )
  const bundle = data?.data

  // A 404/403 is DEFINITIVE: the table was deleted or the viewer lost access.
  // SWR keeps the last successful `data` on error, so we must NOT trust a stale
  // `bundle` here — key off the error status instead, otherwise a deleted table
  // keeps rendering its old grid. Other errors (network/5xx) are transient.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (isError as any)?.response?.status as number | undefined
  const gone = !isLoading && (status === 404 || status === 403)
  const transient = !isLoading && !!isError && !gone
  const showGrid = !isLoading && !gone && !!bundle?.table

  // Live-sync: refresh when another client changes a row on this table. Skip
  // once the table is gone so we don't keep polling a dead reference.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMqtt = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => mutate(), 300)
  }, [mutate])
  useMqttTopic({ topic: gone || guest ? "" : bundle?.mqtt_topic || "", onMessage: onMqtt })
  React.useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  // Every row of the table: the embed shows its first page of them.
  const rowCount = bundle?.row_count ?? bundle?.rows?.length ?? 0
  if (guest) {
    return (
      <NodeViewWrapper className="table-embed my-3" data-type="table-embed" contentEditable={false}>
        <EmbedCard kind="table" tile={<TableGlyph size="sm" icon={null} id={tableId} />} title="Table" bodyClassName="relative">
          <EmbedGone message="This table isn't shared through this link." />
        </EmbedCard>
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper className="table-embed my-3" data-type="table-embed" contentEditable={false}>
      <EmbedCard
        kind="table"
        selected={selected}
        tile={<TableGlyph size="sm" icon={gone ? null : bundle?.table?.icon} id={tableId} />}
        title={gone ? "Table unavailable" : bundle?.table?.name || (isLoading ? "Loading table…" : "Table")}
        meta={showGrid ? `${rowCount} ${rowCount === 1 ? "row" : "rows"}` : undefined}
        // Only offer "Open" when the table is reachable: a dead link would error in the new tab.
        openHref={tableId && showGrid ? tablePath(tableId) : undefined}
        bodyClassName="relative"
      >
        {isLoading ? (
          <RowsLoading />
        ) : gone || (!isError && !bundle?.table) ? (
          <EmbedGone
            message="This table was deleted or you lost access."
            onRemove={editor?.isEditable ? () => deleteNode() : undefined}
          />
        ) : transient && !bundle?.table ? (
          <EmbedGone message="Couldn't load this table right now." onRemove={() => mutate()} removeLabel="Retry" />
        ) : (
          <div className="max-h-[360px] overflow-auto border-t border-line [mask-image:linear-gradient(to_bottom,#000_calc(100%-24px),transparent)] pb-6">
            <React.Suspense fallback={<RowsLoading />}>
              <DataTableGrid
                tableId={tableId}
                fields={bundle?.fields || []}
                rows={bundle?.rows || []}
                canManage={!!bundle?.can_manage}
                onChange={mutate}
              />
            </React.Suspense>
          </div>
        )}
      </EmbedCard>
    </NodeViewWrapper>
  )
}
