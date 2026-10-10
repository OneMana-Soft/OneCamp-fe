"use client"

/**
 * InboxPage: the person's own Gmail inside OneCamp.
 *
 * Email is where a lot of work arrives, and it used to arrive in another tab.
 * Here a person reads it beside the work: one click summarises a long
 * conversation, another turns it into a task that links back to the email,
 * and a reply goes out from their own address in the same conversation.
 *
 * Bodies arrive sanitised by the server with remote images removed (an image
 * URL is how a sender learns an email was opened) and are sanitised again here.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { ArrowLeft, ExternalLink, Inbox as InboxIcon, Loader2, Mail, Search, Sparkles, CircleCheck, Send } from "@/lib/icons"
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
  replyToThread,
  senderName,
  shortDate,
  summarizeThread,
  type ConnectionProblem,
  type InboxThread,
  type InboxThreadDetail,
} from "@/services/inboxService"
import { useAIAvailable } from "@/hooks/useClientConfig"

function htmlText(html: string): string {
  if (typeof document === "undefined") return ""
  const el = document.createElement("div")
  el.innerHTML = sanitizeRichHtml(html)
  return (el.textContent || "").trim()
}


export default function InboxPage() {
  const { toast } = useToast()
  const dispatch = useDispatch()
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
  const [summary, setSummary] = useState("")
  const [summarizing, setSummarizing] = useState(false)
  const aiAvailable = useAIAvailable()
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)

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
    setSummary("")
    setReply("")
    try {
      const t = await getInboxThread(id)
      if (seq === openSeq.current) setThread(t)
    } catch (e) {
      if (seq !== openSeq.current || handledAsConnection(e)) return
      setThreadError(apiErrorMessage(e, "Couldn't open this email."))
    }
  }, [handledAsConnection])

  const summarize = async () => {
    if (!openId) return
    const seq = openSeq.current
    setSummarizing(true)
    try {
      const text = await summarizeThread(openId)
      if (seq === openSeq.current) setSummary(text)
    } catch (e) {
      if (!handledAsConnection(e)) toast({ title: "No summary", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setSummarizing(false)
    }
  }

  const makeTask = () => {
    if (!thread) return
    const last = thread.messages[thread.messages.length - 1]
    const text = summary || (last ? htmlText(last.body) : "")
    const { draft, source } = taskFromEmail(thread.subject, last ? senderName(last.from) : "", text, thread.gmail_url)
    dispatch(openUI({ key: "createTask", data: { draft, source } }))
  }

  const send = async () => {
    if (!openId || !reply.trim()) return
    setSending(true)
    try {
      await replyToThread(openId, reply)
      setReply("")
      toast({ title: "Reply sent", description: "It went from your Gmail address, in the same conversation." })
      await open(openId)
    } catch (e) {
      // The draft stays in the box, so nothing typed is lost.
      if (!handledAsConnection(e)) toast({ title: "Not sent", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setSending(false)
    }
  }

  if (connection) {
    const reconnect = connection === "reconnect"
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <Mail className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{reconnect ? "Reconnect Gmail" : "Bring your email into OneCamp"}</h1>
        <p className="text-sm text-muted-foreground">
          {reconnect
            ? "Your Gmail connection expired or no longer has the access the inbox needs. Connect it again to pick up where you left off."
            : "Connect Gmail to read your inbox here, summarise long conversations, turn an email into a task, and reply without leaving the workspace. Only you can see your mail."}
        </p>
        <Button onClick={() => void startConnect("gmail", "inbox").catch((e) => toast({ title: "Couldn't connect", description: apiErrorMessage(e, "Try again."), variant: "destructive" }))}>
          {reconnect ? "Reconnect Gmail" : "Connect Gmail"}
        </Button>
      </div>
    )
  }

  const list = (
    <div className={cn("flex min-h-0 flex-col border-border md:w-[22rem] md:border-r", openId && "hidden md:flex")}>
      <form
        className="flex items-center gap-2 border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(query.trim())
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mail" className="pl-8" aria-label="Search mail" />
        </div>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads === null && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {listError && <p className="p-4 text-sm text-danger-ink">{listError}</p>}
        {threads && threads.length === 0 && !listError && (
          <p className="p-6 text-center text-sm text-muted-foreground">{applied ? "Nothing matches that search." : "Your inbox is empty."}</p>
        )}
        <ul>
          {threads?.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => void open(t.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
                  openId === t.id && "bg-accent",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", t.unread ? "font-semibold" : "text-foreground/80")}>
                    {senderName(t.from)}
                    {t.messages > 1 && <span className="ml-1 text-xs text-muted-foreground">{t.messages}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{shortDate(t.date)}</span>
                </span>
                <span className={cn("truncate text-sm", t.unread && "font-medium")}>{t.subject || "(no subject)"}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{t.snippet}</span>
              </button>
            </li>
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
    <div className={cn("flex min-h-0 flex-1 flex-col", !openId && "hidden md:flex")}>
      {!openId && (
        <div className="m-auto flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <InboxIcon className="h-8 w-8" />
          Choose a conversation
        </div>
      )}
      {openId && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpenId(null)} aria-label="Back to the inbox">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="mr-auto min-w-0 flex-1 truncate text-base font-semibold">{thread?.subject || " "}</h2>
            {aiAvailable && (
              <Button variant="outline" size="sm" onClick={() => void summarize()} disabled={!thread || summarizing}>
                {summarizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Summarise
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={makeTask} disabled={!thread}>
              <CircleCheck className="mr-2 h-4 w-4" /> Make a task
            </Button>
            {thread && (
              <Button asChild variant="ghost" size="sm">
                <a href={thread.gmail_url} target="_blank" rel="noopener noreferrer" aria-label="Open in Gmail">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {threadError && <p className="text-sm text-danger-ink">{threadError}</p>}
            {!thread && !threadError && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Opening…
              </p>
            )}
            {summary && (
              <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Summary
                </p>
                <p className="whitespace-pre-wrap text-sm">{summary}</p>
              </div>
            )}
            <div className="space-y-4">
              {thread?.messages.map((m) => (
                <article key={m.id} className="rounded-lg border border-border p-4">
                  <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{senderName(m.from)}</span>
                    <span className="text-xs text-muted-foreground">{fullDate(m.date)}</span>
                  </header>
                  <SafeHtml html={m.body} sanitizer={sanitizeRichHtml} className="prose prose-sm max-w-none break-words dark:prose-invert" />
                  {(m.truncated || (m.attachments ?? 0) > 0) && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {m.truncated ? "This email is long and was shortened here. " : ""}
                      {(m.attachments ?? 0) > 0 ? `${m.attachments} attachment${m.attachments === 1 ? "" : "s"}: ` : ""}
                      <a href={thread.gmail_url} target="_blank" rel="noopener noreferrer" className="underline">
                        open in Gmail
                      </a>
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
          {thread && (
            <form
              className="flex items-end gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                aria-label="Reply"
                rows={2}
                className="min-h-[2.5rem] flex-1 resize-y"
              />
              <Button type="submit" disabled={!reply.trim() || sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Reply
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {list}
      {detail}
    </div>
  )
}
