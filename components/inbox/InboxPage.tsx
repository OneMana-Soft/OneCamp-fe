"use client"

/**
 * InboxPage: the person's own Gmail inside OneCamp ("Mail" in design v3).
 *
 * Email is where a lot of work arrives, and it used to arrive in another tab.
 * Here a person reads it beside the work: one click turns it into a task that
 * links back to the email, and a reply goes out from their own address in the
 * same conversation.
 *
 * Bodies arrive sanitised by the server with remote images removed (an image
 * URL is how a sender learns an email was opened) and are sanitised again here.
 *
 * DESIGN V3 (hub.md §5): two panes in the Linear way, a 400px list of feed
 * rows and a reader with a 720px measure; messages without boxes, earlier
 * ones folded; a floating reply card; J/K, ↵, Esc, T, R, O and / from the
 * keyboard.
 */

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { celebrateOnce, springPop } from "@/lib/celebrate"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { ArrowLeft, ArrowUp, ExternalLink, Loader2, Lock, MoreHorizontal, RefreshCw, Search, CircleCheck, X } from "@/lib/icons"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { SpotEnvelope, SpotSearchV3 } from "@/components/ui/graphics/hubSpots"
import { HubRow, HubRowSkeleton } from "@/components/ui/hubRow"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { openUI } from "@/store/slice/uiSlice"
import { startConnect } from "@/services/connectorService"
import { taskFromEmail } from "@/lib/task/emailToTask"
import {
  getInbox,
  getInboxThread,
  connectionProblem,
  fullDate,
  mailDate,
  replyToThread,
  senderName,
  shortDate,
  type ConnectionProblem,
  type InboxMessage,
  type InboxThread,
  type InboxThreadDetail,
} from "@/services/inboxService"
import { useModEnter } from "@/hooks/useModKey"
import { onEscape } from "@/lib/keys/onEscape"
import { foldedAtStart, inboxKeyAction, senderAddress, splitQuoted, threadByline } from "@/components/inbox/inboxParts"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

function htmlText(html: string): string {
  if (typeof document === "undefined") return ""
  const el = document.createElement("div")
  el.innerHTML = sanitizeRichHtml(html)
  return (el.textContent || "").trim()
}

/** True while the person is typing somewhere, so the page's letter keys stay out of the way. */
function typing(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
}

export default function InboxPage() {
  const { toast } = useToast()
  const dispatch = useDispatch()
  // The send hint's key: Ctrl off a Mac.
  const sendKeys = useModEnter()
  const [query, setQuery] = useState("")
  const [applied, setApplied] = useState("")
  const [threads, setThreads] = useState<InboxThread[] | null>(null)
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [connection, setConnection] = useState<ConnectionProblem | null>(null)
  const [listError, setListError] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<InboxThreadDetail | null>(null)
  const [threadError, setThreadError] = useState("")
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState("")
  // The keyboard cursor in the list, which J/K move and ↵ opens.
  const [cursor, setCursor] = useState(-1)

  const searchRef = useRef<HTMLInputElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  // Only the newest list and the newest open conversation may land: a slow
  // answer for an earlier search or an earlier click must not replace it.
  const listSeq = useRef(0)
  const openSeq = useRef(0)

  /** Moves the page to its connect screen when the error calls for it. */
  const handledAsConnection = useCallback((e: unknown) => {
    const problem = connectionProblem(e)
    if (problem) setConnection(problem)
    return problem !== null
  }, [])

  const load = useCallback(async (q: string) => {
    const seq = ++listSeq.current
    setThreads(null)
    setListError("")
    try {
      const page = await getInbox(q)
      if (seq !== listSeq.current) return
      setThreads(page.threads)
      setNextToken(page.next_page_token)
      setConnection(null)
    } catch (e) {
      if (seq !== listSeq.current) return
      if (!handledAsConnection(e)) setListError(apiErrorMessage(e, "Couldn't load your inbox."))
      setThreads([])
    }
  }, [handledAsConnection])

  useEffect(() => {
    void load(applied)
  }, [load, applied])

  // Back from Google's consent screen: say so if it failed, and drop the
  // status from the address so a reload does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get("connector")
    if (!status) return
    if (status === "error") {
      toast({ title: "Gmail was not connected", description: "Google did not finish the connection. Try again.", variant: "destructive" })
    }
    window.history.replaceState({}, document.title, window.location.pathname)
  }, [toast])

  const loadMore = async () => {
    if (!nextToken) return
    setLoadingMore(true)
    try {
      const page = await getInbox(applied, nextToken)
      setThreads((cur) => [...(cur ?? []), ...page.threads])
      setNextToken(page.next_page_token)
    } catch (e) {
      if (!handledAsConnection(e)) toast({ title: "Couldn't load more", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setLoadingMore(false)
    }
  }

  const open = useCallback(async (id: string) => {
    const seq = ++openSeq.current
    setOpenId(id)
    setThread(null)
    setThreadError("")
    setReply("")
    setSendError("")
    try {
      const t = await getInboxThread(id)
      if (seq === openSeq.current) setThread(t)
    } catch (e) {
      if (seq !== openSeq.current || handledAsConnection(e)) return
      setThreadError(apiErrorMessage(e, "Couldn't open this email."))
    }
  }, [handledAsConnection])

  const makeTask = useCallback(() => {
    if (!thread) return
    const last = thread.messages[thread.messages.length - 1]
    const text = last ? htmlText(last.body) : ""
    const { draft, source } = taskFromEmail(thread.subject, last ? senderName(last.from) : "", text, thread.gmail_url)
    dispatch(openUI({ key: "createTask", data: { draft, source } }))
  }, [thread, dispatch])

  const send = async () => {
    if (!openId || !reply.trim()) return
    setSending(true)
    setSendError("")
    try {
      await replyToThread(openId, reply)
      setReply("")
      // The reply appears at the end of the conversation: the page says it in place.
      await open(openId)
    } catch (e) {
      // The draft stays in the box, so nothing typed is lost.
      if (!handledAsConnection(e)) setSendError(apiErrorMessage(e, "Your reply was not sent."))
    } finally {
      setSending(false)
    }
  }

  // Esc goes back to the list, from a field too (the reply box).
  useEffect(() => {
    if (!openId) return
    return onEscape("page", (e) => {
      if (e.target instanceof HTMLElement) e.target.blur()
      setOpenId(null)
    })
  }, [openId])

  // The keys (I1). Letters only act outside a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = inboxKeyAction(e)
      if (!action) return
      if (typing(e.target)) return
      const rows = threads ?? []
      switch (action) {
        case "next":
        case "prev": {
          if (rows.length === 0) return
          e.preventDefault()
          setCursor((c) => Math.max(0, Math.min(rows.length - 1, (c < 0 ? (action === "next" ? -1 : rows.length) : c) + (action === "next" ? 1 : -1))))
          return
        }
        case "open":
          if (cursor >= 0 && rows[cursor]) {
            e.preventDefault()
            void open(rows[cursor].id)
          }
          return
          return
        case "task":
          e.preventDefault()
          makeTask()
          return
        case "reply":
          if (thread) {
            e.preventDefault()
            replyRef.current?.focus()
          }
          return
        case "gmail":
          if (thread) window.open(thread.gmail_url, "_blank", "noopener,noreferrer")
          return
        case "search":
          e.preventDefault()
          searchRef.current?.focus()
          return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [threads, cursor, openId, thread, open, makeTask])

  // The public demo's shared visitor (and only that account; the demo's own team
  // connects as usual) can never connect Gmail, so the server says "demo" and
  // the page explains why instead of offering a button that would be refused.
  if (connection === "demo") {
    return (
      <ConnectFrame
        spot={<SpotEnvelope />}
        title="Your own inbox, in your own OneCamp"
        body="This demo is shared by everyone who opens it, so it never connects anyone's Gmail: the next visitor would see your mail. On your own OneCamp, Mail reads your Gmail beside your work, and only you can see it."
        action={null}
      />
    )
  }

  if (connection) {
    const reconnect = connection === "reconnect"
    return (
      <ConnectFrame
        spot={<SpotEnvelope badge={reconnect ? "alert" : undefined} />}
        title={reconnect ? "Reconnect Gmail" : "Bring your email into OneCamp"}
        body={
          reconnect
            ? "Your Gmail connection expired or no longer has the access Mail needs. Connect it again to pick up where you left off."
            : "Read your inbox here, turn an email into a task, and reply without leaving the workspace."
        }
        action={
          <Button onClick={() => void startConnect("gmail", "inbox").catch((e) => toast({ title: "Couldn't connect", description: apiErrorMessage(e, "Try again."), variant: "destructive" }))}>
            {reconnect ? "Reconnect Gmail" : "Connect Gmail"}
          </Button>
        }
        privacy
      />
    )
  }

  const header = (
    <div data-inbox-header="" className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line pl-4 pr-3 md:pl-6">
      <h1 className="text-title-3 font-semibold">Mail</h1>
      <span className="grow" />
      <form
        role="search"
        className={cn("hub-field relative hidden h-8 w-[280px] items-center rounded-md sm:flex", openId && "max-md:hidden")}
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(query.trim())
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" aria-hidden />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mail"
          aria-label="Search mail"
          name="q"
          autoComplete="off"
          className="h-full w-full rounded-md bg-transparent pl-8 pr-8 text-ui-sm text-foreground outline-none placeholder:text-ink-3"
        />
        {!query ? <kbd className="kbd pointer-events-none absolute right-2">/</kbd> : null}
      </form>
      <Button variant="ghost" size="icon-sm" aria-label="Refresh" onClick={() => void load(applied)}>
        <RefreshCw className="size-4" />
      </Button>
    </div>
  )

  const list = (
    <div data-inbox-list="" className={cn("flex min-h-0 flex-col md:w-[400px] md:min-w-[360px] md:shrink-0 md:border-r md:border-line", openId && "hidden md:flex")}>
      {/* On a phone the field sits on the list; from sm it is in the header. */}
      <form
        className="border-b border-line p-3 sm:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(query.trim())
        }}
      >
        <div className="hub-field relative flex h-11 items-center rounded-[10px]">
          <Search className="pointer-events-none absolute left-3 size-4 text-ink-3" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mail" aria-label="Search mail (phone)" className="h-full w-full bg-transparent pl-9 pr-3 text-base outline-none placeholder:text-ink-3" />
        </div>
      </form>
      {applied && threads && threads.length > 0 ? (
        <div className="flex h-10 shrink-0 items-center gap-2 px-4 text-meta text-ink-3">
          <span className="hub-chip-rest inline-flex h-[22px] items-center gap-1 rounded-sm pl-2 pr-1 text-meta font-medium text-ink-2">
            {applied}
            <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setApplied("") }} className="grid size-4 place-items-center rounded-xs hover:bg-press">
              <X className="size-3" />
            </button>
          </span>
          <span className="tabular-nums">{threads.length === 1 ? "1 result" : `${threads.length} results`}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {threads === null && (
          // The rows' own shape while the list loads, not a spinner.
          <div role="status" aria-label="Loading your inbox">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <HubRowSkeleton key={i} density="feed" />
            ))}
          </div>
        )}
        {listError && (
          <div data-inbox-state="error" className="mx-4 mt-4 flex items-center gap-3 rounded-lg bg-sunken px-4 py-3">
            <p className="flex-1 text-ui text-ink-2">Gmail isn’t answering.<SaysLoadFailure /></p>
            <Button variant="ghost" size="sm" onClick={() => void load(applied)}>
              Try again
            </Button>
          </div>
        )}
        {threads && threads.length === 0 && !listError && (
          applied ? (
            <div data-inbox-state="search" className="flex flex-col items-start px-6 pt-16">
              <SpotSearchV3 className="mb-4" />
              <p className="text-heading font-semibold text-foreground">Nothing matches “{applied}”</p>
              <p className="mt-1 text-ui text-ink-2">Check the spelling, or try fewer words.</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setQuery(""); setApplied("") }}>
                Clear search
              </Button>
            </div>
          ) : (
            <InboxZero />
          )
        )}
        <ul>
          {threads?.map((t, i) => (
            <HubRow
              key={t.id}
              as="li"
              opens
              density="feed"
              leadSize={28}
              className="min-h-[72px] py-2.5"
              unread={t.unread}
              // The open thread is selected; the keyboard's place is a ring of its own (SH-30).
              selected={openId === t.id}
              cursor={cursor === i && openId !== t.id}
              data-inbox-row=""
              lead={<IdentityMark variant="avatar" size={28} id={avatarSeed(senderName(t.from))} label={senderName(t.from)} />}
              title={
                // The row's one control, stretched over it.
                <button
                  type="button"
                  onClick={() => {
                    setCursor(i)
                    void open(t.id)
                  }}
                  aria-current={openId === t.id || undefined}
                  className="text-left text-ui font-medium text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand"
                >
                  {senderName(t.from)}
                  {t.messages > 1 && <span className="ml-1.5 text-meta font-book tabular-nums text-ink-3">{t.messages}</span>}
                </button>
              }
              second={<span className="text-foreground">{t.subject || "(no subject)"}</span>}
              meta={shortDate(t.date)}
            >
              <span className="block truncate text-ui-sm text-ink-3">{t.snippet}</span>
            </HubRow>
          ))}
        </ul>
        {nextToken && (
          <div className="p-3">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const detail = (
    <div data-inbox-reader="" className={cn("flex min-h-0 flex-1 flex-col", !openId && "hidden md:flex", openId && "hub-panel-in md:animate-none")}>
      {!openId && (
        // The one centred empty state in the hub: the pane is the frame.
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <SpotEnvelope size={64} />
          <p className="text-ui text-ink-2">Pick a conversation</p>
        </div>
      )}
      {openId && (
        <>
          <div data-inbox-thread-bar="" className="flex min-h-14 shrink-0 items-start gap-2 border-b border-line px-3 py-3 md:px-6">
            <Button variant="ghost" size="icon" className="size-11 shrink-0 md:hidden" onClick={() => setOpenId(null)} aria-label="Back to the inbox">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="mr-auto min-w-0 flex-1 self-center">
              <h2 className="line-clamp-2 text-title-3 font-semibold text-balance">{thread?.subject || " "}</h2>
              {thread ? <p className="mt-0.5 text-meta text-ink-3">{threadByline(thread.messages)}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-center">
              <Button variant="secondary" size="sm" onClick={makeTask} disabled={!thread} title="Make a task (T)">
                <CircleCheck className="size-3.5" /> Make a task
              </Button>
              {thread && (
                <Button asChild variant="ghost" size="icon-sm">
                  <a href={thread.gmail_url} target="_blank" rel="noopener noreferrer" aria-label="Open in Gmail" title="Open in Gmail (O)">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[720px] px-4 py-5 md:px-6" data-inbox-measure="">
              {threadError && <p className="text-ui-sm text-danger-ink">{threadError}</p>}
              {!thread && !threadError && (
                // A message's own shape while the conversation opens, no box.
                <div role="status" aria-label="Opening the conversation">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="size-7 animate-shimmer rounded-full bg-press" />
                    <span className="h-3.5 w-40 animate-shimmer rounded-sm bg-press" />
                  </div>
                  <div className="space-y-2 pl-10">
                    <div className="h-3.5 w-11/12 animate-shimmer rounded-sm bg-press" />
                    <div className="h-3.5 w-4/5 animate-shimmer rounded-sm bg-press" />
                    <div className="h-3.5 w-2/3 animate-shimmer rounded-sm bg-press" />
                  </div>
                </div>
              )}
              {thread ? <Conversation messages={thread.messages} gmailUrl={thread.gmail_url} /> : null}
            </div>
          </div>
          {thread && (
            <form
              className="shrink-0 px-4 pb-4 md:px-6"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <div className="mx-auto max-w-[720px]">
                {sendError ? (
                  <p role="alert" className="mb-2 flex items-center gap-2 text-meta text-danger-ink">
                    {sendError}
                    <button type="submit" className="font-medium underline-offset-2 hover:underline">
                      Try again
                    </button>
                  </p>
                ) : null}
                <div data-inbox-composer="" className="composer-card flex min-h-[76px] flex-col rounded-lg bg-raised p-3">
                  <textarea
                    ref={replyRef}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                    placeholder={`Reply to ${senderName(thread.messages[thread.messages.length - 1]?.from || "") || "them"}…`}
                    aria-label="Reply"
                    rows={2}
                    className="min-h-10 w-full flex-1 resize-none bg-transparent text-ui text-foreground outline-none placeholder:text-ink-3"
                  />
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className="flex items-center gap-1 text-meta text-ink-3">
                      <kbd className="kbd">{sendKeys}</kbd> send
                    </span>
                    <button
                      type="submit"
                      aria-label="Send reply"
                      disabled={!reply.trim() || sending}
                      className={cn(
                        "grid size-7 place-items-center rounded-md transition-colors",
                        reply.trim() ? "bg-brand text-brand-foreground shadow-primary" : "bg-press text-ink-3",
                      )}
                    >
                      {sending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {list}
        {detail}
      </div>
    </div>
  )
}

/** Connect, reconnect and the demo's explanation (I2): a 440px column at 18vh. */
function ConnectFrame({ spot, title, body, action, privacy }: { spot: React.ReactNode; title: string; body: string; action?: React.ReactNode; privacy?: boolean }) {
  return (
    <div data-inbox-connect="" className="mx-auto flex w-full max-w-[440px] flex-col items-center px-6 pt-[18vh] text-center">
      {spot}
      <h1 className="mt-5 text-title-2 font-semibold">{title}</h1>
      <p className="mt-2 text-ui text-ink-2 text-pretty">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
      {privacy ? (
        <p className="mt-3 flex items-center gap-1.5 text-meta text-ink-3">
          <Lock className="size-3" /> Only you can see your mail here.
        </p>
      ) : null}
    </div>
  )
}

/** The messages of a conversation (I6): no boxes, earlier ones folded. */
function Conversation({ messages, gmailUrl }: { messages: InboxMessage[]; gmailUrl: string }) {
  const [folded, setFolded] = useState(() => foldedAtStart(messages.length))
  useEffect(() => setFolded(foldedAtStart(messages.length)), [messages.length])
  return (
    <div className="divide-y divide-line">
      {messages.map((m, i) =>
        folded.has(i) ? (
          <button
            key={m.id}
            type="button"
            data-inbox-folded=""
            onClick={() =>
              setFolded((f) => {
                const next = new Set(f)
                next.delete(i)
                return next
              })
            }
            className="flex h-11 w-full items-center gap-3 text-left text-ui-sm hover:bg-hover"
          >
            <IdentityMark variant="avatar" size={20} id={avatarSeed(senderName(m.from))} label={senderName(m.from)} />
            <span className="shrink-0 font-medium">{senderName(m.from)}</span>
            <span className="min-w-0 flex-1 truncate text-ink-3">{htmlText(m.body).slice(0, 140)}</span>
            <time dateTime={m.date} className="shrink-0 text-meta tabular-nums text-ink-3">{mailDate(m.date)}</time>
          </button>
        ) : (
          <Message key={m.id} m={m} gmailUrl={gmailUrl} />
        ),
      )}
    </div>
  )
}

function Message({ m, gmailUrl }: { m: InboxMessage; gmailUrl: string }) {
  const [showQuoted, setShowQuoted] = useState(false)
  const { body, quoted } = useMemo(() => splitQuoted(m.body), [m.body])
  return (
    <article data-inbox-message="" className="py-5 first:pt-0">
      <header className="flex items-center gap-3">
        <IdentityMark variant="avatar" size={28} id={avatarSeed(senderName(m.from))} label={senderName(m.from)} />
        <span className="truncate text-ui font-medium">{senderName(m.from)}</span>
        <span className="hidden truncate text-meta text-ink-3 sm:inline">{senderAddress(m.from)}</span>
        <time dateTime={m.date} title={fullDate(m.date)} className="ml-auto shrink-0 text-meta tabular-nums text-ink-3">
          {mailDate(m.date)}
        </time>
      </header>
      <div className="mt-2 pl-10 text-body">
        <SafeHtml html={body} sanitizer={sanitizeRichHtml} className="max-w-none break-words" />
        {quoted ? (
          <>
            <button
              type="button"
              aria-label={showQuoted ? "Hide the quoted text" : "Show the quoted text"}
              aria-expanded={showQuoted}
              onClick={() => setShowQuoted((s) => !s)}
              className="hub-chip-rest mt-2 grid h-4 w-8 place-items-center rounded-sm text-ink-3 hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {showQuoted ? <SafeHtml html={quoted} sanitizer={sanitizeRichHtml} className="mt-2 max-w-none break-words text-ink-2" /> : null}
          </>
        ) : null}
        {(m.truncated || (m.attachments ?? 0) > 0) && (
          <p className="mt-3 text-meta text-ink-3">
            {m.truncated ? "This email is long and was shortened here. " : ""}
            {(m.attachments ?? 0) > 0 ? `${m.attachments} attachment${m.attachments === 1 ? "" : "s"}: ` : ""}
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="underline">
              open in Gmail
            </a>
          </p>
        )}
      </div>
    </article>
  )
}

/**
 * Inbox zero (I10): the moss envelope with its check, start-aligned in the
 * list. The check springs, and the day's first inbox zero bursts once
 * (celebrateOnce); both stand still for reduced motion.
 */
function InboxZero() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    springPop(ref.current)
    celebrateOnce("inbox-zero", ref.current, { count: 8 })
  }, [])
  return (
    <div data-inbox-state="zero" className="flex flex-col items-start px-6 pt-16">
      <span ref={ref} data-inbox-zero="" className="inline-flex">
        <SpotEnvelope size={96} hue="moss" badge="done" />
      </span>
      <p className="mt-4 text-heading font-semibold text-foreground">Inbox zero</p>
      <p className="mt-1 text-ui text-ink-2">Nothing new in Gmail. Back to the work.</p>
    </div>
  )
}
