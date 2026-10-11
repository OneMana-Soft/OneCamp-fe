"use client"

import * as React from "react"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Building2, Check, ChevronDown, Globe, Link, Loader2, Lock, X } from "@/lib/icons"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * What a doc's and a board's share dialogs have in common (content.md D18):
 * the token invite, a person with access, the access cards and Copy link. One
 * copy of each, so the two dialogs read alike. Only Invite is ever primary.
 */

export interface ShareRole {
  value: string
  /** The role as the menu says it: "Can edit". */
  label: string
}

/** The 12/510 ink-2 heading over a group, in sentence case, never a capitals eyebrow. */
export function ShareHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-meta font-medium text-ink-2">{children}</h3>
}

/**
 * One person with access: a 44 px row with a 28 px avatar, the name at
 * 14/510 and the email at 12 ink-3, and the role as a ghost menu. Remove is in
 * that menu ("Remove access"), not a hover X. The owner's role is plain text.
 * A role change flashes the row (cell-commit).
 */
export function ShareUserRow({
  user,
  role,
  roles,
  onRoleChange,
  onRemove,
  canEdit,
}: {
  user: UserProfileDataInterface
  role: string
  roles: ShareRole[]
  onRoleChange?: (role: string) => void
  onRemove?: () => void
  canEdit: boolean
}) {
  const { src } = useUserAvatar(user.user_profile_object_key)
  const name = displayNameOf(user) || "Someone"
  const secondLine = addressOrHandleOf(user)
  const [flash, setFlash] = React.useState(0)
  const label = role === "owner" ? "Owner" : roles.find((r) => r.value === role)?.label ?? role
  return (
    <div
      key={flash}
      className={cn("flex min-h-11 items-center gap-3 rounded-lg py-1", flash > 0 && "content-cell-commit")}
      data-share-row=""
    >
      <IdentityMark variant="avatar" size={28} id={user.user_uuid} label={name} src={src} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-ink">{name}</span>
        {secondLine && <span className="block truncate text-meta text-ink-3">{secondLine}</span>}
      </div>
      {role === "owner" || !canEdit ? (
        <span className="shrink-0 pr-2 text-ui-sm text-ink-3" data-share-role="">
          {label}
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-ui-sm font-medium text-ink-2" data-share-role="" aria-label={`${name}: ${label}`}>
              {label}
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {roles.map((r) => (
              <DropdownMenuItem
                key={r.value}
                onSelect={() => {
                  if (r.value === role) return
                  setFlash((n) => n + 1)
                  onRoleChange?.(r.value)
                }}
                className="justify-between gap-4"
              >
                {r.label}
                {r.value === role ? <Check className="size-3.5" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
            {onRemove ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onRemove} className="text-danger-ink focus:text-danger-ink">
                  Remove access
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/** The people a dialog lists, the owner once: an owner also listed as an editor showed twice. */
export function withoutOwner<T extends { user_uuid: string }>(list: T[] | undefined, ownerId?: string): T[] {
  return (list ?? []).filter((u) => u.user_uuid !== ownerId)
}

export type GeneralAccess = "restricted" | "public" | "public_comment"

/**
 * The general-access tile: a lock on the hover ground (private), a building
 * on the sky tint (the workspace); the anyone-with-the-link card has the globe
 * on moss. The colour carries the meaning, so a new choice's tile pops in.
 */
export function GeneralAccessMark({ value }: { value: GeneralAccess }) {
  return value === "restricted" ? (
    <span key="lock" className="content-pop-in flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-hover text-ink-2 [&>svg]:size-4" data-access-tile="restricted">
      <Lock aria-hidden="true" />
    </span>
  ) : (
    <span key="ws" className="content-pop-in inline-flex shrink-0" data-access-tile="workspace">
      <Tile hue="sky" size="md">
        <Building2 aria-hidden="true" />
      </Tile>
    </span>
  )
}

/** The anyone-with-the-link tile: the globe on moss. */
export function LinkAccessTile() {
  return (
    <span className="inline-flex shrink-0" data-access-tile="link">
      <Tile hue="moss" size="md">
        <Globe aria-hidden="true" />
      </Tile>
    </span>
  )
}

/**
 * What general access means, in true words: a doc or board that is not
 * restricted is open to everyone in the workspace, signed in. "Anyone on the
 * internet with the link" is what a guest link is for, not this setting.
 */
export function generalAccessLine(value: GeneralAccess, noun: "doc" | "board"): string {
  if (value === "restricted") return `Only the people above can open this ${noun}.`
  if (value === "public_comment") return `Everyone in the workspace can find it, read it and comment.`
  return `Everyone in the workspace can find it and read it.`
}

export const GENERAL_ACCESS_LABEL: Record<GeneralAccess, string> = {
  restricted: "Only people added",
  public: "Everyone in the workspace",
  public_comment: "Everyone in the workspace can comment",
}

/**
 * An access card (D18): the sunken ground, r12, 12 px in, a 32 px tile, the
 * label at 14/510 (a menu with a chevron when there is a choice) and what the
 * current choice means at 13 ink-2. `aside` sits on the right (a switch);
 * children expand below (D19's link options).
 */
export function AccessCard({
  tile,
  label,
  description,
  options,
  value,
  onChange,
  disabled,
  aside,
  children,
  ...rest
}: {
  tile: React.ReactNode
  label: string
  description: React.ReactNode
  options?: { value: string; label: string; description: string }[]
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  aside?: React.ReactNode
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">) {
  return (
    <div className="rounded-xl bg-sunken p-3" data-access-card="" {...rest}>
      <div className="flex items-center gap-3">
        {tile}
        <div className="min-w-0 flex-1">
          {options && onChange && !disabled ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex max-w-full items-center gap-1 rounded-sm text-ui font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {options.map((o) => (
                  <DropdownMenuItem key={o.value} onSelect={() => o.value !== value && onChange(o.value)} className="items-start gap-2 py-2">
                    <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                      {o.value === value ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ui-sm font-medium text-ink">{o.label}</span>
                      <span className="text-ui-sm text-ink-3">{o.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="block truncate text-ui font-medium text-ink">{label}</span>
          )}
          <span className="mt-0.5 block text-ui-sm text-ink-2">{description}</span>
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}

/**
 * Copy link: a secondary sm button with the link icon; it says "Copied" with
 * a moss check for 1.5 s, the icon swapping on the spring.
 */
export function CopyLinkButton({ href }: { href?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        void navigator.clipboard?.writeText(href ?? window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? (
        <Check key="ok" className="content-pop-in size-3.5 text-[var(--camp-moss-ink)]" aria-hidden="true" />
      ) : (
        <Link key="link" className="size-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
  )
}

/**
 * The invite row (D18): one token input, 32 px on the raised ground. Picked
 * people become 22 px chips; the role is a ghost menu inside the input on the
 * right. Invite (primary sm) appears only once someone is picked; until then
 * the slot shows the ⏎ key. A person who already has access says so and can't
 * be picked. Errors show under the input.
 */
export function ShareTokenInvite({
  search,
  roles,
  defaultRole,
  existing,
  onInvite,
}: {
  search: (q: string) => Promise<UserProfileDataInterface[]>
  roles: ShareRole[]
  defaultRole: string
  /** Who already has access. */
  existing: Set<string>
  onInvite: (users: UserProfileDataInterface[], role: string) => Promise<void>
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<UserProfileDataInterface[]>([])
  const [picked, setPicked] = React.useState<UserProfileDataInterface[]>([])
  const [role, setRole] = React.useState(defaultRole)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let live = true
    const t = setTimeout(async () => {
      try {
        const res = await search(q)
        if (live) {
          setResults(Array.isArray(res) ? res : [])
          setActive(0)
        }
      } catch {
        if (live) setResults([])
      }
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, search])

  const shown = results.filter((u) => !picked.some((p) => p.user_uuid === u.user_uuid))
  const pick = (u: UserProfileDataInterface) => {
    if (existing.has(u.user_uuid)) return
    setPicked((p) => [...p, u])
    setQuery("")
    setResults([])
    setError("")
    inputRef.current?.focus()
  }
  const invite = async () => {
    if (!picked.length || busy) return
    setBusy(true)
    setError("")
    try {
      await onInvite(picked, role)
      setPicked([])
    } catch {
      setError("Couldn't invite them. Try again.")
    } finally {
      setBusy(false)
    }
  }
  const roleLabel = roles.find((r) => r.value === role)?.label ?? role

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        <div
          className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-lg bg-raised py-1 pl-1.5 pr-1 shadow-e1 focus-within:ring-1 focus-within:ring-brand/50"
          onClick={() => inputRef.current?.focus()}
        >
          {picked.map((u) => (
            <span key={u.user_uuid} className="content-pop-in inline-flex h-[22px] max-w-full items-center gap-1 rounded-md bg-sunken pl-0.5 pr-1 text-ui-sm text-ink" data-share-chip="">
              <IdentityMark variant="avatar" size={18} id={u.user_uuid} label={displayNameOf(u)} />
              <span className="truncate">{displayNameOf(u)}</span>
              <button
                type="button"
                aria-label={`Remove ${displayNameOf(u)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setPicked((p) => p.filter((x) => x.user_uuid !== u.user_uuid))
                }}
                className="inline-flex size-4 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && shown.length) {
                e.preventDefault()
                setActive((i) => (i + 1) % shown.length)
              } else if (e.key === "ArrowUp" && shown.length) {
                e.preventDefault()
                setActive((i) => (i - 1 + shown.length) % shown.length)
              } else if (e.key === "Enter") {
                e.preventDefault()
                if (shown[active]) pick(shown[active])
                else void invite()
              } else if (e.key === "Backspace" && !query && picked.length) {
                setPicked((p) => p.slice(0, -1))
              }
            }}
            placeholder={picked.length ? "" : "Add people by name or email"}
            aria-label="Add people"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${shown[active].user_uuid}` : undefined}
            className="h-6 min-w-24 flex-1 bg-transparent px-1 text-ui text-ink outline-none placeholder:text-ink-3 max-sm:text-base"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto h-6 shrink-0 gap-1 px-1.5 text-ui-sm font-medium text-ink-2" aria-label={`Role: ${roleLabel}`}>
                {roleLabel}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {roles.map((r) => (
                <DropdownMenuItem key={r.value} onSelect={() => setRole(r.value)} className="justify-between gap-4">
                  {r.label}
                  {r.value === role ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {picked.length > 0 ? (
          <Button size="sm" onClick={() => void invite()} disabled={busy} className="relative shrink-0" data-share-invite="">
            <span className={cn(busy && "invisible")}>Invite</span>
            {busy ? <Loader2 className="absolute size-3.5 animate-spin" aria-label="Inviting" /> : null}
          </Button>
        ) : (
          <kbd className="kbd mt-2 shrink-0 max-sm:hidden" aria-hidden="true">⏎</kbd>
        )}
      </div>
      {shown.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="People"
          className="content-float absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl bg-raised p-1 shadow-e3"
        >
          {shown.map((u, i) => {
            const has = existing.has(u.user_uuid)
            return (
              <li
                key={u.user_uuid}
                id={`${listId}-${u.user_uuid}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={has}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2", i === active && "bg-hover", has && "cursor-default")}
              >
                <IdentityMark variant="avatar" size={24} id={u.user_uuid} label={displayNameOf(u)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui-sm font-medium text-ink">{displayNameOf(u)}</span>
                  {u.user_email_id ? <span className="block truncate text-meta text-ink-3">{u.user_email_id}</span> : null}
                </span>
                {has ? <span className="shrink-0 text-meta text-ink-3">Already has access</span> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1.5 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The dialog's shell (D18 on the v3 dialog: r16, e4, 20 px in): the title
 * "Share “…”" at 17/24, the description, the body, then a hairline and the
 * footer with Copy link (secondary) and Done (ghost). On a phone the dialog
 * component makes it a sheet; the footer stays put above the safe area.
 */
export function ShareFooter({ onDone, href }: { onDone: () => void; href?: string }) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-sheet px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <CopyLinkButton href={href} />
      <Button variant="ghost" size="sm" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
