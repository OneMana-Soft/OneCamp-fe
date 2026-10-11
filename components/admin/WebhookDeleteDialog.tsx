"use client"

import { useEffect, useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle } from "@/lib/icons";
import { deliveredRecently } from "@/components/admin/webhookParts"

interface WebhookData {
  id: string
  name: string
  type: "incoming" | "outgoing"
  /** When it last fired: within seven days, deleting it asks for its name. */
  last_triggered_at?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  webhook: WebhookData | null
}

// The question names the webhook and the description says what stops. The
// list sits after the description, not inside it: the description is a <p>,
// and a list inside a paragraph is invalid HTML a screen reader runs together.
//
// A webhook that delivered in the last seven days is in use somewhere, so
// deleting it asks for its name first (design v3, admin §A20 and §8.4,
// GitHub's pattern). The match is this dialog's own, so it doesn't wait on the
// confirm dialog's requireText.
export default function WebhookDeleteDialog({ open, onOpenChange, onConfirm, webhook }: Props) {
  const [typed, setTyped] = useState("")
  useEffect(() => {
    if (!open) setTyped("")
  }, [open])
  const name = webhook?.name ?? ""
  const askName = deliveredRecently(webhook?.last_triggered_at)
  const matches = !askName || typed.trim() === name.trim()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-ink" aria-hidden="true" /> Delete {name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its token stops working at once, and you can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{webhook?.type === "outgoing" ? "Nothing more is sent to the other service." : "Messages posted to it are refused."}</li>
          <li>Its delivery log stays, for the record.</li>
        </ul>
        {askName && (
          <div className="space-y-1.5">
            <label htmlFor="webhook-delete-name" className="block text-xs text-muted-foreground">
              It delivered in the last 7 days. Type <span className="font-medium text-foreground">{name}</span> to delete it.
            </label>
            <Input
              id="webhook-delete-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-require-text=""
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              if (!matches) {
                e.preventDefault()
                return
              }
              onConfirm()
            }}
            disabled={!matches}
            className={buttonVariants({ variant: "destructive" })}
          >
            Delete webhook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
