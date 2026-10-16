"use client"

// The body of both invite dialogs (design v3, E6, mock M7): addresses as
// chips, a live "Send 3 invitations", and, once sent, one row per address
// resolving in turn. The admin's dialog (AddInvitationDialog) and a member's
// (MemberInviteDialog) differ only in the route they send to, whether the
// plan's seats are known, and which addresses are already invited.
//
// One address keeps the single outcome (InvitationOutcome: the email went or
// why not, with the link), since that is the whole answer; several get a row
// each, so a refusal for one never hides that the others went.

import { personHue } from "@/lib/utils/getAvatarColor"
import React, { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle, Check, Copy, Loader2, X } from "@/lib/icons"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { invite, type InvitationAnswer } from "@/services/invitationService"
import { InvitationOutcome, couldntEmail } from "@/components/invite/InvitationOutcome"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { seatWords } from "@/components/admin/PeopleFrame"

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

export type ChipKind = "ok" | "invalid" | "known"
export interface InviteChip {
  email: string
  kind: ChipKind
  /** Why it can't be sent, for an invalid or known address. */
  reason?: string
}

/**
 * Addresses from whatever was typed or pasted: split on commas, semicolons,
 * spaces and newlines, lower-cased, each once, with its kind. Pure.
 */
export function parseAddresses(text: string, known: ReadonlySet<string> = new Set(), already: readonly string[] = []): InviteChip[] {
  const seen = new Set(already.map((a) => a.toLowerCase()))
  const out: InviteChip[] = []
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim().replace(/^<|>$/g, "").toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    if (!EMAIL.test(email)) out.push({ email, kind: "invalid", reason: "That isn't an email address." })
    else if (known.has(email)) out.push({ email, kind: "known", reason: "Already invited. Resend it from Admin, Invitations." })
    else out.push({ email, kind: "ok" })
  }
  return out
}

/** "3 places left on the free plan. 2 of these won't fit.", or nothing while they fit. Pure. */
export function seatLine(sending: number, seatsLeft: number | undefined): string {
  if (seatsLeft == null || sending <= seatsLeft) return ""
  const places = seatsLeft === 1 ? "1 place" : `${seatsLeft} places`
  const over = sending - seatsLeft
  return `${seatsLeft === 0 ? "No places" : places} left on the free plan. ${over} of these won't fit.`
}

/** What is wrong with the addresses that aren't email addresses, and what to do. Pure. */
export function invalidLine(emails: string[]): string {
  if (emails.length === 1) return `“${emails[0]}” isn't an email address, so it won't be sent. Fix it or remove it.`
  return `${emails.length} of these aren't email addresses, so they won't be sent. Fix or remove them.`
}

type Result =
  | { email: string; state: "waiting" }
  | { email: string; state: "sent" | "created"; answer: InvitationAnswer }
  | { email: string; state: "refused"; msg: string }

/** "4 sent · 1 to share by link · 1 refused". Pure. */
export function resultSummary(results: Pick<Result, "state">[]): string {
  const n = (s: Result["state"]) => results.filter((r) => r.state === s).length
  return [
    n("sent") && `${n("sent")} sent`,
    n("created") && `${n("created")} to share by link`,
    n("refused") && `${n("refused")} refused`,
  ]
    .filter(Boolean)
    .join(" · ")
}

function Face({ email }: { email: string }) {
  return (
    <span aria-hidden="true" className={`invite-chip-face ${avatarHueClass(personHue({ user_email_id: email }))}`}>
      {email.charAt(0).toUpperCase()}
    </span>
  )
}

export interface InviteFormProps {
  asAdmin: boolean
  /** Says what Send does; "Send" with email set up, "Create" without. */
  sendVerb?: "Send" | "Create"
  /** Places left on a free plan, when the server says (admins only). */
  seatsLeft?: number
  /** The plan's limit, for the meter beside the seat line. */
  seatLimit?: number
  /** Addresses whose invitation is still live (admins only). */
  known?: ReadonlySet<string>
  /** The field's name, kept from each dialog's own form. */
  name?: string
  /** After any invitation is made, so a list can be read again. */
  onCreated?: () => void
  onClose: () => void
  /** Renders the title for the state the form is in (it changes after sending). */
  header: (state: { done: boolean; single?: { answer: InvitationAnswer; email: string }; summary: string }) => React.ReactNode
  /** A second button beside Done in the result state ("Invite another"). */
  again?: boolean
}

export function InviteForm({ asAdmin, sendVerb = "Send", seatsLeft, seatLimit, known, name = "email", onCreated, onClose, header, again }: InviteFormProps) {
  const [chips, setChips] = useState<InviteChip[]>([])
  const [draft, setDraft] = useState("")
  const [selected, setSelected] = useState(false)
  const [refusal, setRefusal] = useState("")
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [single, setSingle] = useState<{ answer: InvitationAnswer; email: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const knownSet = useMemo(() => known ?? new Set<string>(), [known])

  const add = (text: string) => {
    const next = parseAddresses(text, knownSet, chips.map((c) => c.email))
    if (next.length) setChips((prev) => [...prev, ...next])
    setRefusal("")
    setSelected(false)
  }

  // What Send would send: the chips, and whatever is still in the field.
  const pending = useMemo(
    () => [...chips, ...parseAddresses(draft, knownSet, chips.map((c) => c.email))],
    [chips, draft, knownSet],
  )
  const sendable = pending.filter((c) => c.kind === "ok")
  const invalid = pending.filter((c) => c.kind === "invalid")
  const over = seatLine(sendable.length, seatsLeft)

  const reset = () => {
    setChips([])
    setDraft("")
    setRefusal("")
    setResults(null)
    setSingle(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sendable.length || sending) return
    setChips(pending)
    setDraft("")
    setRefusal("")
    setSending(true)
    if (sendable.length === 1) {
      const email = sendable[0].email
      const outcome = await invite(email, asAdmin)
      setSending(false)
      if (!outcome.ok) {
        setRefusal(outcome.msg)
        return
      }
      onCreated?.()
      setSingle({ answer: outcome.answer, email })
      return
    }
    // In turn, so each row resolves where the reader is looking and the
    // server is not asked twenty things at once.
    const rows: Result[] = sendable.map((c) => ({ email: c.email, state: "waiting" }))
    setResults([...rows])
    let made = false
    for (let i = 0; i < rows.length; i++) {
      const outcome = await invite(rows[i].email, asAdmin)
      rows[i] = outcome.ok
        ? { email: rows[i].email, state: outcome.answer.email_sent ? "sent" : "created", answer: outcome.answer }
        : { email: rows[i].email, state: "refused", msg: outcome.msg }
      made ||= outcome.ok
      setResults([...rows])
    }
    setSending(false)
    if (made) onCreated?.()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault()
        add(draft)
        setDraft("")
      }
      return
    }
    if (e.key === "Backspace" && !draft && chips.length) {
      e.preventDefault()
      // The first press selects the last chip, the second removes it.
      if (selected) {
        setChips((prev) => prev.slice(0, -1))
        setSelected(false)
      } else setSelected(true)
      return
    }
    if (selected) setSelected(false)
  }

  if (single) {
    return (
      <>
        {header({ done: true, single, summary: "" })}
        <InvitationOutcome answer={single.answer} email={single.email} />
        <DialogFooter>
          {again && (
            <Button type="button" variant="secondary" onClick={reset}>
              Invite another
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </>
    )
  }

  if (results) {
    return (
      <>
        {header({ done: !sending, summary: resultSummary(results) })}
        <ul aria-label="Invitations" aria-live="polite" data-invite-results="" className="space-y-1 py-1">
          {results.map((r, i) => (
            <ResultRow key={r.email} result={r} index={i} />
          ))}
        </ul>
        <DialogFooter>
          {again && !sending && (
            <Button type="button" variant="secondary" onClick={reset}>
              Invite more
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={sending}>
            Done
          </Button>
        </DialogFooter>
      </>
    )
  }

  const count = sendable.length
  const sendLabel = sending
    ? "Inviting…"
    : `${sendVerb} ${count > 1 ? `${count} invitations` : "invitation"}`

  return (
    <form onSubmit={submit} noValidate>
      {header({ done: false, summary: "" })}
      <TooltipProvider>
        <div className="grid gap-2 py-4">
          <label htmlFor={`invite-${name}`} className="text-sm font-medium">
            Email addresses
          </label>
          <div
            data-chip-field=""
            data-over={over ? "true" : undefined}
            className="invite-field"
            onClick={() => inputRef.current?.focus()}
          >
            {chips.map((c, i) => (
              <Chip
                key={c.email}
                chip={c}
                index={i}
                selected={selected && i === chips.length - 1}
                onRemove={() => setChips((prev) => prev.filter((x) => x.email !== c.email))}
              />
            ))}
            <input
              ref={inputRef}
              id={`invite-${name}`}
              name={name}
              type="email"
              inputMode="email"
              multiple
              // Someone else's address: the browser must not offer the
              // inviter's own, or save this as theirs.
              autoComplete="off"
              spellCheck={false}
              placeholder={chips.length ? "" : "name@example.com, another@example.com"}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setRefusal("")
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                if (draft.trim()) {
                  add(draft)
                  setDraft("")
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text")
                if (/[\s,;]/.test(text.trim())) {
                  e.preventDefault()
                  add(draft + text)
                  setDraft("")
                }
              }}
              autoFocus
              aria-describedby={[refusal && `invite-${name}-refusal`, invalid.length > 0 && `invite-${name}-invalid`, over && `invite-${name}-seats`].filter(Boolean).join(" ") || undefined}
            />
          </div>
          {/* Said under the field, not only in the chip's tooltip: on a
              phone there is no hover, and Send quietly left the address out. */}
          {invalid.length > 0 && (
            <p id={`invite-${name}-invalid`} data-invalid-line="" className="flex items-center gap-1.5 text-xs text-danger-ink">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
              {invalidLine(invalid.map((c) => c.email))}
            </p>
          )}
          {over && (
            <div id={`invite-${name}-seats`} data-seat-line="" className="flex items-center justify-between gap-3 text-xs text-camp-sun-ink">
              <span>{over}</span>
              {seatLimit ? (
                <span className="people-meter-track shrink-0" aria-hidden="true" data-near="true">
                  <span className="people-meter-fill" style={{ transform: `scaleX(${seatWords(seatLimit - (seatsLeft ?? 0), seatLimit).ratio})` }} />
                </span>
              ) : null}
            </div>
          )}
          {refusal && (
            <p id={`invite-${name}-refusal`} role="alert" className="text-sm text-danger-ink">
              {refusal}
            </p>
          )}
        </div>
      </TooltipProvider>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!count || sending}>
          {sending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {sendLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Chip({ chip, index, selected, onRemove }: { chip: InviteChip; index: number; selected: boolean; onRemove: () => void }) {
  const body = (
    <span
      data-invite-chip={chip.kind}
      data-selected={selected ? "true" : undefined}
      className="invite-chip"
      style={{ ["--i" as string]: index % 12 }}
    >
      {chip.kind === "invalid" ? (
        <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <Face email={chip.email} />
      )}
      <span className="truncate">
        {chip.email}
        {chip.kind === "known" && <span className="text-ink-3"> · Already invited</span>}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={`Remove ${chip.email}`}
        className="inline-flex size-4 items-center justify-center rounded-xs text-ink-3 hover:bg-press hover:text-foreground"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
  if (!chip.reason) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>{chip.reason}</TooltipContent>
    </Tooltip>
  )
}

function ResultRow({ result, index }: { result: Result; index: number }) {
  const { copied, copy } = useCopyToClipboard()
  const link = "answer" in result ? result.answer.invite_link : undefined
  return (
    <li data-invite-result={result.state} className="invite-result flex min-h-9 items-center gap-3" style={{ ["--i" as string]: index }}>
      <span className="inline-flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
        {result.state === "waiting" ? (
          <Loader2 className="size-4 animate-spin text-ink-3" />
        ) : result.state === "sent" ? (
          <Check className="size-4 text-success-ink" />
        ) : (
          <AlertCircle className={result.state === "refused" ? "size-4 text-danger-ink" : "size-4 text-camp-sun-ink"} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{result.email}</span>
      {result.state === "sent" && <span className="text-xs text-ink-3">Sent</span>}
      {result.state === "created" && (
        <>
          <span className="truncate text-xs text-camp-sun-ink" title={couldntEmail(result.answer)}>
            Couldn&apos;t email
          </span>
          {link && (
            <Button type="button" size="xs" variant="secondary" onClick={() => void copy(link, "Invitation link copied")} aria-label={`Copy the link for ${result.email}`}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              Copy link
            </Button>
          )}
        </>
      )}
      {result.state === "refused" && (
        <span className="max-w-[55%] truncate text-xs text-danger-ink" title={result.msg}>
          {result.msg}
        </span>
      )}
    </li>
  )
}
