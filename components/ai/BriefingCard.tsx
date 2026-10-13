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
import { getBriefing, briefingKey, BriefingResult, MemoryItem, BriefingHighlight, BriefingDayItem } from "@/services/memoryService"
import { peekShared } from "@/lib/utils/sharedRequest"
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
  FileText,
  Hash,
  MessageSquare,
  CircleCheck,
  Calendar,
  Github,
  Mail,
} from "@/lib/icons"
import { withAI } from "@/components/common/withFeature"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { localDay } from "@/lib/utils/timeZone"
import { shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { homeGap, homeGlyph, homeInset } from "@/components/home/homeLines"

/**
 * A row of the briefing: its icon in Home's 24px glyph column and its words on
 * the card title's line (homeLines). The 14px icon 8px before the text put
 * every item 10px left of the title above it.
 */
const itemRow = cn("w-full text-left flex items-start rounded-md px-2 py-1.5 -mx-2 hover:bg-hover transition-colors", homeGap)

/** A memory item's due day ("2026-10-12") as the app writes a day: "12 Oct". */
function dueDay(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? day : shortDate(d)
}

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

// Per-source icon for the cross-connector "Your day" agenda; monochrome, the icon names the source.
const DAY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  github: Github,
  gmail: Mail,
}

function isOverdue(due?: string): boolean {
  if (!due) return false
  return due < localDay()
}

function BriefingCard() {
  const router = useRouter()
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const { data: selfProfile } = useFetchOnlyOnce<SelfProfile>(GetEndpointUrl.SelfProfile)
  const currentUserId = selfProfile?.data?.user_uuid
  // Start from the answer kept from a moment ago, if any (see AttentionCard).
  const [data, setData] = useState<BriefingResult | null>(() => peekShared<BriefingResult>(briefingKey()) ?? null)
  const [loading, setLoading] = useState(() => peekShared(briefingKey()) === undefined)
  const [allHighlights, setAllHighlights] = useState(false)

  useEffect(() => {
    let alive = true
    // One retry before giving up, so a transient first-load failure (a request
    // racing the auth token, a cold backend) doesn't hide the card for the
    // whole session with no way to recover.
    const load = (attempt: number) => {
      getBriefing()
        .then((res) => {
          if (alive) {
            setData(res)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!alive) return
          if (attempt < 1) {
            setTimeout(() => alive && load(attempt + 1), 1200)
            return
          }
          setData({ enabled: false, open_items: [], highlights: [], day_items: [] })
          setLoading(false)
        })
    }
    load(0)
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
  // Guard every collection defensively: the service normalizes these to
  // arrays, but a null/omitted slice must hide the section, never throw.
  const openItems = Array.isArray(data.open_items) ? data.open_items : []
  const highlights = Array.isArray(data.highlights) ? data.highlights : []
  const dayItems = Array.isArray(data.day_items) ? data.day_items : []
  const hasOpenItems = openItems.length > 0
  const hasHighlights = highlights.length > 0
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
    // H20: a sheet card at e1, an agent square, and the highlights led by who
    // said them. It is last on Home and fades in where it lands, so arriving
    // late never pushes anything.
    <section className="hub-fade-in overflow-hidden rounded-lg bg-sheet shadow-e1 dark:bg-[#18191C]" aria-labelledby="briefing-title" data-briefing="">
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <span aria-hidden className="avatar-agent grid size-6 place-items-center rounded-[32%] text-white">
          <Sparkles className="size-3.5" />
        </span>
        <h2 id="briefing-title" className="text-heading font-semibold">Your briefing</h2>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => router.push("/app/ai/memory")}>
          Open memory
        </Button>
      </div>

      {/* Your day — cross-connector agenda (calendar / PRs / email). Renders
          only when the user has linked connectors and there's something today. */}
      {dayItems.length > 0 && (
        <div className={cn("py-3 border-b border-border/50 bg-muted/20", homeInset)}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Your day
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {dayItems.map((d: BriefingDayItem, i: number) => {
              const Icon = DAY_ICON[d.source] || Sparkles
              const tint = "text-muted-foreground"
              const row = (
                <span className={itemRow}>
                  <span className={homeGlyph}><Icon className={`h-3.5 w-3.5 mt-0.5 ${tint}`} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug truncate">{d.title}</span>
                    {d.subtitle && (
                      <span className="block text-2xs text-muted-foreground truncate">{d.subtitle}</span>
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
          <div className={cn("py-4", homeInset)}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Your open items
            </p>
            <ul className="space-y-1">
              {openItems.map((it) => {
                const Icon = KIND_ICON[it.kind] || HelpCircle
                const overdue = it.kind === "commitment" && isOverdue(it.due_at)
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => router.push(openHref(it))}
                      className={itemRow}
                    >
                      <span className={homeGlyph}><Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug truncate">{it.content}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {it.due_at && (
                            <span
                              className={`inline-flex items-center gap-1 text-2xs ${
                                overdue ? "text-danger-ink font-medium" : "text-muted-foreground"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {overdue ? "overdue" : "due"} {dueDay(it.due_at)}
                            </span>
                          )}
                          {it.scope_label && (
                            <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground truncate max-w-[160px]">
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
          <div className={cn("py-4", homeInset)}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Recent highlights
            </p>
            <ul className="space-y-1">
              {highlights.slice(0, allHighlights ? undefined : 5).map((h, i) => {
                const HighlightIcon = HIGHLIGHT_ICON[h.content_type] || FileText
                return (
                  <li key={`${h.content_uuid}-${i}`}>
                    <button
                      type="button"
                      onClick={() => router.push(highlightHref(h))}
                      className={itemRow}
                    >
                      <span className={homeGlyph}>
                        {h.author_name ? (
                          <IdentityMark variant="avatar" size={24} id={h.chat_by_user_id || h.author_name} label={h.author_name} />
                        ) : (
                          <HighlightIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug truncate">{h.snippet}</span>
                        <span className="text-2xs text-muted-foreground">
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
            {highlights.length > 5 && !allHighlights ? (
              <Button variant="ghost" size="xs" className="mt-1" onClick={() => setAllHighlights(true)}>
                Show {highlights.length - 5} more
              </Button>
            ) : null}
          </div>
        )}
      </div>
      )}
    </section>
  )
}

// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export default withAI(BriefingCard)
