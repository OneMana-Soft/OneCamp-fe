"use client"

/**
 * GuestLinkSection — an inline "Share to web" panel for the share dialog. Mints
 * a scoped external link to a doc, board, table, channel or project so people
 * without a OneCamp account can reach that one resource. The raw token is shown
 * ONCE; revoke any time from admin settings. Requires workspace guest access on
 * + edit access (enforced server-side; a 403 surfaces as a friendly message).
 *
 * Renders nothing when the caller can't share, so the dialog stays clean.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { Copy, Check, ExternalLink, Link2, Globe } from "@/lib/icons"
import { createGuestLink, guestResourceLink, resourceGuestLinksKey, turnOffGuestLink, type GuestCapability, type GuestResourceType, type ResourceGuestLink } from "@/services/guestService"
import { useFetch } from "@/hooks/useFetch"
import { Tile } from "@/components/ui/graphics/Tile"
import { GUEST_HUE } from "@/components/guest/guestUi"
import { format, formatDistanceToNow } from "date-fns"
import { Switch } from "@/components/ui/switch"
import { AccessCard, LinkAccessTile } from "@/components/dialog/shareParts"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown, Loader2 } from "@/lib/icons"

interface GuestLinkSectionProps {
  resourceType: GuestResourceType
  resourceId: string
  canShare: boolean
  /** Inside a dialog that is only about sharing: no heading of its own, and
   *  the options show at once instead of behind a button. */
  embedded?: boolean
  /** As the share dialog's "Anyone with the link" card, with a switch (D19). */
  card?: boolean
}

// A UI-only sentinel. It never travels as a ttl, because 0 already means "use
// the server default" on the wire, and a link that never expires is sent as its
// own flag rather than as an unusual duration.
const NEVER = -1

const EXPIRY_OPTIONS = [
  { label: "7 days", hours: 24 * 7 },
  { label: "14 days", hours: 24 * 14 },
  { label: "30 days", hours: 24 * 30 },
  { label: "90 days", hours: 24 * 90 },
  { label: "Does not expire", hours: NEVER },
]

// What each kind of shared resource is called and what its guest may do. A
// resource with a write capability offers it as the second permission.
// start is the permission a new link begins with: what that kind of guest is
// usually invited for.
const RESOURCE: Record<GuestResourceType, {
  noun: string
  write: GuestCapability | null
  start: GuestCapability
  viewLabel: string
  writeLabel?: string
  title: string
  /** What the link gives, said above its options; none where the dialog around it says it already. */
  blurb: string
  /** Under the permission, when one choice holds back something people expect. */
  note?: string
}> = {
  doc: { noun: "document", write: "comment", start: "view", viewLabel: "Can view", writeLabel: "Can comment", title: "Create an external link", blurb: "Anyone with the link can view this document, read only. No account needed." },
  board: { noun: "board", write: null, start: "view", viewLabel: "Can view", title: "Create an external link", blurb: "Anyone with the link can view this board, read only. No account needed." },
  table: { noun: "table", write: null, start: "view", viewLabel: "Can view", title: "Create an external link", blurb: "Anyone with the link can view this table, read only. No account needed." },
  channel: {
    noun: "channel", write: "post", start: "post", viewLabel: "Can read", writeLabel: "Can read and post", title: "Invite a guest",
    blurb: "Invite someone from another company to this channel. They read and reply from the link, with no account, and see nothing else of the workspace.",
  },
  project: {
    noun: "project", write: "comment", start: "comment", viewLabel: "Can see tasks", writeLabel: "Can see and comment", title: "Share with a client",
    // The share dialog's preview says what a client sees, point by point: a
    // paragraph here said it all again under it (PTC-60).
    blurb: "",
    note: "Approving tasks and asking for changes need “Can see and comment”.",
  },
}

export function GuestLinkSection(props: GuestLinkSectionProps) {
  return props.card ? <GuestLinkCard {...props} /> : <GuestLinkPanel {...props} />
}

function GuestLinkPanel({ resourceType, resourceId, canShare, embedded = false }: GuestLinkSectionProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const expiryId = React.useId()
  const permissionId = React.useId()
  const [ttlHours, setTtlHours] = React.useState(EXPIRY_OPTIONS[1].hours) // 14 days
  const [capability, setCapability] = React.useState<GuestCapability>(RESOURCE[resourceType].start)
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [open, setOpen] = React.useState(embedded)

  // The resource's live links, so whoever shares can also turn one off.
  const links = useFetch<{ data: ResourceGuestLink[] }>(canShare && resourceId ? resourceGuestLinksKey(resourceType, resourceId) : "")
  const [turningOff, setTurningOff] = React.useState<string | null>(null)

  if (!canShare) return null

  const kind = RESOURCE[resourceType]
  const writeCapability = kind.write
  const supportsComment = writeCapability !== null
  const noun = kind.noun

  const handleCreate = async () => {
    setCreating(true)
    try {
      const neverExpires = ttlHours === NEVER
      const res = await createGuestLink(
        resourceType,
        resourceId,
        neverExpires ? undefined : ttlHours,
        supportsComment ? capability : "view",
        neverExpires,
      )
      setLink(guestResourceLink(resourceType, res.token))
      void links.mutate()
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      toast({
        title: "Couldn't create the link",
        // The server says which it was: guest access off, or not allowed to
        // share this resource.
        description: apiErrorMessage(
          e,
          status === 403 ? `Guest access is off for this workspace, or you can't share this ${noun}.` : "Try again in a moment.",
        ),
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked; the input stays selectable */
    }
  }

  return (
    <div className={embedded ? "flex flex-col gap-3" : "flex flex-col gap-3 pt-4 border-t border-line"}>
      {embedded ? (
        !link && kind.blurb && <p className="text-sm text-muted-foreground">{kind.blurb}</p>
      ) : (
        <Label className="text-sm font-medium text-foreground">
          Share to web
        </Label>
      )}

      {!open && !link && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-md p-2 -mx-2 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          {/* In the hue the shared page will wear for its guests. */}
          <Tile hue={GUEST_HUE} size="lg">
            <Globe />
          </Tile>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{kind.title}</span>
            <span className="text-xs text-muted-foreground">{kind.blurb}</span>
          </div>
        </button>
      )}

      {open && !link && (
        // On a phone the two menus share a row and Create link takes the one
        // under them, full width at the finger's 44px: side by side, the
        // menus wouldn't shrink below their words and pushed the button out
        // past the dialog's edge (the client share sheet at 390).
        <div data-link-options="" className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={expiryId} className="text-xs text-muted-foreground">Link expires</Label>
            <Select value={String(ttlHours)} onValueChange={(v) => setTtlHours(Number(v))}>
              <SelectTrigger id={expiryId} className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.hours} value={String(o.hours)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {supportsComment && (
            <div className="min-w-0 flex-[1.4] space-y-1.5">
              <Label htmlFor={permissionId} className="text-xs text-muted-foreground">Permission</Label>
              <Select value={capability} onValueChange={(v) => setCapability(v as GuestCapability)}>
                <SelectTrigger id={permissionId} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">{kind.viewLabel}</SelectItem>
                  {writeCapability && <SelectItem value={writeCapability}>{kind.writeLabel}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating} className="h-9 shrink-0 max-sm:h-11 max-sm:w-full">
            <Link2 className="mr-1.5 h-4 w-4" />
            {creating ? "Creating…" : "Create link"}
          </Button>
        </div>
      )}
      {open && !link && kind.note && <p className="text-xs text-muted-foreground">{kind.note}</p>}

      {link && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input value={link} readOnly onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" />
            <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={handleCopy} aria-label="Copy link">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
              aria-label="Open link"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy this link now, it won&apos;t be shown again. Turn it off any time below.
          </p>
        </div>
      )}

      {(links.data?.data?.length ?? 0) > 0 && (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">Links that work now</p>
          <ul className="grid">
            {links.data!.data.map((l) => {
              const permission = l.capability === "view" ? kind.viewLabel : kind.writeLabel ?? kind.viewLabel
              const turnOff = async () => {
                setTurningOff(l.id)
                try {
                  await turnOffGuestLink(l.id)
                  await links.mutate()
                } catch (e: unknown) {
                  toast({ title: "Couldn't turn the link off", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                } finally {
                  setTurningOff(null)
                }
              }
              return (
                <li key={l.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-hover">
                  <span className="min-w-0 flex-1 truncate">
                    {permission}
                    <span className="text-xs text-muted-foreground">
                      {" · "}
                      {l.expires_at ? `ends ${formatDistanceToNow(new Date(l.expires_at), { addSuffix: true })}` : "doesn't expire"}
                      {l.mine ? " · yours" : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 text-danger-ink hover:text-danger-ink"
                    disabled={turningOff === l.id}
                    // A client may be on this link right now: asked first,
                    // in the words of what stops working.
                    onClick={() =>
                      confirm({
                        title: `Turn off the “${permission}” link?`,
                        description: `Anyone using it loses access at once, and the link stops working for good. You can make a new one any time.`,
                        confirmText: "Turn off link",
                        destructive: true,
                        onConfirm: () => void turnOff(),
                      })
                    }
                  >
                    {turningOff === l.id ? "Turning off…" : "Turn off"}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}


/**
 * "Anyone with the link" as the share dialog's second card (content.md D19):
 * the globe on moss, "Off" or "On · Can comment · expires 9 Nov", and a
 * switch. Turning it on opens the card (its options rise in) on two ghost
 * menus (who and how long) and Create link; the new link then shows once, in
 * a read-only field with Copy. Links already live list under it with Turn
 * off. Turning the switch off asks first, then turns every live link off.
 */
function GuestLinkCard({ resourceType, resourceId, canShare }: GuestLinkSectionProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const kind = RESOURCE[resourceType]
  const [open, setOpen] = React.useState(false)
  const [ttlHours, setTtlHours] = React.useState(24 * 30)
  const [capability, setCapability] = React.useState<GuestCapability>(kind.start)
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const links = useFetch<{ data: ResourceGuestLink[] }>(canShare && resourceId ? resourceGuestLinksKey(resourceType, resourceId) : "")
  const [turningOff, setTurningOff] = React.useState<string | null>(null)

  if (!canShare) return null

  const live = links.data?.data ?? []
  const on = open || !!link || live.length > 0
  const permissionOf = (c: GuestCapability) => (c === "view" ? kind.viewLabel : kind.writeLabel ?? kind.viewLabel)
  const first = live[0]
  const status = first
    ? ["On", permissionOf(first.capability), first.expires_at ? `expires ${format(new Date(first.expires_at), "d MMM")}` : "doesn't expire"].join(" · ")
    : on
      ? "On · make the link below"
      : "Off"

  const create = async () => {
    setCreating(true)
    try {
      const never = ttlHours === NEVER
      const res = await createGuestLink(resourceType, resourceId, never ? undefined : ttlHours, kind.write ? capability : "view", never)
      setLink(guestResourceLink(resourceType, res.token))
      void links.mutate()
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      toast({
        title: "Couldn't create the link",
        description: apiErrorMessage(e, status === 403 ? `Guest access is off for this workspace, or you can't share this ${kind.noun}.` : "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const turnOff = async (ids: string[]) => {
    for (const id of ids) {
      setTurningOff(id)
      try {
        await turnOffGuestLink(id)
      } catch (e: unknown) {
        toast({ title: "Couldn't turn the link off", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
      }
    }
    setTurningOff(null)
    await links.mutate()
  }

  const onSwitch = (next: boolean) => {
    if (next) {
      setOpen(true)
      return
    }
    if (!live.length) {
      setOpen(false)
      setLink("")
      return
    }
    confirm({
      title: "Turn off this link?",
      description: "Anyone using it loses access now.",
      confirmText: "Turn off",
      destructive: true,
      onConfirm: () => {
        void turnOff(live.map((l) => l.id)).then(() => {
          setOpen(false)
          setLink("")
        })
      },
    })
  }

  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.hours === ttlHours)?.label ?? ""
  return (
    <AccessCard
      tile={<LinkAccessTile />}
      label="Anyone with the link"
      description={status}
      data-guest-link-card=""
      aside={<Switch checked={on} onCheckedChange={onSwitch} aria-label="Anyone with the link" className="data-[state=checked]:bg-[var(--camp-moss-a2)]" />}
    >
      {on ? (
          <div className="content-rise flex flex-col gap-2 pl-11 pt-2" data-guest-link-options="">
            {!link ? (
              <div className="flex flex-wrap items-center gap-1">
                {kind.write ? (
                  <GhostMenu
                    label={permissionOf(capability)}
                    name="Permission"
                    options={[{ value: "view", label: kind.viewLabel }, { value: kind.write, label: kind.writeLabel ?? kind.viewLabel }]}
                    onSelect={(v) => setCapability(v as GuestCapability)}
                  />
                ) : null}
                <GhostMenu
                  label={ttlHours === NEVER ? "Does not expire" : `Expires in ${expiryLabel}`}
                  name="Link expires"
                  options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.hours), label: o.hours === NEVER ? o.label : `Expires in ${o.label}` }))}
                  onSelect={(v) => setTtlHours(Number(v))}
                />
                <Button variant="secondary" size="sm" className="ml-auto h-7 gap-1.5" onClick={() => void create()} disabled={creating}>
                  {creating ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
                  Create link
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    value={link}
                    readOnly
                    aria-label="Guest link"
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-8 min-w-0 flex-1 rounded-lg bg-raised px-2.5 font-mono text-meta text-ink-2 shadow-e1 outline-none focus-visible:ring-1 focus-visible:ring-brand/50"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      } catch {
                        /* clipboard blocked; the field stays selectable */
                      }
                    }}
                  >
                    {copied ? <Check className="size-3.5 text-[var(--camp-moss-ink)]" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-meta text-ink-3">Copy it now: it won&apos;t be shown again.</p>
              </>
            )}
            {live.length > (link ? 1 : 0) ? (
              <div className="grid">
                <p className="text-meta font-medium text-ink-2">{link ? "Other links" : "Links that work now"}</p>
                {(link ? live.slice(1) : live).map((l) => (
                  <div key={l.id} className="flex h-9 items-center gap-2 text-ui-sm text-ink">
                    <span className="min-w-0 flex-1 truncate">
                      {permissionOf(l.capability)}
                      <span className="text-ink-3">
                        {" · "}
                        {l.expires_at ? `ends ${formatDistanceToNow(new Date(l.expires_at), { addSuffix: true })}` : "doesn't expire"}
                        {l.mine ? " · yours" : ""}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-danger-ink hover:text-danger-ink"
                      disabled={turningOff === l.id}
                      onClick={() =>
                        confirm({
                          title: `Turn off the “${permissionOf(l.capability)}” link?`,
                          description: "Anyone using it loses access at once, and the link stops working for good. You can make a new one any time.",
                          confirmText: "Turn off link",
                          destructive: true,
                          onConfirm: () => void turnOff([l.id]),
                        })
                      }
                    >
                      {turningOff === l.id ? "Turning off…" : "Turn off"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
      ) : null}
    </AccessCard>
  )
}

/** A 28 px ghost menu: "Can view ▾". */
function GhostMenu({ label, name, options, onSelect }: { label: string; name: string; options: { value: string; label: string }[]; onSelect: (v: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-ui-sm font-medium text-ink-2" aria-label={`${name}: ${label}`}>
          {label}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onSelect(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
