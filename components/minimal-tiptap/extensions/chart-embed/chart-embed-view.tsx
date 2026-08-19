"use client"

import React from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { normalizeChartSpec } from "@/lib/utils/chartSpec"

// ChartEmbedView renders the inline chart for a chartEmbed node. The node's
// `spec` attribute is the raw JSON string; the chart embed is kept as a data
// node in non-AI builds and renders nothing visually.
export const ChartEmbedView: React.FC<NodeViewProps> = ({ node }) => {
  const raw = String(node.attrs.spec || "")
  const chart = React.useMemo(() => normalizeChartSpec(raw), [raw])

  return (
    <NodeViewWrapper className="chart-embed" data-drag-handle={false}>
      <div contentEditable={false}>
        {chart ? (
          <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
            Chart embed
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}

export default ChartEmbedView
