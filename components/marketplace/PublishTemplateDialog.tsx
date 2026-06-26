"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, Sparkles } from "@/lib/icons"
import { TemplateKind, publishTemplate } from "@/services/marketplaceService"

// PublishTemplateDialog is a reusable dialog for publishing something the user
// built (an agent, automation, or table) as a reusable template. The caller
// passes the kind and the stable payload (the create-input the backend replays
// on install).
export function PublishTemplateDialog({
  open,
  onOpenChange,
  kind,
  payload,
  defaultName,
  defaultIcon,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: TemplateKind
  payload: unknown
  defaultName?: string
  defaultIcon?: string
  onPublished?: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = React.useState(defaultName || "")
  const [description, setDescription] = React.useState("")
  const [icon, setIcon] = React.useState(defaultIcon || "")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(defaultName || "")
      setIcon(defaultIcon || "")
      setDescription("")
    }
  }, [open, defaultName, defaultIcon])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ title: "Give your template a name", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      await publishTemplate({
        kind,
        name: trimmed,
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        payload,
      })
      toast({ title: "Saved as a template" })
      onOpenChange(false)
      onPublished?.()
    } catch {
      // surfaced by interceptor
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Save as template
          </DialogTitle>
          <DialogDescription>
            Share this {kind} so teammates can install their own copy in one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does it do? When should someone use it?"
              className="min-h-[70px]"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Icon (emoji, optional)</label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} className="w-24" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PublishTemplateDialog
