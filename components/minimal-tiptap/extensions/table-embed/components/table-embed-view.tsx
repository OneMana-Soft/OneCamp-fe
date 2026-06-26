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
export const TableEmbedView: React.FC<NodeViewProps> = ({ node }) => {
  const tableId = String(node.attrs.tableId || "")
  const { data, isLoading, mutate } = useFetch<{ data: TableBundle }>(
    tableId ? `${GetEndpointUrl.GetTable}/${tableId}` : "",
  )
  const bundle = data?.data

  // Live-sync: refresh when another client changes a row on this table.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMqtt = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => mutate(), 300)
  }, [mutate])
  useMqttTopic({ topic: bundle?.mqtt_topic || "", onMessage: onMqtt })
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
          <span className="text-base">{bundle?.table?.icon || "📊"}</span>
          <span className="truncate text-sm font-medium">
            {bundle?.table?.name || (isLoading ? "Loading table…" : "Table")}
          </span>
        </div>
        {tableId && (
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
        ) : !bundle?.table ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
            <TableIcon className="h-5 w-5" />
            This table is unavailable or you don&apos;t have access to it.
          </div>
        ) : (
          <DataTableGrid
            tableId={tableId}
            fields={bundle.fields || []}
            rows={bundle.rows || []}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

export default TableEmbedView
