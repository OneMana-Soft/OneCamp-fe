"use client"

import * as React from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Loader2, Table as TableIcon, ExternalLink } from "@/lib/icons"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { DataTableGrid } from "@/components/table/DataTableGrid"
import { TableBundle } from "@/services/tableService"

// TableEmbedView renders a live, interactive view of a referenced table inside
// a doc. It fetches the table bundle by id and renders the grid; edits go
// straight to the table entity (the doc stores only the reference), so the same
// data shows everywhere the table is embedded or opened full-page.
export const TableEmbedView: React.FC<NodeViewProps> = ({ node, editor, deleteNode }) => {
  const tableId = String(node.attrs.tableId || "")
  const { data, isLoading, isError, mutate } = useFetch<{ data: TableBundle }>(
    tableId ? `${GetEndpointUrl.GetTable}/${tableId}` : "",
    undefined,
    undefined,
    // The referenced table may have been deleted or be inaccessible; render a
    // friendly fallback below instead of firing the global error toast.
    { suppressErrorToast: true } as never,
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
  useMqttTopic({ topic: gone ? "" : bundle?.mqtt_topic || "", onMessage: onMqtt })
  React.useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  return (
    <NodeViewWrapper
      className="table-embed my-3 rounded-xl border border-border/60 bg-background"
      data-type="table-embed"
      contentEditable={false}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-base">{(!gone && bundle?.table?.icon) || "📊"}</span>
          <span className="truncate text-sm font-medium">
            {gone
              ? "Table unavailable"
              : bundle?.table?.name || (isLoading ? "Loading table…" : "Table")}
          </span>
        </div>
        {/* Only offer "Open" when the table is actually reachable — a dead link
            would just error in the new tab. */}
        {tableId && showGrid && (
          <a
            href={`/app/tables/${tableId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Open full table"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="max-h-[420px] overflow-auto p-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : gone || (!isError && !bundle?.table) ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <TableIcon className="h-5 w-5" />
            <span>This table was deleted or you don&apos;t have access to it.</span>
            {editor?.isEditable && (
              <button
                type="button"
                onClick={() => deleteNode()}
                className="mt-1 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Remove from doc
              </button>
            )}
          </div>
        ) : transient && !bundle?.table ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <TableIcon className="h-5 w-5" />
            <span>Couldn&apos;t load this table right now.</span>
            <button
              type="button"
              onClick={() => mutate()}
              className="mt-1 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Retry
            </button>
          </div>
        ) : (
          <DataTableGrid
            tableId={tableId}
            fields={bundle?.fields || []}
            rows={bundle?.rows || []}
            canManage={!!bundle?.can_manage}
            onChange={mutate}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

export default TableEmbedView
