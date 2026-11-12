"use client"

// A saved view's Add to dashboard (B9-b4), in the Display menu's view rows and
// the phone's saved views: a button that opens the one shared dialog
// (addToDashboardPiece). A file of its own, so Reports' first load carries
// only the dialog's way in.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { AddToDashboardDialog, warmAddToDashboard } from "@/components/dashboards/addToDashboardPiece"
import { LayoutDashboard } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { SavedTaskView } from "@/lib/tasks/views"

/** A saved view's Add to dashboard: its button in the view's row, and the dialog it opens. `project` is the list's (none for My Tasks). */
export function AddViewToDashboard({ view, project, className }: { view: Pick<SavedTaskView, "id" | "name">; project?: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 shrink-0 text-muted-foreground", className)}
        aria-label={`Add ${view.name} to a dashboard`}
        title="Add to a dashboard"
        onPointerEnter={warmAddToDashboard}
        onFocus={warmAddToDashboard}
        onClick={() => setOpen(true)}
        data-add-view-to-dashboard=""
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
      </Button>
      {open && <AddToDashboardDialog preset={{ query: { view: view.id } }} viewName={view.name} project={project} onClose={() => setOpen(false)} />}
    </>
  )
}
