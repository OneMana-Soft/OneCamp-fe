"use client"

/**
 * BriefingCard — "Your briefing" on the home screen.
 *
 * The pull arm of the memory layer: a single, calm card that answers
 * "what do I own / need to act on?" and "what changed that I should know?"
 * It combines the user's own open items (commitments/questions) with recent
 * workspace highlights. Self-hides when AI/memory is off or there's nothing
 * to show, so it never adds noise to the dashboard.
 */

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { getBriefing, BriefingResult, MemoryItem, BriefingHighlight, BriefingDayItem } from "@/services/memoryService"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { resolveMemoryBacklink } from "@/lib/utils/memoryBacklink"
import {
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Zap,
  Clock,
  ArrowUpRight,
  FileText,
  Hash,
  MessageSquare,
  CircleCheck,
  Calendar,
  Github,
  Mail,
} from "@/lib/icons"

interface SelfProfile {
  data?: { user_uuid?: string }
}

// Per-content-type icon for a highlight, so a message, post, doc, and task
// are visually distinguishable (previously everything showed a doc icon).
const HIGHLIGHT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  post: Hash,
  chat: MessageSquare,
  comment: MessageSquare,
  doc: FileText,
  task: CircleCheck,
  memory: Sparkles,
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  decision: Zap,
  commitment: CheckCircle2,
  question: HelpCircle,
}
const KIND_TINT: Record<string, string> = {
  decision: "text-violet-600 dark:text-violet-400",
  commitment: "text-blue-600 dark:text-blue-400",
  question: "text-amber-600 dark:text-amber-400",
}

// Per-source icon + tint for the cross-connector "Your day" agenda.
const DAY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  github: Github,
  gmail: Mail,
}
const DAY_TINT: Record<string, string> = {
  calendar: "text-blue-600 dark:text-blue-400",
  github: "text-foreground/70",
  gmail: "text-red-500 dark:text-red-400",
}

function isOverdue(due?: string): boolean {
  if (!due) return false
  return due < new Date().toISOString().slice(0, 10)
}

export default function BriefingCard() {
  const router = useRouter()
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const { data: selfProfile } = useFetchOnlyOnce<SelfProfile>(GetEndpointUrl.SelfProfile)
  const currentUserId = selfProfile?.data?.user_uuid
  const [data, setData] = useState<BriefingResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getBriefing()
      .then((res) => {
        if (alive) setData(res)
      })
      .catch(() => {
        if (alive) setData({ enabled: false, open_items: [], highlights: [] })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const channelName = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of channels || []) map.set(c.ch_uuid, c.ch_name)
    return map
  }, [channels])

  // Hide entirely until we know there's something worth showing — no
  // skeleton flash on the dashboard for a non-critical card.
  if (loading) return null
  if (!data || !data.enabled) return null
  const dayItems = data.day_items || []
  const hasOpenItems = data.open_items.length > 0
  const hasHighlights = data.highlights.length > 0
  const bothColumns = hasOpenItems && hasHighlights
  if (!hasOpenItems && !hasHighlights && dayItems.length === 0) return null

  const openHref = (it: MemoryItem): string => {
    // Route to the item's scope using the shared resolver. Channel/project/
    // group always resolve; a 1:1 DM resolves only when we know the current
    // user. Fall back to the memory surface when there's no jump target.
    const r = resolveMemoryBacklink(it, { currentUserId })
    return r?.href || "/app/ai/memory"
  }

  // searchHref builds a global-search deep link as the graceful last resort
  // for an unresolvable highlight. The search page reads the `query` param
  // (NOT `q`), so an empty/wrong param lands on a blank "Global Search" — we
  // only use this when there's a non-empty snippet to search for.
  const searchHref = (snippet?: string): string => {
    const q = (snippet || "").trim()
    return q ? `/app/search?query=${encodeURIComponent(q)}` : "/app/home"
  }

  // chatHref routes a chat message to the right conversation: group chats use
  // the 32-char grouping id (no space); DMs encode both user uuids separated
  // by a space, so we route to the OTHER participant.
  const chatHref = (grp?: string, msgUuid?: string): string => {
    if (grp && !grp.includes(" ")) return `/app/chat/group/${grp}/${msgUuid}`
    if (grp && grp.includes(" ") && currentUserId) {
      return `/app/chat/${getOtherUserId(grp, currentUserId)}/${msgUuid}`
    }
    return ""
  }

  const highlightHref = (h: BriefingHighlight): string => {
    switch (h.content_type) {
      case "post":
        if (h.channel_uuid) return `/app/channel/${h.channel_uuid}/${h.content_uuid}`
        return "/app/posts"
      case "task":
        return `/app/task/${h.content_uuid}`
      case "doc":
        return `/app/doc/${h.content_uuid}`
      case "chat":
        return chatHref(h.chat_grp_id, h.content_uuid) || searchHref(h.snippet)
      case "comment": {
        // Route a comment to its parent (the comment itself isn't separately
        // addressable). Prefer the most specific parent we have.
        if (h.post_uuid && h.channel_uuid) return `/app/channel/${h.channel_uuid}/${h.post_uuid}`
        if (h.task_uuid) return `/app/task/${h.task_uuid}`
        if (h.doc_uuid) return `/app/doc/${h.doc_uuid}/comment`
        // Chat comments have no separately-addressable parent message id in
        // the highlight, so fall back to search rather than guess.
        return searchHref(h.snippet)
      }
      default:
        return searchHref(h.snippet)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="bg-primary/10 p-1 rounded-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold tracking-tight">Your briefing</h2>
        <button
          type="button"
          onClick={() => router.push("/app/ai/memory")}
          className="ml-auto text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
        >
          Open memory <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {/* Your day — cross-connector agenda (calendar / PRs / email). Renders
          only when the user has linked connectors and there's something today. */}
      {dayItems.length > 0 && (
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">
            Your day
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {dayItems.map((d: BriefingDayItem, i: number) => {
              const Icon = DAY_ICON[d.source] || Sparkles
              const tint = DAY_TINT[d.source] || "text-muted-foreground"
              const row = (
                <span className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/40 transition-colors">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${tint}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug truncate">{d.title}</span>
                    {d.subtitle && (
                      <span className="block text-[11px] text-muted-foreground truncate">{d.subtitle}</span>
                    )}
                  </span>
                </span>
              )
              return (
                <li key={`${d.source}-${i}`}>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="block">
                      {row}
                    </a>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(hasOpenItems || hasHighlights) && (
        <div className={`grid grid-cols-1 ${bothColumns ? "md:grid-cols-2" : ""} divide-y md:divide-y-0 md:divide-x divide-border/50`}>
        {/* Your open items — only rendered when there's something to act on,
            so an empty column never leaves dead space on the dashboard. */}
        {hasOpenItems && (
          <div className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">
              Your open items
            </p>
            <ul className="space-y-1">
              {data.open_items.map((it) => {
                const Icon = KIND_ICON[it.kind] || HelpCircle
                const overdue = it.kind === "commitment" && isOverdue(it.due_at)
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => router.push(openHref(it))}
                      className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/40 transition-colors"
                    >
                      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${KIND_TINT[it.kind] || "text-muted-foreground"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug truncate">{it.content}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {it.due_at && (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] ${
                                overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {overdue ? "overdue" : "due"} {it.due_at}
                            </span>
                          )}
                          {it.scope_label && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/70 truncate max-w-[160px]">
                              {it.scope_type === "channel" ? <Hash className="h-3 w-3" /> : null}
                              {it.scope_type === "channel" ? it.scope_label : `· ${it.scope_label}`}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Recent highlights — only rendered when there's something new. */}
        {hasHighlights && (
          <div className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-2">
              Recent highlights
            </p>
            <ul className="space-y-1">
              {data.highlights.map((h, i) => {
                const HighlightIcon = HIGHLIGHT_ICON[h.content_type] || FileText
                return (
                  <li key={`${h.content_uuid}-${i}`}>
                    <button
                      type="button"
                      onClick={() => router.push(highlightHref(h))}
                      className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/40 transition-colors"
                    >
                      <HighlightIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug truncate">{h.snippet}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {h.author_name ? `${h.author_name}` : h.content_type}
                          {h.channel_uuid && channelName.get(h.channel_uuid)
                            ? ` · #${channelName.get(h.channel_uuid)}`
                            : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
