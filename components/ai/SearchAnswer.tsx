"use client"

/**
 * SearchAnswer — the grounded "AI answer with verified sources" block at the
 * top of the global search page (the Notion-AI / Glean answer surface).
 *
 * It asks the backend for a short, cited answer synthesized over the SAME
 * permission-scoped unified-search corpus, then renders the answer with inline
 * clickable [n] citation markers and a numbered source list beneath it. Every
 * citation is a real hit the caller already has access to: internal ones
 * deep-link into the workspace (post / task / doc / channel / chat), external
 * ones (Gmail / GitHub) open in a new tab. Nothing is shown until there's a
 * query and a real answer, so it never adds noise to a fresh or AI-off
 * workspace, and it never fabricates a reference.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, ExternalLink } from "@/lib/icons"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { unifiedSearchAnswer, type SearchCitation, type UnifiedAnswerResponse } from "@/services/aiSearchService"

// citationHref maps a citation to a navigable target. External hits carry an
// absolute url (opened in a new tab); internal hits are resolved to an in-app
// route from their routing fields, mirroring the global-search navigation. A
// null result means "not directly navigable" (rendered as a static chip).
function citationHref(c: SearchCitation, selfUUID: string): { href: string; external: boolean } | null {
  if (c.url) return { href: c.url, external: true }
  if (c.post_uuid && c.channel_uuid) return { href: `/app/channel/${c.channel_uuid}/${c.post_uuid}`, external: false }
  if (c.task_uuid) return { href: `/app/task/${c.task_uuid}`, external: false }
  if (c.doc_uuid) return { href: `/app/doc/${c.doc_uuid}`, external: false }
  if (c.chat_grp_id) {
    const grp = c.chat_grp_id
    if (grp.includes(" ")) {
      // A 1:1 DM group needs the viewer's own id to pick the peer; without it
      // we can't route safely, so the citation stays a static (non-nav) chip.
      if (!selfUUID) return null
      const other = getOtherUserId(grp, selfUUID)
      return other ? { href: `/app/chat/${other}`, external: false } : null
    }
    return { href: `/app/chat/group/${grp}`, external: false }
  }
  if (c.channel_uuid) return { href: `/app/channel/${c.channel_uuid}`, external: false }
  if (c.project_uuid) return { href: `/app/project/${c.project_uuid}`, external: false }
  return null
}

// splitByCitations breaks answer text into an ordered list of text spans and
// citation markers, so each [n] can render as an interactive chip. Unknown
// markers (no matching citation) fall back to plain text.
type Segment = { text: string } | { cite: number }
function splitByCitations(answer: string, validIndexes: Set<number>): Segment[] {
  const segments: Segment[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(answer)) !== null) {
    const n = parseInt(m[1], 10)
    if (!validIndexes.has(n)) continue // keep unknown markers inline as text
    if (m.index > last) segments.push({ text: answer.slice(last, m.index) })
    segments.push({ cite: n })
    last = m.index + m[0].length
  }
  if (last < answer.length) segments.push({ text: answer.slice(last) })
  return segments
}

const SearchAnswer: React.FC<{ query: string; selfUUID?: string }> = ({ query, selfUUID = "" }) => {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<UnifiedAnswerResponse | null>(null)

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    // Slightly longer debounce than the results list: the answer is a heavier
    // synthesis, so we wait until the user has settled on a query.
    const t = setTimeout(async () => {
      try {
        const res = await unifiedSearchAnswer(q)
        if (!cancelled) setData(res)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 550)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  if (query.trim().length < 2) return null
  if (!loading && (!data || !data.enabled)) return null

  const goToCitation = (c: SearchCitation) => {
    const target = citationHref(c, selfUUID)
    if (!target) return
    if (target.external) window.open(target.href, "_blank", "noopener,noreferrer")
    else router.push(target.href)
  }

  const citations = data?.citations || []
  const byIndex = new Map(citations.map((c) => [c.index, c]))
  const validIndexes = new Set(citations.map((c) => c.index))
  const hasAnswer = !!data?.answer?.trim()
  const segments = hasAnswer ? splitByCitations(data!.answer, validIndexes) : []

  // Nothing grounded to show and not loading: stay quiet (note-only responses
  // like "no sources" collapse to nothing so the keyword results carry the page).
  if (!loading && !hasAnswer) return null

  return (
    <div className="mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        AI answer
        {loading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {loading && !hasAnswer ? (
        <div className="space-y-2">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-foreground">
            {segments.map((seg, i) =>
              "text" in seg ? (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const c = byIndex.get(seg.cite)
                    if (c) goToCitation(c)
                  }}
                  title={byIndex.get(seg.cite)?.title || ""}
                  className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 align-super text-[10px] font-bold text-primary transition-colors hover:bg-primary/30"
                >
                  {seg.cite}
                </button>
              ),
            )}
          </p>

          {citations.length > 0 && (
            <div className="mt-3 border-t border-border/50 pt-2">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sources
              </div>
              <div className="space-y-1">
                {citations.map((c) => {
                  const nav = citationHref(c, selfUUID)
                  return (
                    <button
                      key={c.index}
                      type="button"
                      disabled={!nav}
                      onClick={() => goToCitation(c)}
                      className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        nav ? "hover:bg-accent/50" : "cursor-default"
                      }`}
                    >
                      <span className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-primary/15 px-1 text-[10px] font-bold text-primary">
                        {c.index}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-foreground">{c.title || "Untitled"}</span>
                          {nav?.external && (
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          )}
                        </span>
                        {c.meta && <span className="block truncate text-[11px] text-muted-foreground">{c.meta}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SearchAnswer
