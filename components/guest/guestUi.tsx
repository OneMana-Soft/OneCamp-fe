"use client"

// The pieces every guest page shares: the name a guest is known by, how a
// message reads, the box they write in, the page a dead link shows, and what a
// page says while the server is busy or out of reach (it keeps trying; only a
// dead link stops it). A guest has no account, so their name lives in this
// browser, per link.

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Loader2, Send } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tile } from "@/components/ui/graphics/Tile"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import type { GuestChannelMessage } from "@/services/guestService"
import { format } from "date-fns"
import { fullDateTime, shortDateTime, shortTime } from "@/lib/utils/date/shortDate"
import { publicTrouble, retryDelayMs, retryingText, type PublicResult, type PublicTrouble } from "@/services/publicApi"

export const GUEST_POLL_MS = 5000

/**
 * The workspace's identity hue, which every page it shows to a guest wears: a
 * band across the top, and the page's type icon on a tile in it. From the
 * app's own address, fixed at build time, so the server and the browser agree
 * and a client meets the same colour on every link this workspace sends.
 */
export const GUEST_HUE = hueFor(process.env.NEXT_PUBLIC_APP_URL || "onecamp")

/** The thin band of the workspace's hue across the top of a guest page. */
export function GuestBand({ className }: { className?: string }) {
  return <div aria-hidden="true" data-guest-band="" className={cn(HUE_CLASS[GUEST_HUE], "h-1 w-full shrink-0 bg-hue", className)} />
}

/** A guest page's type icon (doc, board, table, channel, project, call), on a tile in the workspace's hue. */
export function GuestTypeTile({ children }: { children: ReactNode }) {
  return (
    <Tile hue={GUEST_HUE} size="sm">
      {children}
    </Tile>
  )
}

/** How much of a guest's name the server keeps (business/Guest maxGuestNameLen). */
export const GUEST_NAME_MAX = 40

/**
 * A guest page's first answer, asked for again while the server is busy or
 * out of reach (trouble says which), waiting longer after each failure and as
 * long as the server's Retry-After says (retryDelayMs), and given up on only
 * when the link is gone. One asker per key.
 */
export function useGuestAnswer<T>(key: string, ask: () => Promise<PublicResult<T>>) {
  const [answer, setAnswer] = useState<{ data: T | null; trouble: PublicTrouble | null }>({ data: null, trouble: null })
  useEffect(() => {
    let alive = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async () => {
      const res = await ask()
      if (!alive) return
      if (res.ok) {
        setAnswer({ data: res.data, trouble: null })
        return
      }
      const trouble = publicTrouble(res.status)
      setAnswer({ data: null, trouble })
      if (trouble !== "gone") timer = setTimeout(attempt, retryDelayMs(failures++, res.retryAfter))
    }
    void attempt()
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one asker per key
  }, [key])
  return answer
}

/** What one poll came to: whether it worked, and the server's Retry-After when it didn't. */
export type GuestPollOutcome = { ok: boolean; retryAfter?: number }

/** A poll's outcome from a public call's result. Pure. */
export const pollOutcome = (res: PublicResult<unknown>): GuestPollOutcome => (res.ok ? { ok: true } : { ok: false, retryAfter: res.retryAfter })

/**
 * Keeps a guest page up to date: tick now (first is true), then every everyMs
 * while the page is shown. After a failure it waits longer each time, from 5
 * seconds up to a minute, and as long as the server's Retry-After says
 * (retryDelayMs), so a page left open on a server that is down or busy asks
 * less and less instead of every few seconds. One poller per key.
 */
export function useGuestPoll(key: string, everyMs: number, tick: (first: boolean) => Promise<GuestPollOutcome>) {
  const latest = useRef(tick)
  useEffect(() => {
    latest.current = tick
  })
  useEffect(() => {
    let alive = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async (first: boolean) => {
      if (!first && document.visibilityState !== "visible") {
        timer = setTimeout(() => void run(false), everyMs)
        return
      }
      const out = await latest.current(first)
      if (!alive) return
      if (out.ok) failures = 0
      timer = setTimeout(() => void run(false), out.ok ? everyMs : retryDelayMs(failures++, out.retryAfter))
    }
    void run(true)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key, everyMs])
}

const WEEK_MS = 6 * 24 * 60 * 60 * 1000

/**
 * When a guest message was written, in the app's one format: "Fri 3:10 PM"
 * within the last few days, "3 Oct, 3:10 PM" once it is older (a weekday
 * alone put a three-week-old comment in this week), with the year when it
 * isn't this one. Pure given now.
 */
export function guestWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const age = now.getTime() - d.getTime()
  if (age >= 0 && age < WEEK_MS) return `${format(d, "EEE")} ${shortTime(d)}`
  return shortDateTime(d, now)
}

const nameKey = (token: string) => `oc_guest_name_${token.slice(0, 12)}`

/** The guest's name for this link, remembered in this browser when it can be. */
export function useGuestName(token: string) {
  const [name, setNameState] = useState("")
  useEffect(() => {
    try {
      setNameState(localStorage.getItem(nameKey(token)) ?? "")
    } catch {
      /* storage blocked: they type it again */
    }
  }, [token])
  const setName = (n: string) => {
    setNameState(n)
    try {
      if (n) localStorage.setItem(nameKey(token), n)
    } catch {
      /* fine: kept for this visit */
    }
  }
  return [name, setName] as const
}

/**
 * Asks for the guest's name before they can write. The cursor goes to it on a
 * computer; on a phone it would pull the keyboard up over the page the guest
 * came to read, so there it waits for a tap.
 */
export function GuestNameForm({ onName }: { onName: (name: string) => void }) {
  const [draft, setDraft] = useState("")
  const box = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) box.current?.focus()
  }, [])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim()) onName(draft.trim())
      }}
      className="border-t p-3"
    >
      <div className="mx-auto grid w-full max-w-3xl gap-1.5">
        <label htmlFor={id} className="text-xs text-muted-foreground">Your name, as the team will see it</label>
        <div className="flex gap-2">
          <Input ref={box} id={id} name="name" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" maxLength={GUEST_NAME_MAX} />
          <Button type="submit" disabled={!draft.trim()}>Continue</Button>
        </div>
      </div>
    </form>
  )
}

export function GuestMessageView({ m }: { m: Pick<GuestChannelMessage, "author" | "text" | "created_at"> }) {
  return (
    <article>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{m.author}</span>
        <time className="text-xs text-muted-foreground" dateTime={m.created_at} title={fullDateTime(new Date(m.created_at))}>{guestWhen(m.created_at)}</time>
      </p>
      {/* A readable measure: the column is wide enough to run a line past
          a hundred characters. */}
      <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{m.text}</p>
    </article>
  )
}

/**
 * A message box: Enter sends, Shift+Enter breaks the line. onSend answers an
 * error to show, or null. `quiet` draws Send in outline, for a panel whose one
 * filled button is something else (a client's verdict on a task).
 */
export function GuestComposer({ placeholder, onSend, name, onRename, quiet = false }: { placeholder: string; onSend: (text: string) => Promise<string | null>; name?: string; onRename?: () => void; quiet?: boolean }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError("")
    const err = await onSend(text)
    setBusy(false)
    if (err) setError(err)
    else setText("")
  }
  return (
    <div className="border-t p-3">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          maxLength={4000}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button size="icon" variant={quiet ? "outline" : "default"} onClick={send} disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {error && <p role="alert" className="mx-auto mt-1 max-w-3xl text-xs text-danger-ink">{error}</p>}
      {name && onRename && (
        <p className="mx-auto mt-1 max-w-3xl text-xs text-muted-foreground">
          Posting as {name} (guest).{" "}
          <button type="button" className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70" onClick={onRename}>Change</button>
        </p>
      )}
    </div>
  )
}

export function GuestCentered({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <GuestBand className="absolute inset-x-0 top-0" />
      {children}
    </main>
  )
}

/** The shape of the page a guest link opens, held while it loads. */
export type GuestPageShape = "page" | "chat" | "board" | "table" | "call"

/**
 * What a guest page shows before its first answer: the page's own shape, with
 * what is happening in words where its title will be. A centred spinner used
 * to stand in for every page, and the page then arrived all at once.
 */
export function GuestPageSkeleton({ label, shape = "page" }: { label: string; shape?: GuestPageShape }) {
  if (shape === "call") {
    return (
      <GuestCentered>
        <div aria-busy="true" className="grid w-full max-w-md gap-3 text-left">
          <p role="status" className="text-sm text-muted-foreground">{label}</p>
          <Skeleton aria-hidden="true" className="aspect-video w-full rounded-lg" />
          <Skeleton aria-hidden="true" className="h-9 w-full" />
        </div>
      </GuestCentered>
    )
  }
  return (
    <div aria-busy="true" className="flex min-h-dvh w-full flex-col bg-background">
      <GuestBand />
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <Skeleton aria-hidden="true" className="h-6 w-6 shrink-0" />
        <p role="status" className="truncate text-sm text-muted-foreground">{label}</p>
      </div>
      {shape === "page" && (
        <div aria-hidden="true" className="mx-auto grid w-full max-w-3xl gap-3 px-4 py-8 sm:px-6">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
      {shape === "chat" && (
        <div aria-hidden="true" className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className={i % 2 ? "h-3 w-2/3" : "h-3 w-5/6"} />
            </div>
          ))}
        </div>
      )}
      {shape === "table" && (
        <div aria-hidden="true" className="mx-auto grid w-full max-w-6xl gap-2 px-4 py-8 sm:px-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className={i === 0 ? "h-8 w-full" : "h-6 w-full"} />
          ))}
        </div>
      )}
      {shape === "board" && (
        <div aria-hidden="true" className="grid w-full flex-1 gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid content-start gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GuestLoading() {
  return <GuestPageSkeleton label="Opening the link…" />
}

export function GuestLinkGone({ detail = "It may have expired or been turned off. Ask the person who invited you for a new one." }: { detail?: string }) {
  return (
    <GuestCentered>
      <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-base font-semibold">This link is no longer available</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
    </GuestCentered>
  )
}

/**
 * What a guest page shows before its first answer: the page's shape while it
 * loads (saying what it is opening), the same shape saying why it is still
 * trying, or the dead link.
 */
export function GuestNotYet({
  trouble,
  shape = "page",
  label = "Opening the link…",
  loading,
  gone = <GuestLinkGone />,
}: {
  trouble: PublicTrouble | null
  shape?: GuestPageShape
  label?: string
  loading?: React.ReactNode
  gone?: React.ReactNode
}) {
  if (trouble === "gone") return <>{gone}</>
  if (trouble) return <GuestPageSkeleton label={retryingText[trouble]} shape={shape} />
  return <>{loading ?? <GuestPageSkeleton label={label} shape={shape} />}</>
}

/**
 * A side panel's body before its first answer: the shape of what is coming,
 * and, while the server is busy or out of reach, why it is still trying. A
 * spinner here used to turn for as long as the server was down.
 */
export function GuestPanelPending({ trouble }: { trouble: PublicTrouble | null }) {
  return (
    <div aria-busy="true" className="grid gap-3">
      {trouble && trouble !== "gone" ? (
        <p role="status" className="text-sm text-muted-foreground">{retryingText[trouble]}</p>
      ) : (
        <p role="status" className="sr-only">Loading…</p>
      )}
      <div aria-hidden="true" className="grid gap-2.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  )
}

/** Above a page still showing what it last had, while it can't refresh. */
export function GuestTroubleNote({ trouble }: { trouble: PublicTrouble | null }) {
  if (!trouble || trouble === "gone") return null
  return <p role="status" className="border-b bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">{retryingText[trouble]}</p>
}
