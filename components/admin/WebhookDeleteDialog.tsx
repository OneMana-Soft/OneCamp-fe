"use client"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { AlertTriangle } from "@/lib/icons";

interface WebhookData {
  id: string
  name: string
  type: "incoming" | "outgoing"
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
export default function WebhookDeleteDialog({ open, onOpenChange, onConfirm, webhook }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-ink" aria-hidden="true" /> Delete {webhook?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its token stops working at once, and you can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{webhook?.type === "outgoing" ? "Nothing more is sent to the other service." : "Messages posted to it are refused."}</li>
          <li>Its delivery log stays, for the record.</li>
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={buttonVariants({ variant: "destructive" })}>
            Delete webhook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
