"use client"

// The pieces every guest page shares: the name a guest is known by, how a
// message reads, the box they write in, the page a dead link shows, and what a
// page says while the server is busy or out of reach (it keeps trying; only a
// dead link stops it). A guest has no account, so their name lives in this
// browser, per link.

import { useEffect, useState } from "react"
import { AlertCircle, Loader2, Send } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { GuestChannelMessage } from "@/services/guestService"
import { publicTrouble, retryingText, type PublicResult, type PublicTrouble } from "@/services/publicApi"

export const GUEST_POLL_MS = 5000

/** After "too many requests", a minute before asking again. */
export const GUEST_BUSY_RETRY_MS = 60_000

/**
 * A guest page's first answer, asked for again while the server is busy or
 * out of reach (trouble says which), and given up on only when the link is
 * gone. One asker per key.
 */
export function useGuestAnswer<T>(key: string, ask: () => Promise<PublicResult<T>>) {
  const [answer, setAnswer] = useState<{ data: T | null; trouble: PublicTrouble | null }>({ data: null, trouble: null })
  useEffect(() => {
    let alive = true
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
      if (trouble !== "gone") timer = setTimeout(attempt, trouble === "busy" ? GUEST_BUSY_RETRY_MS : GUEST_POLL_MS)
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

export const guestWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })

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

/** Asks for the guest's name before they can write. */
export function GuestNameForm({ onName }: { onName: (name: string) => void }) {
  const [draft, setDraft] = useState("")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim()) onName(draft.trim())
      }}
      className="flex gap-2 border-t p-3"
    >
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your name, as the team will see it" aria-label="Your name" maxLength={60} autoFocus />
      <Button type="submit" disabled={!draft.trim()}>Continue</Button>
    </form>
  )
}

export function GuestMessageView({ m }: { m: Pick<GuestChannelMessage, "author" | "text" | "created_at"> }) {
  return (
    <article>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{m.author}</span>
        <time className="text-xs text-muted-foreground" dateTime={m.created_at}>{guestWhen(m.created_at)}</time>
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
    </article>
  )
}

/** A message box: Enter sends, Shift+Enter breaks the line. onSend answers an error to show, or null. */
export function GuestComposer({ placeholder, onSend, name, onRename }: { placeholder: string; onSend: (text: string) => Promise<string | null>; name?: string; onRename?: () => void }) {
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
      <div className="flex items-end gap-2">
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
        <Button size="icon" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {name && onRename && (
        <p className="mt-1 text-xs text-muted-foreground">
          Posting as {name} (guest).{" "}
          <button type="button" className="underline" onClick={onRename}>Change</button>
        </p>
      )}
    </div>
  )
}

export function GuestCentered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">{children}</main>
}

export function GuestLoading() {
  return <GuestCentered><Loader2 className="h-7 w-7 animate-spin text-primary" /></GuestCentered>
}

export function GuestLinkGone({ detail = "It may have expired or been turned off. Ask the person who invited you for a new one." }: { detail?: string }) {
  return (
    <GuestCentered>
      <AlertCircle className="h-8 w-8 text-muted-foreground" />
      <p className="text-base font-semibold">This link is no longer available</p>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
    </GuestCentered>
  )
}

/**
 * What a guest page shows before its first answer: loading, why it's still
 * trying, or the dead link.
 */
export function GuestNotYet({ trouble, loading = <GuestLoading />, gone = <GuestLinkGone /> }: { trouble: PublicTrouble | null; loading?: React.ReactNode; gone?: React.ReactNode }) {
  if (trouble === "gone") return <>{gone}</>
  if (trouble)
    return (
      <GuestCentered>
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
        <p role="status" className="text-sm text-muted-foreground">{retryingText[trouble]}</p>
      </GuestCentered>
    )
  return <>{loading}</>
}

/** Above a page still showing what it last had, while it can't refresh. */
export function GuestTroubleNote({ trouble }: { trouble: PublicTrouble | null }) {
  if (!trouble || trouble === "gone") return null
  return <p role="status" className="border-b bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">{retryingText[trouble]}</p>
}
