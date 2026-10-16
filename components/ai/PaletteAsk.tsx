"use client"

/**
 * The palette's Ask mode (design v3, shell P2): the answer to what was typed,
 * streamed into the palette's list area, with the sources it read and the
 * provenance line. ⌘⏎ carries the conversation into the AI panel.
 *
 * The palette owns the field; this view owns the asking. It asks when the
 * palette says so (askNonce, on Enter) and continues in the panel when it says
 * so (continueNonce, on ⌘⏎), so the field never has to move between the two
 * modes and Tab keeps the query exactly as typed.
 *
 * AI-only and gated on itself (withAI), as every component in components/ai
 * rendered from outside it must be (aiEntryPointsGated.test.ts).
 */

import * as React from "react"
import { useDispatch } from "react-redux"
import { CheckSquare, FileText, Hash, MessageCircle, RotateCcw, Shield } from "@/lib/icons"
import { useAskAIStream, type SourceRef } from "@/services/aiService"
import { rememberConversation } from "@/lib/ai/lastConversation"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { withAI } from "@/components/common/withFeature"

export interface PaletteAskProps {
  /** What is in the palette's field. */
  query: string
  /** Bumped by the palette on Enter: ask the query. */
  askNonce: number
  /** Bumped by the palette on ⌘⏎: continue in the AI panel. */
  continueNonce: number
  /** The viewer, to route a direct message's source to the other person. */
  selfId?: string
  /** Go somewhere (a source chip), closing the palette. */
  onNavigate: (href: string) => void
  /** The palette closes: the conversation moved to the AI panel. */
  onContinued: () => void
}

/** Where a source opens, or null when it has nowhere of its own. Pure. */
export function sourceHref(s: SourceRef, selfId = ""): string | null {
  const id = s.content_uuid
  switch (s.content_type) {
    case "post":
      return s.channel_uuid ? `/app/channel/${s.channel_uuid}/${id}` : null
    case "task":
      return `/app/task/${id}`
    case "doc":
      return `/app/doc/${id}`
    case "chat": {
      const grp = s.chat_grp_id
      if (!grp) return null
      if (!grp.includes(" ")) return `/app/chat/group/${grp}`
      if (!selfId) return null
      const other = getOtherUserId(grp, selfId)
      return other ? `/app/chat/${other}` : null
    }
    case "comment":
      if (s.post_uuid && s.channel_uuid) return `/app/channel/${s.channel_uuid}/${s.post_uuid}`
      if (s.task_uuid) return `/app/task/${s.task_uuid}`
      if (s.doc_uuid) return `/app/doc/${s.doc_uuid}`
      return null
    default:
      return null
  }
}

/** What a source chip says: a channel by its name, else what kind it is and a few words of it. Pure. */
export function sourceLabel(s: SourceRef): string {
  if ((s.content_type === "post" || s.content_type === "comment") && s.channel_name) return s.channel_name
  const words = (s.snippet ?? "").replace(/\s+/g, " ").trim()
  const short = words.length > 28 ? `${words.slice(0, 27).trimEnd()}…` : words
  const kind = { post: "Message", chat: "Direct message", doc: "Doc", task: "Task", comment: "Comment" }[s.content_type] ?? "Source"
  return short || kind
}

function SourceGlyph({ type }: { type: SourceRef["content_type"] }) {
  const Glyph = type === "doc" ? FileText : type === "task" ? CheckSquare : type === "chat" ? MessageCircle : Hash
  return <Glyph className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
}

export function PaletteAskView({ query, askNonce, continueNonce, selfId, onNavigate, onContinued }: PaletteAskProps) {
  const dispatch = useDispatch()
  const { askStream, isStreaming, streamText, error } = useAskAIStream()
  const [asked, setAsked] = React.useState("")
  const [sources, setSources] = React.useState<SourceRef[]>([])
  const [done, setDone] = React.useState(false)
  // The conversation this palette's questions belong to, so a follow-up
  // continues it and ⌘⏎ hands the panel the same thread.
  const session = React.useRef<string | undefined>(undefined)
  const continueWhenReady = React.useRef(false)

  const continueInPanel = React.useCallback(
    (sid: string | undefined) => {
      if (sid) rememberConversation(sid)
      dispatch(openRightPanel({ aiChatOpen: true }))
      onContinued()
    },
    [dispatch, onContinued],
  )

  const ask = React.useCallback(
    async (q: string) => {
      const question = q.trim()
      if (!question) return
      setAsked(question)
      setSources([])
      setDone(false)
      const result = await askStream(question, session.current)
      if (result?.sessionId) session.current = result.sessionId
      if (result) setSources(result.sources ?? [])
      setDone(true)
      if (continueWhenReady.current) {
        continueWhenReady.current = false
        continueInPanel(session.current)
      }
    },
    [askStream, continueInPanel],
  )

  // Enter in the field.
  // From zero: the palette resets the count on leaving Ask, so a bump made
  // as Ask opens (the Ask row, with a query) is asked on mount.
  const lastAsk = React.useRef(0)
  React.useEffect(() => {
    if (askNonce === 0 || askNonce === lastAsk.current) return
    lastAsk.current = askNonce
    void ask(query)
  }, [askNonce, query, ask])

  // ⌘⏎: the thread moves to the panel. Asked nothing yet, it asks first and
  // moves once the conversation has an id, so the panel opens on the answer.
  const lastContinue = React.useRef(0)
  React.useEffect(() => {
    if (continueNonce === 0 || continueNonce === lastContinue.current) return
    lastContinue.current = continueNonce
    if (session.current || !query.trim()) {
      continueInPanel(session.current)
      return
    }
    continueWhenReady.current = true
    if (!isStreaming) void ask(query)
  }, [continueNonce, query, isStreaming, ask, continueInPanel])

  const thinking = isStreaming && !streamText
  // An answer that came back with no words is an answer that failed: on its
  // own, the provenance line said "Answered from what you can open" under
  // nothing at all.
  const failed = !isStreaming && (!!error || (done && !streamText.trim()))

  if (!asked) {
    return (
      <div className="palette-answer" data-palette-ask="">
        <p className="text-ink-2">Ask about your workspace: what was decided, who owns what, what is blocking a launch.</p>
        <Provenance />
      </div>
    )
  }

  return (
    <div className="palette-answer" data-palette-ask="" aria-live="polite" aria-busy={isStreaming}>
      {thinking && (
        <div className="flex items-center gap-2 text-xs text-ink-3" role="status">
          <span className="palette-dots" aria-hidden="true"><i /><i /><i /></span>
          Reading what you can open…
        </div>
      )}
      {streamText && (
        <p>
          {withBold(streamText)}
          {isStreaming && <span className="palette-caret" aria-hidden="true" />}
        </p>
      )}
      {failed && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2" role="alert">
          <span>OneCamp AI couldn&apos;t answer.</span>
          <button type="button" className="inline-flex items-center gap-1 font-medium text-brand-text hover:underline" onClick={() => void ask(asked)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => continueInPanel(session.current)}>
            Open the AI panel
          </button>
        </div>
      )}
      {done && sources.length > 0 && (
        <div className="palette-sources" aria-label="Sources">
          {sources.slice(0, 6).map((s, i) => {
            const href = sourceHref(s, selfId)
            const body = (
              <>
                <SourceGlyph type={s.content_type} />
                <span className="truncate">{sourceLabel(s)}</span>
              </>
            )
            return href ? (
              <button key={`${s.content_uuid}-${i}`} type="button" className="palette-source" onClick={() => onNavigate(href)}>
                {body}
              </button>
            ) : (
              <span key={`${s.content_uuid}-${i}`} className="palette-source">{body}</span>
            )
          })}
        </div>
      )}
      {(streamText || done) && !failed && <Provenance />}
    </div>
  )
}

/**
 * The answer's **bold**, drawn as weight. The model writes Markdown; the
 * palette's answer is one paragraph, so the rest stays as written. Pure.
 */
export function withBold(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold">{part}</b> : part))
}

/** The governance line: what the answer was made from, and that it is kept. */
function Provenance() {
  return (
    <div className="palette-provenance">
      <Shield className="h-3 w-3 text-agent" aria-hidden="true" />
      Answered from what you can open · on the record
    </div>
  )
}

const PaletteAsk = withAI(PaletteAskView)
export default PaletteAsk
