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

import { cn } from "@/lib/utils/helpers/cn"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Scissors, CircleStop, Copy } from "@/lib/icons"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { Button } from "@/components/ui/button"
import { CitationChip, CitationMarker } from "@/components/ai/citationChips"
import { askAIHref } from "@/lib/search/askAI"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import {
  unifiedSearchAnswer,
  isAbortedRequest,
  type SearchCitation,
  type UnifiedAnswerResponse,
} from "@/services/aiSearchService"
import { withAI } from "@/components/common/withFeature"

// citationHref maps a citation to a navigable target. External hits carry an
// absolute url (opened in a new tab); internal hits are resolved to an in-app
// route from their routing fields, mirroring the global-search navigation. A
// null result means "not directly navigable" (rendered as a static chip).
export function citationHref(c: SearchCitation, selfUUID: string): { href: string; external: boolean } | null {
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
export type Segment = { text: string } | { cite: number }
export function splitByCitations(answer: string, validIndexes: Set<number>): Segment[] {
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

/**
 * The AI answer above the results (hub.md S11): a raised card with the agent
 * gradient as its one top edge, the answer in body type with inline markers,
 * and the sources as chips. A low-confidence answer is one line, never a
 * fabrication; a failure is one line too, and the keyword results carry on.
 */
const SearchAnswer: React.FC<{ query: string; selfUUID?: string; resultCount?: number }> = ({ query, selfUUID = "", resultCount }) => {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<UnifiedAnswerResponse | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [lit, setLit] = React.useState<number | null>(null)
  const [tall, setTall] = React.useState(false)
  const bodyRef = React.useRef<HTMLParagraphElement>(null)
  // Held so the in-flight synthesis can be abandoned — by a new query, by
  // unmounting, or by the person pressing Stop.
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setExpanded(false)
    // Slightly longer debounce than the results list: the answer is a heavier
    // synthesis, so we wait until the user has settled on a query.
    const controller = new AbortController()
    abortRef.current = controller
    const t = setTimeout(async () => {
      try {
        const res = await unifiedSearchAnswer(q, controller.signal)
        if (!cancelled) setData(res)
      } catch (e) {
        // An answer the user abandoned (typed on, navigated, pressed Stop) is not
        // a failure: leave whatever is on screen rather than blanking it.
        if (!cancelled && !isAbortedRequest(e)) {
          setData(null)
          setFailed(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 550)
    return () => {
      cancelled = true
      clearTimeout(t)
      // Abandon the request itself, not just its result: the server's handler
      // runs on the request context, so this stops work nobody will read.
      controller.abort()
    }
  }, [query])

  // Stop lets a person end a slow synthesis instead of watching a skeleton. The
  // request is aborted (client AND server) and the panel simply stops loading.
  const stop = React.useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
  }, [])

  const answerText = data?.answer?.trim() ?? ""
  React.useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    setTall(el.scrollHeight > el.clientHeight + 1)
  }, [answerText, expanded])

  if (query.trim().length < 2) return null
  if (failed && !loading) {
    return (
      <p data-search-answer="unavailable" className="text-meta text-ink-3">
        AI answer unavailable
      </p>
    )
  }
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
  const hasAnswer = !!answerText
  const segments = hasAnswer ? splitByCitations(data!.answer, validIndexes) : []

  // Answered with nothing grounded: one honest line, never an invented answer.
  if (!loading && !hasAnswer) {
    return (
      <div data-search-answer="none" className="flex items-center gap-2 text-ui-sm text-ink-3">
        <span className="size-4 shrink-0">
          <AgentAvatar />
        </span>
        No clear answer in what you can see.
      </div>
    )
  }

  const sourceCount = citations.length || resultCount
  return (
    <section
      data-search-answer="card"
      aria-label="Answer"
      className="hub-agent-edge hub-pop rounded-lg bg-raised px-[18px] py-4 shadow-e1"
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-5 shrink-0", loading && !hasAnswer && "hub-breathe")}>
          <AgentAvatar />
        </span>
        <h2 className="text-heading font-semibold">Answer</h2>
        {hasAnswer && sourceCount ? (
          <span className="truncate text-meta text-ink-3">
            from {sourceCount} {sourceCount === 1 ? "result" : "results"} you can open
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {loading ? (
            <Button variant="ghost" size="xs" onClick={stop} aria-label="Stop generating this answer">
              <CircleStop className="size-3.5" />
              Stop
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="xs" onClick={() => router.push(askAIHref(query))}>
                Ask a follow-up
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy the answer"
                onClick={() => void navigator.clipboard?.writeText(answerText.replace(/\[(\d+)\]/g, ""))}
              >
                <Copy className="size-3.5" />
              </Button>
            </>
          )}
        </span>
      </div>

      {loading && !hasAnswer ? (
        <div className="mt-3 space-y-2" role="status">
          <p className="hub-shimmer text-ui-sm">
            Reading {resultCount ? `${resultCount} ${resultCount === 1 ? "result" : "results"}` : "what you can open"}…
          </p>
          <div className="h-3 w-full animate-shimmer rounded-sm bg-press" />
          <div className="h-3 w-2/3 animate-shimmer rounded-sm bg-press" />
        </div>
      ) : (
        <>
          <p
            ref={bodyRef}
            data-search-answer-body=""
            className={cn("mt-2.5 text-body text-foreground text-pretty", !expanded && "hub-clamp-fade")}
          >
            {segments.map((seg, i) =>
              "text" in seg ? (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ) : (
                <CitationMarker
                  key={i}
                  n={seg.cite}
                  title={byIndex.get(seg.cite)?.title}
                  lit={lit === seg.cite}
                  onHover={setLit}
                  onOpen={() => {
                    const c = byIndex.get(seg.cite)
                    if (c) goToCitation(c)
                  }}
                />
              ),
            )}
          </p>
          {tall || expanded ? (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-meta font-medium text-ink-2 hover:text-foreground">
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}

          {/* The answer covered part of what the search found: a footnote, not a warning. */}
          {data?.notice && (
            <div className="mt-2 flex items-start gap-1.5 text-meta text-ink-3" role="note">
              <Scissors className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span>{data.notice}</span>
            </div>
          )}

          {citations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" data-search-sources="">
              {citations.map((c, i) => {
                const nav = citationHref(c, selfUUID)
                return (
                  <CitationChip
                    key={c.index}
                    n={c.index}
                    title={c.title}
                    kind={c.kind || c.content_type}
                    source={c.source}
                    external={nav?.external}
                    disabled={!nav}
                    lit={lit === c.index}
                    step={i}
                    onHover={setLit}
                    onOpen={() => goToCitation(c)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}


// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export default withAI(SearchAnswer)