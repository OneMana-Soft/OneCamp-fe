"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/helpers/cn"
import { AlertTriangle, Eye, Lock } from "@/lib/icons"
import { McpTool, McpToolRisk, mcpToolRisk } from "@/services/mcpService"

// Shared risk affordance for MCP tools. One place decides how each of the three
// enforced states looks and reads, so the agent tool picker and the MCP server
// lists never drift apart.
//
// These labels describe what OneCamp ENFORCES when an agent calls the tool
// (resolved host-side from the tool's shape and the server's hints, where a hint
// can only raise risk). They are not the external server's self-description —
// that is untrusted and never shown as truth.

const RISK_UI: Record<
  McpToolRisk,
  { label: string; hint: string; tone: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  auto: {
    label: "Auto-runs",
    hint: "Read-only: the agent runs this on its own and reads the result.",
    tone: "text-muted-foreground",
    Icon: Eye,
  },
  approval: {
    label: "Needs approval",
    hint: "Changes something: goes through approval unless you allow it explicitly.",
    tone: "text-warning",
    Icon: Lock,
  },
  destructive: {
    label: "Destructive",
    hint: "Irreversible change: always warned about, never run unattended.",
    tone: "text-destructive",
    Icon: AlertTriangle,
  },
}

interface McpToolRiskBadgeProps {
  tool: McpTool
  // compact renders icon-only (label kept for screen readers and on hover), for
  // dense chip lists. Default shows the label inline.
  compact?: boolean
  className?: string
}

// McpToolRiskBadge shows one tool's enforced risk. Never colour-only: every
// state has its own icon plus a text label (visually hidden when compact) and a
// title, so the meaning survives colour blindness and screen readers.
export function McpToolRiskBadge({ tool, compact, className }: McpToolRiskBadgeProps) {
  const risk = mcpToolRisk(tool)
  const { label, hint, tone, Icon } = RISK_UI[risk]
  const title = `${label} — ${hint}`

  if (compact) {
    return (
      <span title={title} className={cn("inline-flex items-center", tone, className)}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("gap-1 border-border/60 px-1.5 py-0 text-3xs font-normal", tone, className)}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  )
}

// McpToolRiskLegend explains the three icons and, crucially, whose judgement
// they are: OneCamp's enforcement, not the external server's claim about itself.
export function McpToolRiskLegend({ className }: { className?: string }) {
  const order: McpToolRisk[] = ["auto", "approval", "destructive"]
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground", className)}>
      {order.map((risk) => {
        const { label, hint, tone, Icon } = RISK_UI[risk]
        return (
          <span key={risk} className="inline-flex items-center gap-1" title={hint}>
            <Icon className={cn("h-3 w-3", tone)} aria-hidden="true" />
            {label}
          </span>
        )
      })}
      <span className="text-muted-foreground/80">
        OneCamp decides this from the tool itself — not from what the external server claims.
      </span>
    </p>
  )
}

export default McpToolRiskBadge
