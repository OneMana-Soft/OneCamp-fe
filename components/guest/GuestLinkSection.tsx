"use client"

/**
 * GuestLinkSection — an inline "Share to web" panel for the share dialog. Mints
 * a scoped, expiring, READ-ONLY external link for a doc or board so people
 * without a OneCamp account can view the live resource. The raw token is shown
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
import { Copy, Check, ExternalLink, Link2, Globe } from "@/lib/icons"
import { createGuestLink, guestResourceLink } from "@/services/guestService"

interface GuestLinkSectionProps {
  resourceType: "doc" | "board" | "table"
  resourceId: string
  canShare: boolean
}

const EXPIRY_OPTIONS = [
  { label: "7 days", hours: 24 * 7 },
  { label: "14 days", hours: 24 * 14 },
  { label: "30 days", hours: 24 * 30 },
  { label: "90 days", hours: 24 * 90 },
]

export function GuestLinkSection({ resourceType, resourceId, canShare }: GuestLinkSectionProps) {
  const { toast } = useToast()
  const [ttlHours, setTtlHours] = React.useState(EXPIRY_OPTIONS[1].hours) // 14 days
  const [capability, setCapability] = React.useState<"view" | "comment">("view")
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  if (!canShare) return null

  // Comment access is only meaningful for docs (the one resource with a
  // structured comment thread); boards/tables are view-only externally.
  const supportsComment = resourceType === "doc"
  const noun = resourceType === "board" ? "board" : resourceType === "table" ? "table" : "document"

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await createGuestLink(resourceType, resourceId, ttlHours, supportsComment ? capability : "view")
      setLink(guestResourceLink(resourceType, res.token))
    } catch (e: any) {
      const status = e?.response?.status
      toast({
        title: "Couldn't create link",
        description:
          status === 403
            ? `Guest access is off for this workspace, or you need edit access to share this ${noun}.`
            : e?.response?.data?.msg || "Please try again.",
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
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
            <span className="text-sm font-medium">Create an external link</span>
            <span className="text-xs text-muted-foreground">
              Anyone with the link can view this {noun}, read only. No account needed.
            </span>
          </div>
        </button>
      )}

      {open && !link && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-2xs text-muted-foreground">Link expires after</Label>
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
              <Select value={capability} onValueChange={(v) => setCapability(v as "view" | "comment")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="comment">Can comment</SelectItem>
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

export default GuestLinkSection
