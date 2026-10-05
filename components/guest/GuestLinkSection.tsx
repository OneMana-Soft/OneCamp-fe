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

import { eyebrowClass } from "@/components/ui/eyebrow"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Copy, Check, ExternalLink, Link2, Globe } from "@/lib/icons"
import { createGuestLink, guestResourceLink, type GuestCapability, type GuestResourceType } from "@/services/guestService"

interface GuestLinkSectionProps {
  resourceType: GuestResourceType
  resourceId: string
  canShare: boolean
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
const RESOURCE: Record<GuestResourceType, {
  noun: string
  write: GuestCapability | null
  viewLabel: string
  writeLabel?: string
  title: string
  blurb: string
}> = {
  doc: { noun: "document", write: "comment", viewLabel: "Can view", writeLabel: "Can comment", title: "Create an external link", blurb: "Anyone with the link can view this document, read only. No account needed." },
  board: { noun: "board", write: null, viewLabel: "Can view", title: "Create an external link", blurb: "Anyone with the link can view this board, read only. No account needed." },
  table: { noun: "table", write: null, viewLabel: "Can view", title: "Create an external link", blurb: "Anyone with the link can view this table, read only. No account needed." },
  channel: {
    noun: "channel", write: "post", viewLabel: "Can read", writeLabel: "Can read and post", title: "Invite a guest",
    blurb: "Invite someone from another company to this channel. They read and reply from the link, with no account, and see nothing else of the workspace.",
  },
  project: {
    noun: "project", write: "comment", viewLabel: "Can see tasks", writeLabel: "Can see and comment", title: "Share with a client",
    blurb: "A client follows this project's tasks from a link: names, status, dates, assignees and descriptions. With comments on, they also read and write each task's comments. No account needed.",
  },
}

export function GuestLinkSection({ resourceType, resourceId, canShare }: GuestLinkSectionProps) {
  const { toast } = useToast()
  const [ttlHours, setTtlHours] = React.useState(EXPIRY_OPTIONS[1].hours) // 14 days
  const [capability, setCapability] = React.useState<GuestCapability>(resourceType === "channel" ? "post" : "view")
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [open, setOpen] = React.useState(false)

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
    } catch (e: any) {
      const status = e?.response?.status
      toast({
        title: "Couldn't create link",
        // The server says which it was: guest access off, or not allowed to
        // share this resource.
        description:
          e?.response?.data?.msg ||
          (status === 403 ? `Guest access is off for this workspace, or you can't share this ${noun}.` : "Please try again."),
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
    <div className="flex flex-col gap-3 pt-4 border-t border-border">
      <Label className={eyebrowClass}>
        Share to web
      </Label>

      {!open && !link && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-md p-2 -mx-2 text-left transition-colors hover:bg-muted/50"
        >
          <div className="rounded-full bg-muted p-2 text-muted-foreground">
            <Globe className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{kind.title}</span>
            <span className="text-xs text-muted-foreground">{kind.blurb}</span>
          </div>
        </button>
      )}

      {open && !link && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-2xs text-muted-foreground">Link expires</Label>
            <Select value={String(ttlHours)} onValueChange={(v) => setTtlHours(Number(v))}>
              <SelectTrigger className="h-9">
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
            <div className="flex-1 space-y-1.5">
              <Label className="text-2xs text-muted-foreground">Permission</Label>
              <Select value={capability} onValueChange={(v) => setCapability(v as GuestCapability)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">{kind.viewLabel}</SelectItem>
                  {writeCapability && <SelectItem value={writeCapability}>{kind.writeLabel}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating} className="h-9 shrink-0">
            <Link2 className="mr-1.5 h-4 w-4" />
            {creating ? "Creating…" : "Create link"}
          </Button>
        </div>
      )}

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
            Copy this link now, it won&apos;t be shown again. Revoke it any time from admin settings.
          </p>
        </div>
      )}
    </div>
  )
}

