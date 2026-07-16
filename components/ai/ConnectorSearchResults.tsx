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

import * as React from "react"
import { Loader2, Mail, Github, ExternalLink, Sparkles, Plug, Brain } from "@/lib/icons"
import { unifiedSearch, type UnifiedSearchGroup, type UnifiedSource } from "@/services/aiSearchService"

const SOURCE_ICON: Partial<Record<UnifiedSource, React.ComponentType<{ className?: string }>>> = {
  memory: Brain,
  gmail: Mail,
  github: Github,
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
    const t = setTimeout(async () => {
      try {
        const res = await unifiedSearch(q)
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
      } catch {
        if (!cancelled) setGroups([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  if (!query.trim() || !enabled) return null

  // Only show groups that have something to say (hits, or a connect nudge for a
  // disconnected connector — memory has no "connect" state).
  const visible = groups.filter((g) => g.hits.length > 0 || (g.source !== "memory" && !g.connected && !!g.note))
  if (!loading && visible.length === 0) return null

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        AI results
        {loading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-4">
        {visible.map((g) => {
          const Icon = SOURCE_ICON[g.source] || Plug
          const isMemory = g.source === "memory"
          return (
            <div key={g.source}>
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-foreground/70">
                <Icon className="h-3.5 w-3.5" />
                {g.label}
              </div>

              {!isMemory && !g.connected ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Plug className="h-3.5 w-3.5 shrink-0" />
                  {g.note || `Connect ${g.label} to search it here.`}
                </div>
              ) : (
                <div className="space-y-2">
                  {g.hits.map((h, i) =>
                    isMemory ? (
                      // Memory facts are informational, not navigable.
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3"
                      >
                        <div className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                          <Brain className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {memoryKindLabel(h.kind)}
                            </span>
                            {h.meta && <span className="truncate text-[11px] text-muted-foreground">{h.meta}</span>}
                          </div>
                          <p className="text-sm leading-relaxed text-foreground">{h.title}</p>
                        </div>
                      </div>
                    ) : (
                      <a
                        key={i}
                        href={h.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-3 rounded-xl border border-transparent bg-card p-3 transition-all duration-200 hover:border-border hover:bg-accent/40 hover:shadow-md"
                      >
                        <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-2 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                            {h.title}
                          </h3>
                          {h.meta && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{h.meta}</p>}
                          {h.snippet && (
                            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {h.snippet}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    ),
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ConnectorSearchResults
