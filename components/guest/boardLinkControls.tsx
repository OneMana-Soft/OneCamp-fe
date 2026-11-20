"use client"

/**
 * A board link's own controls in its share card (miro-33): the link's
 * password, and changing a live link in place (its role, its end, its
 * password). GuestLinkSection imports them and draws them only for a
 * board's link: a doc's, a table's, a project's or a channel's card never
 * shows them. They only present; the card makes the call and says the server's words.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "@/lib/icons"
import { SECRET_HINT, secretProblem } from "@/lib/publish/secret"
import { GhostMenu, NEVER, type Role } from "@/components/guest/guestLinkParts"
import type { GuestCapability, ResourceGuestLink } from "@/services/guestService"
import type { GuestLinkChange } from "@/services/guestBoardLinks"

/** A board link's password (miro-33): asked for only when wanted, by the docs' rule (lib/publish/secret); never shown back. */
export function PasswordField({ value, onChange, problem, has = false }: { value: string | null; onChange: (v: string | null) => void; problem: string; has?: boolean }) {
  if (value === null) {
    return (
      <div className="flex basis-full flex-wrap gap-1" data-touch-group="">
        <Button variant="ghost" size="sm" className="extend-touch-target h-7 px-2" onClick={() => onChange("")}>
          {has ? "New password" : "Add a password"}
        </Button>
        {has ? (
          <Button variant="ghost" size="sm" className="extend-touch-target h-7 px-2 text-danger-ink hover:text-danger-ink" onClick={() => onChange(REMOVE)}>
            Remove the password
          </Button>
        ) : null}
      </div>
    )
  }
  if (value === REMOVE) {
    return (
      <p className="basis-full text-meta text-ink-3">
        The password comes off when you save.{" "}
        <button type="button" className="font-medium text-ink-2 underline" onClick={() => onChange(null)}>Keep it</button>
      </p>
    )
  }
  return (
    <div className="grid basis-full gap-1">
      <Input
        type="password"
        aria-label="Link password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={SECRET_HINT}
        autoComplete="new-password"
        maxLength={128}
        aria-invalid={problem ? true : undefined}
        // An input draws no ::after (extend-touch-target's reach), so its own box grows under a finger.
        className="h-8 pointer-coarse:h-11"
      />
      {problem ? <p role="alert" className="text-meta text-danger-ink">{problem}</p> : <p className="text-meta text-ink-3">Guests type it once on each device. It&apos;s never shown again.</p>}
    </div>
  )
}

/** The password field's "take it off", apart from any password typed. */
const REMOVE = "\u0000remove"

/**
 * One live board link, changed in place by its owner or a co-owner (miro-33): its role, its end
 * (kept unless picked) and its password; only what changed goes to `onSave`, which the card makes
 * (the server is the authority: its refusal or a lost race shows in its words).
 */
export function LinkChange({ link, roles, options, onSave, onCancel }: {
  link: ResourceGuestLink
  roles: Role[]
  options: { label: string; hours: number }[]
  onSave: (change: GuestLinkChange) => Promise<void>
  onCancel: () => void
}) {
  const [role, setRole] = React.useState<GuestCapability>(link.capability)
  const [ttl, setTtl] = React.useState<number | null>(null)
  const [password, setPassword] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  // A refusal's words stand until the owner types again.
  const typePassword = (v: string | null) => {
    setPassword(v)
    setProblem("")
  }
  const change: GuestLinkChange = {
    ...(role !== link.capability ? { capability: role } : {}),
    ...(ttl === null ? {} : ttl === NEVER ? { never_expires: true } : { ttl_hours: ttl }),
    ...(password === REMOVE ? { password: "" } : password ? { password } : {}),
  }
  const save = async () => {
    const wrong = password && password !== REMOVE ? secretProblem("password", password) : ""
    setProblem(wrong)
    if (wrong) return
    setSaving(true)
    try {
      await onSave(change)
    } finally {
      setSaving(false)
    }
  }
  const ends = options.find((o) => o.hours === ttl)
  return (
    <div data-link-change="" className="content-rise mb-1 flex flex-wrap items-center gap-1 rounded-lg bg-sunken p-2">
      <GhostMenu label={roles.find((r) => r.value === role)?.label ?? ""} name="Permission" options={roles} onSelect={(v) => setRole(v as GuestCapability)} />
      <GhostMenu
        label={!ends ? "Keeps its end" : ends.hours === NEVER ? ends.label : `Expires in ${ends.label}`}
        name="Link expires"
        options={options.map((o) => ({ value: String(o.hours), label: o.hours === NEVER ? o.label : `Expires in ${o.label}` }))}
        onSelect={(v) => setTtl(Number(v))}
      />
      <PasswordField value={password} onChange={typePassword} problem={problem} has={!!link.has_password} />
      <div className="ml-auto flex gap-1" data-touch-group="">
        <Button variant="ghost" size="sm" className="extend-touch-target h-7" onClick={onCancel}>Cancel</Button>
        <Button variant="secondary" size="sm" className="extend-touch-target h-7" onClick={() => void save()} disabled={saving || Object.keys(change).length === 0}>
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  )
}

