"use client"

import React from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { normalizeChartSpec } from "@/lib/utils/chartSpec"
import AgentChart from "@/components/ai/AgentChart"

// ChartEmbedView renders the inline chart for a chartEmbed node. It reuses the
// same normalizeChartSpec + AgentChart pipeline as the AI chat bubble, so a
// chart looks identical whether it appears in the assistant panel or in a
// channel/DM message. The node's `spec` attribute is the raw JSON string; if it
// can't be normalized into a safe, bounded chart the node renders nothing
// (rather than a broken box), which also makes a stale/garbled spec harmless.
export const ChartEmbedView: React.FC<NodeViewProps> = ({ node }) => {
  const raw = String(node.attrs.spec || "")
  const chart = React.useMemo(() => normalizeChartSpec(raw), [raw])

  return (
    <NodeViewWrapper className="chart-embed" data-drag-handle={false}>
      <div contentEditable={false}>
        {chart ? <AgentChart chart={chart} /> : null}
      </div>
    </NodeViewWrapper>
  )
}

export default ChartEmbedView
