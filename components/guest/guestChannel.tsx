"use client"

// The guest channel's own pieces (design v3, admin §7 G3): the app's message
// row for a guest, day dividers, the name gate that becomes the composer, and
// the guest's side of the header. The page sits in content's PublicFrame
// (G1), the one frame every guest page shares: its band, mark, header and
// "Made with OneCamp" credit.

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { format, isSameDay, subDays } from "date-fns"
import { Loader2, Send } from "@/lib/icons"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PrincipalTag } from "@/components/ui/principalTag"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { relayInitials } from "@/lib/relayedAuthor"
import { cn } from "@/lib/utils/helpers/cn"
import { fullDateTime } from "@/lib/utils/date/shortDate"
import { GUEST_NAME_MAX, guestWhen } from "@/components/guest/guestUi"

/** A person's avatar v3: the gradient in their hue (hueFor(name)) with white initials. */
export function GuestAvatar({ name, size = 36 }: { name: string; size?: 36 | 22 }) {
  return (
    <Avatar data-guest-avatar="" className={size === 36 ? "size-9" : "size-[22px]"}>
      <AvatarFallback className={cn(getAvatarFallbackClass(name), size === 36 ? "text-xs font-semibold" : "text-3xs font-semibold")}>
        {relayInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** "Today", "Yesterday", or "Fri 9 Oct" (with the year when it isn't this one). Pure given now. */
export function guestDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (isSameDay(d, now)) return "Today"
  if (isSameDay(d, subDays(now, 1))) return "Yesterday"
  return format(d, d.getFullYear() === now.getFullYear() ? "EEE d MMM" : "EEE d MMM yyyy")
}

/** The day between two messages: an e1 pill, centred. */
export function GuestDayDivider({ iso }: { iso: string }) {
  return (
    <li role="separator" aria-label={guestDayLabel(iso)} className="guest-day flex justify-center py-2">
      <span className="rounded-full bg-raised px-2.5 py-0.5 text-2xs font-medium text-muted-foreground shadow-e1">{guestDayLabel(iso)}</span>
    </li>
  )
}

/**
 * A message in the app's row (DESIGN_V3 §2a): a 36px avatar, the name at
 * 14/590, the time at 12 tabular ink-3, and the body at 15/23 on a 760px
 * measure. The guest's own messages carry the Guest tag. A message still on
 * its way shows at 60 %; one that didn't go says so with a Retry.
 */
export function GuestChannelRow({
  author,
  text,
  createdAt,
  own = false,
  pending = false,
  failed = false,
  onRetry,
  children,
}: {
  author: string
  text: string
  createdAt: string
  own?: boolean
  pending?: boolean
  failed?: boolean
  onRetry?: () => void
  children?: ReactNode
}) {
  return (
    <article data-pending={pending || undefined} className={cn("guest-row grid grid-cols-[36px_minmax(0,1fr)] gap-x-3", pending && "opacity-60")}>
      <GuestAvatar name={author} />
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{author}</span>
          {own && <PrincipalTag kind="guest" className="self-center" />}
          <time className="shrink-0 text-2xs tabular-nums text-faint-foreground" dateTime={createdAt} title={fullDateTime(new Date(createdAt))}>
            {pending ? "Sending…" : guestWhen(createdAt)}
          </time>
        </p>
        <p className="text-body max-w-[760px] whitespace-pre-wrap break-words text-foreground">{text}</p>
        {failed && (
          <p role="alert" className="mt-0.5 text-2xs text-danger-ink">
            Couldn&apos;t send.{" "}
            <button type="button" onClick={onRetry} className="rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
              Retry
            </button>
          </p>
        )}
        {children}
      </div>
    </article>
  )
}

/**
 * The guest channel's side of the shared header (G1 on content's
 * PublicFrame): the Guest tag and, once given, the guest's own name chip,
 * which opens "Change name".
 */
export function GuestChannelActions({ name, onRename }: { name: string; onRename?: () => void }) {
  return (
    <>
      <PrincipalTag kind="guest" />
      {name && onRename && (
        <button
          type="button"
          onClick={onRename}
          title="Change name"
          className="flex h-7 items-center gap-1.5 rounded-full bg-raised py-0.5 pl-0.5 pr-2.5 text-xs font-medium shadow-e1 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <GuestAvatar name={name} size={22} />
          <span className="max-w-32 truncate">{name}</span>
          <span className="sr-only">, change name</span>
        </button>
      )}
    </>
  )
}

/**
 * The floating composer card (r12, e2) that asks for the guest's name first,
 * then becomes the composer (G3): after Continue the label fades out as the
 * message box and its placeholder fade in, 220ms, in the same card. Enter
 * sends, Shift+Enter breaks the line. Send is a 28px r8 brand square.
 *
 * onSend answers an error to show, or null. With `optimistic`, the box empties
 * at once and the page shows the message on its way (and any failure under
 * it), so nothing waits here.
 */
export function GuestGateComposer({
  name,
  onName,
  placeholder,
  onSend,
  optimistic = false,
}: {
  name: string
  onName: (name: string) => void
  placeholder: string
  onSend: (text: string) => Promise<string | null>
  optimistic?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The name gate stays on screen for one crossfade after Continue.
  const [leaving, setLeaving] = useState(false)
  const nameBox = useRef<HTMLInputElement>(null)
  const messageBox = useRef<HTMLTextAreaElement>(null)
  const id = useId()

  useEffect(() => {
    if (!name && window.matchMedia?.("(pointer: fine)").matches) nameBox.current?.focus()
  }, [name])

  const submitName = (e: React.FormEvent) => {
    e.preventDefault()
    const n = draft.trim()
    if (!n) return
    setLeaving(true)
    onName(n)
    setTimeout(() => setLeaving(false), 220)
    requestAnimationFrame(() => messageBox.current?.focus())
  }

  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setError("")
    if (optimistic) {
      setText("")
      void onSend(text)
      return
    }
    setBusy(true)
    const err = await onSend(text)
    setBusy(false)
    if (err) setError(err)
    else setText("")
  }

  const showGate = !name || leaving
  return (
    <div className="guest-dock px-3 pb-3 sm:px-5 sm:pb-4">
      <div data-guest-composer={name ? "compose" : "name"} className="guest-card mx-auto grid w-full max-w-[808px] rounded-lg bg-raised p-2 shadow-e2">
        {showGate && (
          <form
            onSubmit={submitName}
            data-leaving={leaving || undefined}
            inert={leaving || undefined}
            aria-hidden={leaving || undefined}
            className="guest-gate col-start-1 row-start-1 grid gap-1.5 px-1 pt-1"
          >
            <label htmlFor={id} className="text-xs font-medium text-foreground">Your name, as the team will see it</label>
            <div className="flex gap-2">
              <Input ref={nameBox} id={id} name="name" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" maxLength={GUEST_NAME_MAX} />
              <Button type="submit" size="sm" className="h-8" disabled={!draft.trim()}>Continue</Button>
            </div>
          </form>
        )}
        {name && (
          <div data-entering={leaving || undefined} className="guest-compose col-start-1 row-start-1 flex items-end gap-2">
            <textarea
              ref={messageBox}
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
              className="text-body max-h-40 min-h-8 flex-1 resize-none bg-transparent px-2 py-1 text-foreground outline-none placeholder:text-faint-foreground [field-sizing:content]"
            />
            <Button size="icon-sm" onClick={send} disabled={busy || !text.trim()} aria-label="Send" className="shrink-0">
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mx-auto mt-1 max-w-[808px] px-1 text-2xs text-danger-ink">{error}</p>}
    </div>
  )
}
