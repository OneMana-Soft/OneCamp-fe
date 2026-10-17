"use client"

/**
 * ConnectorSearchResults — the cross-source layer of the global search page.
 *
 * Calls the unified AI search and renders the NON-workspace groups: distilled
 * Memory facts (decisions/commitments/questions) and the user's connected
 * external accounts (Gmail, GitHub). The page's own keyword search already
 * covers raw workspace content, so the "workspace" group is intentionally
 * omitted here to avoid duplication.
 *
 * Memory hits are informational (a fact + kind badge), connector hits open
 * their source in a new tab, and unconnected sources show a quiet connect
 * nudge. Renders nothing until there's a query and something to show, so it
 * never adds noise to a fresh or AI-disabled workspace.
 */

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import * as React from "react"
import { Mail, GitBranch, ArrowUpRight, Plug, Brain } from "@/lib/icons"
import { HubRow, HubSectionHeader } from "@/components/ui/hubRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import {
  unifiedSearch,
  isAbortedRequest,
  type UnifiedSearchGroup,
  type UnifiedSource,
} from "@/services/aiSearchService"
import { withAI } from "@/components/common/withFeature"

// A glyph per source in ink-3, never the vendor's logo: marks we do not own
// are not decoration (hub.md S12).
const SOURCE_ICON: Partial<Record<UnifiedSource, React.ComponentType<{ className?: string }>>> = {
  memory: Brain,
  gmail: Mail,
  github: GitBranch,
}

const GROUP_LABEL: Partial<Record<UnifiedSource, string>> = {
  memory: "From memory",
  gmail: "From Gmail",
  github: "From GitHub",
}

// Sources rendered here; the page already renders raw "workspace" results.
const EXTRA_SOURCES: UnifiedSource[] = ["memory", "gmail", "github"]

// memoryKindLabel renders a friendly badge label for a memory item's kind.
function memoryKindLabel(kind?: string): string {
  switch ((kind || "").toLowerCase()) {
    case "decision":
      return "Decision"
    case "commitment":
      return "Commitment"
    case "question":
      return "Open question"
    default:
      return "Fact"
  }
}

const ConnectorSearchResults: React.FC<{ query: string }> = ({ query }) => {
  const [loading, setLoading] = React.useState(false)
  const [groups, setGroups] = React.useState<UnifiedSearchGroup[]>([])
  const [enabled, setEnabled] = React.useState(true)

  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setGroups([])
      return
    }
    let cancelled = false
    setLoading(true)
    // Abandon a superseded search on the server too, not just its result: the
    // handler fans out across the workspace and connected accounts, so a
    // keystroke-per-request page would otherwise keep that work running.
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await unifiedSearch(q, controller.signal)
        if (cancelled) return
        setEnabled(res.enabled)
        // Normalize hits to an array up front: the backend may send `null` for
        // an unconnected/errored source (a Go nil slice), and the render path
        // below calls g.hits.length / g.hits.map. Guaranteeing an array here
        // keeps every downstream access safe regardless of the payload shape.
        setGroups(
          (res.groups || [])
            .filter((g) => EXTRA_SOURCES.includes(g.source))
            .map((g) => ({ ...g, hits: Array.isArray(g.hits) ? g.hits : [] })),
        )
      } catch (e) {
        // A search the user moved on from is not a failure to report.
        if (!cancelled && !isAbortedRequest(e)) setGroups([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
      controller.abort()
    }
  }, [query])

  if (!query.trim() || !enabled) return null

  // Only show groups that have something to say (hits, or a connect nudge for a
  // disconnected connector — memory has no "connect" state).
  const visible = groups.filter((g) => g.hits.length > 0 || (g.source !== "memory" && !g.connected && !!g.note))
  if (!loading && visible.length === 0) return null

  return (
    <div className="mt-6 space-y-5" data-connector-results="" aria-busy={loading || undefined}>
      {visible.map((g) => {
        const Icon = SOURCE_ICON[g.source] || Plug
        const isMemory = g.source === "memory"
        return (
          <section key={g.source} data-connector-group={g.source}>
            <HubSectionHeader
              title={
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-ink-3" />
                  {GROUP_LABEL[g.source] || g.label}
                </span>
              }
              count={g.hits.length || undefined}
            />
            {!isMemory && !g.connected ? (
              <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2.5 text-ui-sm text-ink-2">
                <Plug className="size-3.5 shrink-0 text-ink-3" />
                {g.note || `Connect ${g.label} to search it here.`}
              </p>
            ) : (
              <ul>
                {g.hits.map((h, i) =>
                  isMemory ? (
                    <HubRow
                      key={i}
                      as="li"
                      density="two-line"
                      lead={<Brain className="size-4 text-ink-3" />}
                      title={<span className="font-book">{h.title}</span>}
                      second={[memoryKindLabel(h.kind), h.meta].filter(Boolean).join(" · ")}
                    />
                  ) : (
                    <HubRow
                      key={i}
                      as="li"
                      opens
                      density="two-line"
                      lead={<IdentityMark variant="avatar" size={24} id={avatarSeed(h.meta || h.title)} label={h.meta || h.title} />}
                      title={
                        <a href={h.url || "#"} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand">
                          {h.title}
                        </a>
                      }
                      second={
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="truncate">{[h.meta, h.snippet].filter(Boolean).join(" · ")}</span>
                          <ArrowUpRight className="size-3 shrink-0" aria-label="opens in a new tab" />
                        </span>
                      }
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}


// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export default withAI(ConnectorSearchResults)