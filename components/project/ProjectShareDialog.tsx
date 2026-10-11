"use client"

// Share a project with a client: a link to its tasks by status, and, if the
// admin allows it, the tasks' comments. Basecamp's client access, without
// giving the client an account.

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { Check, Eye, Lock } from "@/lib/icons"

/**
 * What the client will see (design v3, work.md W50): their page in miniature,
 * the project's light and tile, a ring and the Guest tag, then what they can
 * and can't do, in words.
 */
export function ClientPreview({ projectId }: { projectId: string }) {
  return (
    <div data-client-preview="" className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
      <div aria-hidden="true" className={`${HUE_CLASS[hueFor(projectId)]} relative overflow-hidden rounded-lg bg-frame p-2`}>
        <div className="absolute inset-x-0 top-0 h-12 [background:radial-gradient(160px_48px_at_30px_0px,color-mix(in_oklab,var(--hue)_14%,transparent),transparent)]" />
        <div className="relative grid gap-2 rounded-md bg-sheet p-2 shadow-e1">
          <div className="flex items-center gap-1.5">
            <ProjectTile id={projectId} size={16} />
            <span className="h-1.5 w-12 rounded-sm bg-press" />
            <span className="ml-auto rounded-sm bg-camp-sun-tint px-1 text-micro font-medium text-camp-sun-ink">Guest</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[3, 2, 1].map((n, i) => (
              <div key={i} className="grid content-start gap-1 rounded-sm bg-sunken p-1">
                {Array.from({ length: n }, (_, k) => <span key={k} className="h-2 rounded-[2px] bg-raised shadow-e1" />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <ul className="grid content-center gap-1.5 text-xs text-ink-2">
        <li className="flex items-start gap-2"><Eye className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden="true" />Its tasks by status, its timeline and the updates you share.</li>
        <li className="flex items-start gap-2"><Check className="mt-px size-3.5 shrink-0 text-camp-moss" aria-hidden="true" />Comments and approvals, if you allow them.</li>
        <li className="flex items-start gap-2"><Lock className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden="true" />No other project, channel or person&apos;s profile.</li>
      </ul>
    </div>
  )
}

export function ProjectShareDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with a client</DialogTitle>
          <DialogDescription>Clients see where their work stands without asking, and need no account.</DialogDescription>
        </DialogHeader>
        <ClientPreview projectId={projectId} />
        {/* Remounted on each open so a link shown once isn't shown again. */}
        {open && <GuestLinkSection resourceType="project" resourceId={projectId} canShare embedded />}
      </DialogContent>
    </Dialog>
  )
}
