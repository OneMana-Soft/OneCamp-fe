"use client"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { RefreshCw, AlertTriangle } from "@/lib/icons";

interface LinkData {
  id: string
  repo_owner: string
  repo_name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  link: LinkData | null
  isSubmitting: boolean
}

// The question names the repository; what stops is listed after the
// description rather than inside its <p>, which made the HTML invalid.
export default function GitHubUnlinkDialog({ open, onOpenChange, onConfirm, link, isSubmitting }: Props) {
  const repo = link ? `${link.repo_owner}/${link.repo_name}` : "this repository"
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-ink" aria-hidden="true" />
            <span translate="no">Unlink {repo}?</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its tasks keep their content, and you can&apos;t undo this. You can link it again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* What stops, as a plain list on the sunken surface: the red,
            bordered box made every line read as an error (design v3, H3). */}
        <div className="rounded-lg bg-sunken p-3 text-sm text-foreground">
          <p className="mb-1 font-medium">This will:</p>
          {/* What unlinking does, no more: only the repository's issues and
              pull requests come off the tasks, and the webhook, which every
              project linking the repository shares, stays while another
              project still links it. */}
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Take its issues and pull requests off this project&apos;s tasks. Links to the project&apos;s other repositories stay</li>
            <li>Stop taking in its events for this project</li>
            <li>Remove OneCamp&apos;s webhook from the repository, unless another project still links it</li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting} className={buttonVariants({ variant: "destructive" })}>
            {isSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? "Unlinking…" : "Unlink repository"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
