"use client"

// Share a project with a client: a link to its tasks by status, and, if the
// admin allows it, the tasks' comments. Basecamp's client access, without
// giving the client an account.

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"

export function ProjectShareDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with a client</DialogTitle>
          <DialogDescription>
            Clients see where their work stands without asking. They can&apos;t see other projects, channels or people&apos;s profiles.
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on each open so a link shown once isn't shown again. */}
        {open && <GuestLinkSection resourceType="project" resourceId={projectId} canShare />}
      </DialogContent>
    </Dialog>
  )
}
