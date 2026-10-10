"use client"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { RefreshCw, AlertTriangle } from "@/lib/icons";

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  repoCount: number
  isSubmitting: boolean
}

// What stops is listed after the description, not inside it: the description
// is a <p>, and a box and a list inside a paragraph is invalid HTML.
export default function GitHubDisconnectDialog({ open, onOpenChange, onConfirm, repoCount, isSubmitting }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-ink" aria-hidden="true" /> Disconnect GitHub?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Everything below stops at once, and you can&apos;t undo this. You can connect GitHub again later and link the repositories afresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-danger-ink">
          <p className="mb-1 font-medium">This will:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Unlink {repoCount} linked {repoCount === 1 ? "repository" : "repositories"}</li>
            <li>Clear GitHub details from every task</li>
            <li>Revoke OneCamp&apos;s access to GitHub</li>
            <li>Stop taking in GitHub events</li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting} className={buttonVariants({ variant: "destructive" })}>
            {isSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? "Disconnecting…" : "Disconnect GitHub"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
