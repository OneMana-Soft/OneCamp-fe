"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker"
import { Mail, X } from "@/lib/icons"
import { ANSWER_WORD, responseOf } from "@/lib/calendar/answers"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import type { FormGuest } from "@/lib/calendar/eventForm"

/** What guests may do, as the form holds it. */
export interface GuestPermissions {
  modify: boolean
  invite: boolean
  seeGuests: boolean
}

/**
 * The Event Form's guests (calendar FORM): people added by name, or anyone by
 * address where the calendar keeps its own events; each a row with their
 * face, an "Optional" chip by the name of one who is, their answer so far,
 * the action that changes it ("Mark optional", or "Make required"), and a
 * way off. The organiser sets what guests may do under them: change the
 * event (which lets them invite others too), invite others, see who else is
 * on it.
 */
export function GuestRows({
  id,
  guests,
  onChange,
  allowEmail,
  exclude,
  permissions,
  onPermissions,
}: {
  id?: string
  guests: FormGuest[]
  onChange: (guests: FormGuest[]) => void
  allowEmail: boolean
  exclude: string[]
  /** The organiser's: what guests may do. None for a guest editing. */
  permissions?: GuestPermissions
  onPermissions?: (p: GuestPermissions) => void
}) {
  const picked: PickedPerson[] = guests.map((g) => (g.uuid ? { uuid: g.uuid, name: g.name } : { uuid: "", name: g.name || g.email, email: g.email }))
  const add = (people: PickedPerson[]) => {
    const fresh = people.slice(guests.length)
    onChange([...guests, ...fresh.map((p) => ({ uuid: p.uuid, email: p.email ?? "", name: p.name, optional: false }))])
  }
  const keyOf = (g: FormGuest) => g.uuid || `mailto:${g.email}`
  return (
    <div className="grid gap-2" data-form-guests="">
      <PeoplePicker id={id} value={picked} onChange={add} exclude={exclude} allowEmail={allowEmail} showChosen={false} />
      {guests.length > 0 ? (
        <ul className="grid gap-0.5" aria-label="Guests">
          {guests.map((g) => (
            <li key={keyOf(g)} className="group/guest flex min-h-8 min-w-0 items-center gap-2 text-ui-sm" data-form-guest="">
              {g.uuid ? (
                <IdentityMark variant="avatar" size={20} id={avatarSeed(g.name)} label={g.name} />
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center text-ink-3" aria-hidden="true">
                  <Mail className="size-3.5" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="min-w-0 truncate text-ink">{g.name || g.email}</span>
                {g.optional ? (
                  <span className="shrink-0 rounded-[5px] bg-sunken px-1 text-micro text-ink-2" data-optional-chip="">
                    Optional
                  </span>
                ) : null}
                {g.response && g.response !== "needs_action" ? <span className="shrink-0 text-ink-3">· {ANSWER_WORD[responseOf(g.response)]}</span> : null}
              </span>
              <button
                type="button"
                aria-label={g.optional ? `Make ${g.name || g.email} required` : `Mark ${g.name || g.email} optional`}
                onClick={() => onChange(guests.map((x) => (keyOf(x) === keyOf(g) ? { ...x, optional: !x.optional } : x)))}
                className="shrink-0 rounded-sm px-1.5 text-meta text-ink-3 outline-none hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-brand"
                data-touch-target=""
              >
                {g.optional ? "Make required" : "Mark optional"}
              </button>
              <button
                type="button"
                aria-label={`Remove ${g.name || g.email}`}
                onClick={() => onChange(guests.filter((x) => keyOf(x) !== keyOf(g)))}
                className="shrink-0 rounded-sm p-0.5 text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                data-touch-target=""
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {permissions && onPermissions && guests.length > 0 ? (
        <fieldset className="grid gap-1 pt-1" data-guest-permissions="">
          <legend className="pb-1 text-meta text-ink-3">Guests can</legend>
          <Permission
            label="Change the event"
            checked={permissions.modify}
            onChange={(modify) => onPermissions({ ...permissions, modify, invite: modify || permissions.invite })}
          />
          {/* Changing the event lets them invite others too. */}
          <Permission
            label="Invite others"
            checked={permissions.modify || permissions.invite}
            disabled={permissions.modify}
            onChange={(invite) => onPermissions({ ...permissions, invite })}
          />
          <Permission label="See the guest list" checked={permissions.seeGuests} onChange={(seeGuests) => onPermissions({ ...permissions, seeGuests })} />
        </fieldset>
      ) : null}
    </div>
  )
}

function Permission({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId()
  return (
    <div className="flex min-h-7 items-center gap-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className={cn("text-ui-sm text-ink", disabled && "text-ink-3")}>
        {label}
      </label>
    </div>
  )
}
