"use client"

// A project's tools that open in a dialog: its time, its intake forms and
// sharing it with a client. One component for the desktop header and the
// phone's project page, so neither layout lacks one. Time is for members;
// forms and sharing are for the project's admins.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ClipboardList, Clock, Globe } from "@/lib/icons"
import { ProjectFormsDialog } from "@/components/project/ProjectFormsDialog"
import { ProjectShareDialog } from "@/components/project/ProjectShareDialog"
import { ProjectTimeDialog } from "@/components/project/ProjectTimeDialog"

export function ProjectToolButtons({ projectId, projectName, isAdmin, isMember }: { projectId: string; projectName?: string; isAdmin: boolean; isMember: boolean }) {
  const [open, setOpen] = useState<"time" | "forms" | "share" | null>(null)
  if (!isAdmin && !isMember) return null
  const set = (which: typeof open) => (o: boolean) => setOpen(o ? which : null)
  const tool = (which: Exclude<typeof open, null>, label: string, Icon: typeof Clock) => (
    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={label} title={label} onClick={() => setOpen(which)}>
      <Icon className="h-4 w-4" />
    </Button>
  )
  return (
    <>
      {tool("time", "Time logged on this project", Clock)}
      {isAdmin && tool("forms", "Forms that make tasks", ClipboardList)}
      {isAdmin && tool("share", "Share with a client", Globe)}
      <ProjectTimeDialog projectId={projectId} projectName={projectName} open={open === "time"} onOpenChange={set("time")} />
      {isAdmin && <ProjectFormsDialog projectId={projectId} open={open === "forms"} onOpenChange={set("forms")} />}
      {isAdmin && <ProjectShareDialog projectId={projectId} open={open === "share"} onOpenChange={set("share")} />}
    </>
  )
}
