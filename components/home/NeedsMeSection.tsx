"use client"

/**
 * "What needs me now" (hub.md H8–H10): the queue Home exists for, where you
 * finish things rather than only see them.
 *
 * No card: a section header, then two-line HubRows grouped Agent requests,
 * Replies, Due, Email (labels only when there are two groups or more), six at
 * most and then "N more". Each kind acts in place: a task ticks Done, an agent
 * request is approved or dismissed (its outcome said on the row, never only in
 * a toast), a mention is answered under the row. A finished row leaves with
 * the resolve recipe: the check springs, holds 280ms, slides out, and the
 * rows below move up by transform. Clearing the last row in this session
 * earns the day's one celebration.
 *
 * Shared code: it draws rows and calls back. Where the rows come from (the
 * AI's attention list, or mentions and tasks without it) is the caller's.
 */
import Link from "next/link"
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { CountTick } from "@/components/ui/CountTick"
import { HubRow, HubRowSkeleton, HubSectionHeader, HubToolButton } from "@/components/ui/hubRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { Spark } from "@/components/ui/graphics/motifs"
import { ArrowUpRight, Check, Loader2, Send, Shield } from "@/lib/icons"
import { celebrateOnce } from "@/lib/celebrate"
import { useResolve } from "@/lib/hub/motion"
import { cn } from "@/lib/utils/helpers/cn"
import { groupNeeds, type NeedsItem } from "@/components/home/needsMe"


/**
 * The section holds its header and two rows' height (34 + 2 x 52) whether it
 * is loading, empty or showing one row, so the page below never moves when
 * the queue lands: on the demo it went from a three-row skeleton to one row,
 * and the projects under it jumped up 92px (layout shift 0.009).
 */
const NEEDS_MIN_H = "min-h-[138px]"

export interface NeedsActions {
  /** Mark a task done. */
  onDone?: (item: NeedsItem) => Promise<void>
  /** Approve an agent's request. Throws with the reason when it fails. */
  onApprove?: (item: NeedsItem) => Promise<void>
  onDismiss?: (item: NeedsItem) => Promise<void>
  /** Answer a mention under its row. */
  onReply?: (item: NeedsItem, text: string) => Promise<void>
}

export interface NeedsMeSectionProps extends NeedsActions {
  items: NeedsItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /** The last row, when it applies: the while-away line (H11). */
  footer?: ReactNode
  /** Shown in place of the empty state when the reader is in no channel (H7). */
  noChannels?: ReactNode
  className?: string
}

const SEE_ALL = "/app/inbox?tab=priority"

/** The 48px mini spot of the empty and cleared states: a moss disc, a check on a raised tile, one brand spark. */
function ClearSpot({ springRef }: { springRef?: React.Ref<SVGSVGElement> }) {
  return (
    <svg ref={springRef} viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="var(--camp-moss-tint)" />
      <rect x="13" y="13" width="22" height="22" rx="7" fill="var(--raised)" style={{ filter: "drop-shadow(0 2px 3px rgb(16 18 26 / 0.12))" }} />
      <path d="m18.5 24 4 4 7-8" fill="none" stroke="var(--camp-moss)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path transform="translate(35 4) scale(.38)" d="M12 2.5c.5 4.6 2.9 7 9.5 9.5-6.6 2.5-9 4.9-9.5 9.5-.5-4.6-2.9-7-9.5-9.5 6.6-2.5 9-4.9 9.5-9.5z" fill="var(--brand)" />
    </svg>
  )
}

/** A mention's words, with the reader's own mention as the brand-muted "@You" chip. */
function Quote({ text }: { text: string }) {
  const parts = text.split(/(@You)/)
  return (
    <span className="text-ui-sm text-ink-2">
      {parts.map((p, i) =>
        p === "@You" ? (
          <span key={i} className="hub-me mr-0.5 text-meta leading-4">
            @You
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

export function NeedsMeSection({
  items,
  loading,
  error,
  onRetry,
  footer,
  noChannels,
  onDone,
  onApprove,
  onDismiss,
  onReply,
  className,
}: NeedsMeSectionProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const { phase, resolve } = useResolve(listRef)
  const [gone, setGone] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<Record<string, "approve" | "dismiss" | "done" | "reply">>({})
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [replying, setReplying] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [said, setSaid] = useState("")
  // Cleared while you watched: the last row resolved in this session.
  const [cleared, setCleared] = useState(false)
  const resolvedHere = useRef(false)
  const spotRef = useRef<SVGSVGElement>(null)

  const live = items.filter((i) => !gone.has(i.id))
  const { groups, more, total } = groupNeeds(live)

  useEffect(() => {
    if (total === 0 && resolvedHere.current && !cleared) {
      setCleared(true)
    }
  }, [total, cleared])
  useEffect(() => {
    if (cleared) celebrateOnce("needs-me", spotRef.current, { count: 10 })
  }, [cleared])

  const finish = (item: NeedsItem, what: string) => {
    resolvedHere.current = true
    setSaid(what)
    resolve(item.id, () => setGone((g) => new Set(g).add(item.id)))
  }

  const run = async (item: NeedsItem, kind: "approve" | "dismiss" | "done", fn: ((i: NeedsItem) => Promise<void>) | undefined, what: string) => {
    if (!fn || busy[item.id]) return
    setBusy((b) => ({ ...b, [item.id]: kind }))
    setFailed((f) => {
      const n = { ...f }
      delete n[item.id]
      return n
    })
    try {
      await fn(item)
      finish(item, what)
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "something went wrong"
      setFailed((f) => ({ ...f, [item.id]: `Couldn't ${kind === "done" ? "mark it done" : kind}: ${reason}` }))
    } finally {
      setBusy((b) => {
        const n = { ...b }
        delete n[item.id]
        return n
      })
    }
  }

  const sendReply = async (item: NeedsItem) => {
    const text = draft.trim()
    if (!text || !onReply) return
    setBusy((b) => ({ ...b, [item.id]: "reply" }))
    try {
      await onReply(item, text)
      setReplying(null)
      setDraft("")
      finish(item, "Replied")
    } catch {
      setFailed((f) => ({ ...f, [item.id]: "Couldn't send your reply. Try again." }))
    } finally {
      setBusy((b) => {
        const n = { ...b }
        delete n[item.id]
        return n
      })
    }
  }

  // E done, R reply, A approve, D dismiss: only with the row focused.
  const keys = (item: NeedsItem) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === "e" && item.kind === "due") run(item, "done", onDone, "Done")
    else if (k === "r" && item.kind === "reply" && item.postUuid && onReply) setReplying(item.id)
    else if (k === "a" && item.kind === "agent") run(item, "approve", onApprove, "Approved")
    else if (k === "d" && item.kind === "agent") run(item, "dismiss", onDismiss, "Dismissed")
    else return
    e.preventDefault()
  }

  const header = (
    <HubSectionHeader
      id="needs-me-title"
      title="What needs me now"
      count={total > 0 ? <CountTick value={total} /> : undefined}
      action={<Link href={SEE_ALL}>See all</Link>}
    />
  )

  if (loading) {
    return (
      <section aria-labelledby="needs-me-title" className={cn(NEEDS_MIN_H, className)} role="status" aria-label="Loading what needs you" data-needs-me="">
        {header}
        <div>
          {[0, 1].map((i) => (
            <HubRowSkeleton key={i} density="two-line" />
          ))}
        </div>
      </section>
    )
  }

  if (error && live.length === 0) {
    return (
      <section aria-labelledby="needs-me-title" className={cn(NEEDS_MIN_H, className)} data-needs-me="">
        {header}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-4 py-3 text-ui-sm text-ink-2">
          Couldn&apos;t load what needs you
          {onRetry ? (
            <Button variant="ghost" size="xs" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </section>
    )
  }

  const lead = (item: NeedsItem) => {
    if (phase(item.id)) {
      return (
        <span className="grid size-5 place-items-center rounded-full bg-camp-moss text-white animate-spring" data-resolved-check="">
          <Check className="size-3" />
        </span>
      )
    }
    if (item.kind === "agent") return <span className="block size-6"><AgentAvatar /></span>
    if (item.kind === "due") return <StatusGlyph status={item.status ?? "todo"} />
    if (item.person) return <IdentityMark variant="avatar" size={24} id={item.person.id} label={item.person.name} />
    return <StatusGlyph status="todo" />
  }

  const second = (item: NeedsItem): ReactNode => {
    if (item.kind === "agent") {
      return (
        <span className="inline-flex items-center gap-1.5">
          {item.context ? <span>{item.context}</span> : null}
          {item.context ? <span className="text-ink-4">·</span> : null}
          <Shield className="size-3 text-agent" aria-hidden />
          acts for you
        </span>
      )
    }
    if (item.kind === "due") {
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {item.due ? (
            <Chip tone={item.overdue ? "danger" : "sun"} className="h-[18px] px-1.5 text-micro">
              {item.due}
            </Chip>
          ) : null}
          {item.project ? (
            <>
              <IdentityMark variant="square" size={12} id={item.project.id} />
              <span className="truncate">{item.project.name}</span>
            </>
          ) : null}
        </span>
      )
    }
    if (item.quote) return <Quote text={item.quote} />
    return item.context
  }

  const actions = (item: NeedsItem): ReactNode => {
    const b = busy[item.id]
    if (item.kind === "agent") {
      // Always visible, not only on hover: consequential and rare.
      return (
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="xs" disabled={!!b} onClick={() => run(item, "dismiss", onDismiss, "Dismissed")}>
            {b === "dismiss" ? <Loader2 className="animate-spin" /> : null}
            Dismiss
          </Button>
          <Button size="xs" disabled={!!b} aria-busy={b === "approve" || undefined} onClick={() => run(item, "approve", onApprove, "Approved")}>
            {b === "approve" ? <Loader2 className="animate-spin" /> : null}
            Approve
          </Button>
        </span>
      )
    }
    if (item.kind === "due") {
      return (
        <span className="flex items-center gap-px">
          <span className="flex gap-px opacity-0 transition-opacity group-hover/hubrow:opacity-100 group-focus-within/hubrow:opacity-100 [@media(hover:none)]:opacity-100">
            {item.href ? (
              <Link
                href={item.href}
                aria-label="Open"
                title="Open"
                className="grid size-6 place-items-center rounded-sm text-ink-3 hover:bg-hover hover:text-foreground [&_svg]:size-3.5"
              >
                <ArrowUpRight />
              </Link>
            ) : null}
          </span>
          <HubToolButton label="Done" shortcut="E" disabled={!onDone || !!b} onClick={() => run(item, "done", onDone, "Done")}>
            {b === "done" ? <Loader2 className="animate-spin" /> : <Check />}
          </HubToolButton>
        </span>
      )
    }
    if (item.kind === "reply" && item.postUuid && onReply) {
      return (
        <Button variant="secondary" size="xs" onClick={() => setReplying(replying === item.id ? null : item.id)}>
          Reply <span className="kbd">R</span>
        </Button>
      )
    }
    return item.href ? (
      <Link href={item.href} className="text-meta text-ink-3 hover:text-foreground">
        Open
      </Link>
    ) : null
  }

  const showLabels = groups.length >= 2

  return (
    <section aria-labelledby="needs-me-title" className={cn(NEEDS_MIN_H, className)} data-needs-me="">
      {header}
      {total === 0 ? (
        noChannels && !cleared ? (
          noChannels
        ) : (
          <div className={cn("flex min-h-24 items-center gap-3.5 py-2.5", cleared && "hub-fade-in")} role="status" data-needs-empty={cleared ? "cleared" : "empty"}>
            <ClearSpot springRef={spotRef} />
            <div>
              <p className="text-heading font-semibold">{cleared ? "All clear. Nice work." : "Nothing needs you right now"}</p>
              <p className="mt-0.5 text-ui text-ink-2">Mentions, replies and tasks due land here.</p>
            </div>
          </div>
        )
      ) : (
        <div ref={listRef} className="-mx-2.5" data-needs-list="">
          {groups.map((g) => (
            <div key={g.kind} data-flip-key={`g:${g.kind}`} data-needs-group={g.kind} id={`needs-${g.kind}`}>
              {showLabels ? <p className="flex h-7 items-center pl-[22px] text-meta font-medium text-ink-3">{g.label}</p> : null}
              {g.items.map((item) => (
                <div key={item.id} data-flip-key={item.id}>
                  <HubRow
                    density="two-line"
                    tabIndex={0}
                    onKeyDown={keys(item)}
                    data-needs-kind={item.kind}
                    resolve={phase(item.id)}
                    lead={lead(item)}
                    title={
                      item.href && item.kind !== "agent" ? (
                        <Link href={item.href} className="outline-none hover:underline hover:underline-offset-[3px]">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )
                    }
                    second={second(item)}
                    meta={<span className="flex items-center gap-2">{actions(item)}</span>}
                  >
                    {failed[item.id] ? (
                      <span className="mt-1 flex items-center gap-2 text-meta text-danger-ink" role="alert">
                        {failed[item.id]}
                        {item.kind === "agent" ? (
                          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => run(item, "approve", onApprove, "Approved")}>
                            Retry
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                    {replying === item.id ? (
                      <span className="hub-pop mt-2 flex min-h-[72px] flex-col rounded-lg bg-raised p-2.5 shadow-e2">
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === "Escape") setReplying(null)
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                              e.preventDefault()
                              void sendReply(item)
                            }
                          }}
                          placeholder={`Reply to ${item.person?.name.split(/\s+/)[0] ?? "them"}…`}
                          aria-label="Your reply"
                          className="min-h-8 w-full resize-none bg-transparent text-ui outline-none placeholder:text-ink-3"
                        />
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-meta text-ink-3">↵ send · Esc close</span>
                          <button
                            type="button"
                            aria-label="Send reply"
                            disabled={!draft.trim() || busy[item.id] === "reply"}
                            onClick={() => void sendReply(item)}
                            className={cn(
                              "grid size-6 place-items-center rounded-md [&_svg]:size-3.5",
                              draft.trim() ? "bg-brand text-brand-foreground shadow-primary" : "bg-press text-ink-3",
                            )}
                          >
                            {busy[item.id] === "reply" ? <Loader2 className="animate-spin" /> : <Send />}
                          </button>
                        </span>
                      </span>
                    ) : null}
                  </HubRow>
                </div>
              ))}
            </div>
          ))}
          {more > 0 ? (
            <Link href={SEE_ALL} data-flip-key="more" className="hub-row" data-density="compact" data-interactive="">
              <span />
              <span className="hub-row-lead" />
              <span className="text-ui text-ink-2">{more} more</span>
              <span />
            </Link>
          ) : null}
        </div>
      )}
      {footer ? <div className="mt-1">{footer}</div> : null}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </section>
  )
}

/** The agent square with a spark, 24px: the lead of an agent's row and the while-away line. */
export function AgentMark({ size = 24 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[32%] text-white avatar-agent" style={{ width: size, height: size }} aria-hidden>
      <Spark className="size-[55%]" />
    </span>
  )
}
