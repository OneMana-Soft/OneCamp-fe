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
import React, { useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle, X } from "@/lib/icons"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { invite, type InvitationAnswer } from "@/services/invitationService"
import { InvitationOutcome } from "@/components/invite/InvitationOutcome"
import { InviteResults, resultSummary, seatLimitOf, useInviteRound } from "@/components/invite/inviteRound"
import { inviteVerb, unsentLine } from "@/lib/invite/inviteCopy"
import { LimitNote } from "@/components/admin/plan/LimitNote"
import { seatNoteDue } from "@/lib/people/seatWords"
import type { PlanLinks } from "@/types/plan"

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

/** What is wrong with the addresses that aren't email addresses, and what to do. Pure. */
function invalidLine(emails: string[]): string {
  if (emails.length === 1) return `“${emails[0]}” isn't an email address, so it won't be sent. Fix it or remove it.`
  return `${emails.length} of these aren't email addresses, so they won't be sent. Fix or remove them.`
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
  /** Whether the server can send email: Send or Create, and whether a link is a failure or what was asked for. */
  emailOn?: boolean
  /** The plan's seats and the ways past its limit, when the server says (admins only). */
  seats?: { used: number; limit: number; links?: PlanLinks }
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
  /**
   * Leaves out Cancel, for a form placed inside a larger flow whose own
   * footer already moves on (the guided first run).
   */
  noCancel?: boolean
  /**
   * Where the form's actions go when it sits inside a larger overlay: that
   * overlay's footer, which stays in view while the form scrolls (the
   * owner's footer rule, design/drawers-v3). Without it they are the form's
   * own DialogFooter.
   */
  footerTo?: HTMLElement | null
  /** Done's words in the result state ("Next" inside the guided first run). */
  doneLabel?: string
}

export function InviteForm({ asAdmin, emailOn = true, seats, known, name = "email", onCreated, onClose, header, again, noCancel, footerTo, doneLabel = "Done" }: InviteFormProps) {
  const formId = useId()
  // The actions sit in a DialogFooter either way. Given an overlay's footer,
  // it goes there without a box of its own (`contents`), so its buttons join
  // that footer's row; else it is the form's own footer.
  const placeFooter = (el: React.ReactElement) => (footerTo ? createPortal(el, footerTo) : el)
  const footerClass = footerTo ? "contents" : undefined
  const [chips, setChips] = useState<InviteChip[]>([])
  const [draft, setDraft] = useState("")
  const [selected, setSelected] = useState(false)
  const [refusal, setRefusal] = useState("")
  // A seat refusal of the form's address: the limit it named, said by the
  // limit note in place of the server's words (to a member, "ask an admin"),
  // and the address it refused, so Send steps back until the addresses
  // change: a second press would only be refused again.
  const [seatRefusal, setSeatRefusal] = useState<{ limit: number; to: string } | null>(null)
  const [sendingOne, setSendingOne] = useState(false)
  const round = useInviteRound(asAdmin)
  const { results } = round
  const sending = sendingOne || round.sending
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
  const hasLimit = !!seats && seats.limit > 0
  const over = hasLimit && sendable.length > Math.max(0, seats.limit - seats.used)
  // The limit a refusal named: the form's one address's, or any of a round's rows'.
  const full = seatRefusal?.limit || seatLimitOf(results)
  // While the addresses are the ones just refused for want of a place, Send
  // steps back and Close is the way out (DB-134 F2): a second press is refused the same.
  const refusedAgain = !!seatRefusal && seatRefusal.to === sendable.map((c) => c.email).join(" ")
  const seatNote = full > 0 || (hasLimit && seatNoteDue(seats.used, seats.limit, sendable.length))
  const seatNoteId = `invite-${name}-seats`
  // The admin's figures, or, after a refusal, a full plan; a member knows only the limit.
  const limitNote = full ? (
    <LimitNote.Part id={seatNoteId} asAdmin={asAdmin} limit={full} used={asAdmin ? full : undefined} links={seats?.links} />
  ) : hasLimit ? (
    <LimitNote.Part id={seatNoteId} asAdmin={asAdmin} limit={seats.limit} used={seats.used} sending={sendable.length} links={seats.links} />
  ) : null

  const reset = () => {
    setChips([])
    setDraft("")
    setRefusal("")
    setSeatRefusal(null)
    round.reset()
    setSingle(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sendable.length || sending) return
    setChips(pending)
    setDraft("")
    setRefusal("")
    setSeatRefusal(null)
    if (sendable.length === 1) {
      setSendingOne(true)
      const email = sendable[0].email
      const outcome = await invite(email, asAdmin)
      setSendingOne(false)
      if (!outcome.ok) {
        if (outcome.code === "seat_limit" && outcome.limit) setSeatRefusal({ limit: outcome.limit, to: email })
        else setRefusal(outcome.msg)
        return
      }
      onCreated?.()
      setSingle({ answer: outcome.answer, email })
      return
    }
    const rows = await round.run(sendable.map((c) => c.email))
    if (rows.some((r) => r.state !== "refused")) onCreated?.()
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
        {placeFooter(
          <DialogFooter className={footerClass}>
            {again && (
              <Button type="button" variant="secondary" onClick={reset}>
                Invite another
              </Button>
            )}
            <Button type="button" onClick={onClose}>
              {doneLabel}
            </Button>
          </DialogFooter>,
        )}
      </>
    )
  }

  if (results) {
    return (
      <>
        {header({ done: !sending, summary: resultSummary(results) })}
        {!emailOn && results.some((r) => r.state === "created") && <p className="text-sm text-ink-2">{unsentLine(false, { admin: asAdmin })}</p>}
        <InviteResults results={results} emailOn={emailOn} />
        {/* Once, under the rows, however many met the limit. */}
        {full ? limitNote : null}
        {placeFooter(
          <DialogFooter className={footerClass}>
            {again && !sending && (
              <Button type="button" variant="secondary" onClick={reset}>
                Invite more
              </Button>
            )}
            <Button type="button" onClick={onClose} busy={sending}>
              {doneLabel}
            </Button>
          </DialogFooter>,
        )}
      </>
    )
  }

  const count = sendable.length
  const sendLabel = sending
    ? "Inviting…"
    : `${inviteVerb(emailOn)} ${count > 1 ? `${count} invitations` : "invitation"}`

  return (
    <form id={formId} onSubmit={submit} noValidate>
      {header({ done: false, summary: "" })}
      <TooltipProvider>
        <div className="grid gap-2 py-4">
          <label htmlFor={`invite-${name}`} className="text-sm font-medium">
            Email addresses
          </label>
          <div
            data-chip-field=""
            data-over={over || full ? "true" : undefined}
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
              aria-describedby={[refusal && `invite-${name}-refusal`, invalid.length > 0 && `invite-${name}-invalid`, seatNote && seatNoteId].filter(Boolean).join(" ") || undefined}
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
          {seatNote && limitNote}
          {refusal && (
            <p id={`invite-${name}-refusal`} role="alert" className="text-sm text-danger-ink">
              {refusal}
            </p>
          )}
        </div>
      </TooltipProvider>
      {placeFooter(
        <DialogFooter className={footerClass}>
          {/* Close comes only while nothing runs; Cancel waits for Send. */}
          {!noCancel && (refusedAgain ? (
            <Button type="button" onClick={onClose}>Close</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          ))}
          {/* form=: in another overlay's footer it is outside the form. */}
          <Button type="submit" form={formId} disabled={!count || refusedAgain} busy={sending}>
            {sendLabel}
          </Button>
        </DialogFooter>,
      )}
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
