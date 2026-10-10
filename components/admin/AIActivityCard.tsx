"use client"

/**
 * AIActivityCard — the unified "what did the AI do" timeline for admins.
 *
 * Renders the merged feed from /admin/ai/activity: autonomous agent runs and
 * AI-attributable audit entries (web search, public-API/MCP tool calls, AI
 * config changes), newest-first. Read-only governance + debugging surface.
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Sparkles, Shield } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { initiatorLabel, UNATTENDED_INITIATORS, type AIActivityItem } from "@/services/aiActivityService"
import { ChainPair } from "@/components/admin/ChainPair"
import { relativeTime } from "@/lib/utils/relativeTime"

/**
 * A REFUSAL IS NOT A FAILURE, and this is the one place the difference has to be
 * legible. The product's central claim is that an agent is stopped when the
 * person behind it could not have done the thing; painting that the same red as a
 * crashed run teaches an admin to read the guarantee working as something broken,
 * and to stop looking at both.
 *
 * Refused gets the same brand treatment as an allowed call, because both are the
 * permission system answering. Only an actual error is destructive.
 */
function statusTone(status?: string): string {
  switch (status) {
    case "succeeded":
    case "allowed":
      return "text-success-ink"
    case "refused":
      return "text-primary"
    case "failed":
      return "text-danger-ink"
    case "running":
      return "text-warning-ink"
    default:
      return "text-muted-foreground"
  }
}

/** Never colour alone: the status word is the label, and refused says why. */
function statusLabel(status?: string): string {
  if (status === "refused") return "refused by permissions"
  return status || ""
}


/**
 * One line of the feed, exported so the presentation of a refusal can be tested
 * without mounting the whole card — the same shape SlackImportCard's JobRow uses.
 */
export const AIActivityRow: React.FC<{ item: AIActivityItem }> = ({ item: it }) => {
  const Icon = it.kind === "agent_run" ? Sparkles : Shield
  /**
   * What goes on the top line.
   *
   * The two kinds of row carry different things in `title`. An agent run
   * carries the agent's NAME, which is what a person calls it and belongs at
   * the top. An audit row carries the ACTION, which is a dotted identifier
   * like agent.drill.refused, and it was the boldest text on the line while
   * the sentence explaining what actually happened sat underneath in small
   * muted grey.
   *
   * That is the wrong way round for everyone who reads this feed. Members
   * cannot open the audit log at all, so this is the only account of it they
   * get, and a prospect running the drill met a machine identifier as the
   * headline of the thing they came to see.
   *
   * The action is not hidden: an auditor cross-referencing the log needs the
   * exact string, so it stays on the line as a badge beside the source. What
   * changes is which one is the sentence and which one is the reference.
   */
  const isAuditRow = it.kind !== "agent_run"
  const headline = (isAuditRow && it.summary) || it.title || "AI action"
  const detail = isAuditRow && it.summary ? "" : it.summary
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {/* On the AI and automation group's tile, as the admin menu marks it. */}
      <Tile hue={ADMIN_GROUP_HUE.ai} size="sm" className="mt-0.5">
        <Icon />
      </Tile>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{headline}</span>
          {it.status && (
            <span className={`shrink-0 text-2xs font-medium ${statusTone(it.status)}`}>{statusLabel(it.status)}</span>
          )}
          {it.source && (
            <Badge variant="outline" className="shrink-0 text-2xs font-normal text-muted-foreground">
              {it.source}
            </Badge>
          )}
        </div>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail}</p>}
        {/* The exact action, kept for anybody matching this against the log. */}
        {isAuditRow && it.summary && it.title && (
          <p className="mt-0.5 font-mono text-2xs text-muted-foreground/70">{it.title}</p>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground/70">
          {it.actor && <span>{it.actor}</span>}
          <span>·</span>
          <span>{relativeTime(it.at)}</span>
          {/* "Ran on your authority" and "ran while you were asleep" are the
              same actor and different facts. For the person whose agent it is,
              the second is the one they most need to see. */}
          {initiatorLabel(it.initiator) && (
            <>
              <span>·</span>
              <span className={UNATTENDED_INITIATORS.has(it.initiator ?? "") ? "text-warning-ink" : ""}>
                {initiatorLabel(it.initiator)}
              </span>
            </>
          )}
        </div>
        {/* Where this sits in the audit log, for the rows that came from it.
            The feed is the readable account and the log is the provable one;
            without this they were two stories about one event, and a member,
            who cannot open the log, had no way to check the claim at all. */}
        <ChainPair seq={it.seq} prevHash={it.prev_hash} entryHash={it.entry_hash} className="mt-1" />
      </div>
    </li>
  )
}

// A section of the AI tab like the others: its heading, one line, and a
// hairline list. It was a bordered card with an extra mt-6, so the gap above
// it was 56px where every other section's is 32.
const AIActivityCard = () => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: AIActivityItem[] }>(`${GetEndpointUrl.GetAIActivity}?limit=50`)
  const items = data?.data || []

  return (
    <SettingsSection
      title="AI activity"
      description="What the AI did across the workspace, newest first: agent runs, and actions taken with AI (search, tool calls from outside agents, changes to these settings)."
    >
      {isLoading ? (
        <div role="status" aria-label="Loading the AI activity" className="py-1">
          <SkeletonRows rows={4} />
        </div>
      ) : isError ? (
        // Before the empty case: on the governance record, "nothing happened"
        // is the one claim that must not be made by a failed request.
        <ErrorState subject="the AI activity" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No AI activity yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {items.map((it, i) => (
            <AIActivityRow key={i} item={it} />
          ))}
        </ul>
      )}
    </SettingsSection>
  )
}

export default AIActivityCard
