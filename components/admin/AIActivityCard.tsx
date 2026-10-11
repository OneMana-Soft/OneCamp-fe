"use client"

/**
 * AIActivityCard — the unified "what did the AI do" timeline for admins.
 *
 * Renders the merged feed from /admin/ai/activity: autonomous agent runs and
 * AI-attributable audit entries (web search, public-API/MCP tool calls, AI
 * config changes), newest-first. Read-only governance + debugging surface.
 */

import * as React from "react"
import { SettingsCard, SettingsSection } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { SpotDocs } from "@/components/ui/graphics/spots"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { AlertCircle, Cpu, ShieldAlert } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
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
 * Design v3 (admin §A11, §A23): the refusal carries a danger shield before its
 * sentence, the mark the audit log gives the rows that matter most, and its
 * status word stays in the quiet ink; only an actual error has a danger word.
 * The accent it used to borrow belongs to the one action a view asks for
 * (§1.5).
 */
function statusTone(status?: string): string {
  switch (status) {
    case "succeeded":
    case "allowed":
      return "text-success-ink"
    case "refused":
      return "text-muted-foreground"
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

/** The model a row ran on, when the server says (not every row has one). */
type WithModel = AIActivityItem & { model?: string }

/**
 * A neutral chip (admin §1.5): a category or a model is never a hue, so it is
 * the pressed surface with the ink-2 word and, where it has one, a 14px ink-3
 * glyph.
 */
export const AINeutralChip: React.FC<{ icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: React.ReactNode; mono?: boolean; title?: string }> = ({
  icon: Icon,
  children,
  mono,
  title,
}) => (
  <span data-neutral-chip="" title={title} className={`ai-chip ${mono ? "font-mono" : ""}`}>
    {Icon ? <Icon className="size-3.5 text-ink-3" aria-hidden={true} /> : null}
    <span className="truncate">{children}</span>
  </span>
)

/**
 * One line of the feed, exported so the presentation of a refusal can be tested
 * without mounting the whole card — the same shape SlackImportCard's JobRow uses.
 *
 * The audit log's row anatomy (admin §A11): the time in its own column, the
 * actor as a 22px square (every row here is the AI's doing, so it is the agent
 * square, never a person's circle), the sentence, and the category and model as
 * neutral chips on the right. It used to sit on a tinted tile in the AI group's
 * hue, a category dressed as identity.
 */
export const AIActivityRow: React.FC<{ item: AIActivityItem }> = ({ item: it }) => {
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
   * exact string, so it stays on the line in mono under the sentence.
   */
  const isAuditRow = it.kind !== "agent_run"
  const headline = (isAuditRow && it.summary) || it.title || "AI action"
  const detail = isAuditRow && it.summary ? "" : it.summary
  const refused = it.status === "refused"
  const failed = it.status === "failed"
  const model = (it as WithModel).model
  const initiator = initiatorLabel(it.initiator)
  return (
    <li data-ai-row="" data-refused={refused || undefined} className="ai-row">
      <time dateTime={it.at} className="ai-row-time text-2xs tabular-nums text-ink-3">
        {relativeTime(it.at)}
      </time>
      <span className="ai-row-actor" aria-hidden="true">
        <AgentAvatar />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {refused && <ShieldAlert data-refusal-glyph="" className="size-3.5 shrink-0 text-danger-ink" aria-hidden="true" />}
          {failed && <AlertCircle className="size-3.5 shrink-0 text-danger-ink" aria-hidden="true" />}
          <span data-row-summary="" className="min-w-0 flex-1 truncate text-sm font-book text-foreground">
            {headline}
          </span>
          {it.status && <span className={`shrink-0 text-xs font-medium ${statusTone(it.status)}`}>{statusLabel(it.status)}</span>}
          <span className="ai-row-chips">
            {it.source && <AINeutralChip>{it.source}</AINeutralChip>}
            {model && (
              <AINeutralChip icon={Cpu} title={`Ran on ${model}`}>
                {model}
              </AINeutralChip>
            )}
          </span>
        </div>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail}</p>}
        {/* The exact action, kept for anybody matching this against the log. */}
        {isAuditRow && it.summary && it.title && <p className="mt-0.5 font-mono text-2xs text-ink-3">{it.title}</p>}
        {(it.actor || initiator) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {it.actor && <span>{it.actor}</span>}
            {/* "Ran on your authority" and "ran while you were asleep" are the
                same actor and different facts. For the person whose agent it is,
                the second is the one they most need to see. */}
            {it.actor && initiator && <span aria-hidden="true">·</span>}
            {initiator && (
              <span className={UNATTENDED_INITIATORS.has(it.initiator ?? "") ? "text-warning-ink" : ""}>{initiator}</span>
            )}
          </div>
        )}
        {/* Where this sits in the audit log, for the rows that came from it.
            The feed is the readable account and the log is the provable one;
            without this they were two stories about one event, and a member,
            who cannot open the log, had no way to check the claim at all. */}
        <ChainPair seq={it.seq} prevHash={it.prev_hash} entryHash={it.entry_hash} className="mt-1" />
      </div>
    </li>
  )
}

// A section of the AI tab like the others: its heading, one line, and the
// settings card (r12, e1) holding the rows between inset hairlines. It was a
// 1px grey box of rows on tinted tiles.
const AIActivityCard = () => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: AIActivityItem[] }>(`${GetEndpointUrl.GetAIActivity}?limit=50`)
  const items = data?.data || []

  return (
    <SettingsSection
      title="AI activity"
      description="What the AI did across the workspace, newest first: agent runs, and actions taken with AI (search, tool calls from outside agents, changes to these settings)."
    >
      {isLoading ? (
        <SectionListSkeleton label="Loading the AI activity" rows={4} lines={3} leading="tile-sm" />
      ) : isError ? (
        // Before the empty case: on the governance record, "nothing happened"
        // is the one claim that must not be made by a failed request.
        <ErrorState
          compact
          subject="the AI activity"
          detail={apiErrorMessage(isError, "Try again in a moment.")}
          onRetry={() => void mutate()}
        />
      ) : items.length === 0 ? (
        // The empty card (admin §1.7): 200px, a 64px spot, one line.
        <SettingsCard>
          <EmptyState
            illustration={<SpotDocs size={64} hue={ADMIN_GROUP_HUE.ai} />}
            title="No AI activity yet"
            description="Agent runs, and actions taken with AI, show up here as they happen."
            className="min-h-[200px] py-6"
          />
        </SettingsCard>
      ) : (
        <SettingsCard>
          <ul className="ai-rows">
            {items.map((it, i) => (
              <AIActivityRow key={i} item={it} />
            ))}
          </ul>
        </SettingsCard>
      )}
    </SettingsSection>
  )
}

export default AIActivityCard
