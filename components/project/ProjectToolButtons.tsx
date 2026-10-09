"use client"

// A project's tools that open in a dialog: its time, its intake forms,
// sharing it with a client and saving it as a template. One hook for the
// desktop header's menu and the phone's buttons, so neither layout lacks one.
// Time is for members; the rest are for the project's admins.
//
// ?tool=time opens the project's time, so a link (the demo's landing for
// people leaving Toggl, a doc) can show logged hours rather than a header
// with a clock icon somewhere in it. Only that tool, and only for someone it
// would open for; the parameter is dropped once used, like ?open= is.

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ClipboardList, Clock, Globe, LayoutTemplate, MoreHorizontal, Pencil, Users } from "@/lib/icons"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ProjectFormsDialog } from "@/components/project/ProjectFormsDialog"
import { ProjectShareDialog } from "@/components/project/ProjectShareDialog"
import { ProjectTimeDialog } from "@/components/project/ProjectTimeDialog"
import { SaveAsTemplateDialog } from "@/components/projectTemplates/SaveAsTemplateDialog"

type ToolKey = "time" | "forms" | "share" | "template"
export interface ProjectTool {
  key: ToolKey
  label: string
  Icon: typeof Clock
  open: () => void
}

/**
 * The project's dialog tools, as data plus their dialogs: the phone draws them
 * as icon buttons (ProjectToolButtons), the desktop header lists them in its
 * "⋯" menu (ProjectActionsMenu). Either way the dialogs live outside the
 * trigger, so a menu closing does not take the dialog with it.
 */
export function useProjectTools({ projectId, projectName, isAdmin, isMember }: { projectId: string; projectName?: string; isAdmin: boolean; isMember: boolean }) {
  const [open, setOpen] = useState<ToolKey | null>(null)
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const asked = params?.get("tool")
  const allowed = isAdmin || isMember
  useEffect(() => {
    // Waits for the project's info: until it says who this is, it's nobody.
    if (asked !== "time" || !allowed) return
    setOpen("time")
    const rest = new URLSearchParams(params?.toString() ?? "")
    rest.delete("tool")
    const q = rest.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [asked, allowed, params, pathname, router])

  const set = (which: ToolKey) => (o: boolean) => setOpen(o ? which : null)
  const tool = (key: ToolKey, label: string, Icon: typeof Clock): ProjectTool => ({ key, label, Icon, open: () => setOpen(key) })
  const tools: ProjectTool[] = !allowed ? [] : [
    tool("time", "Time logged on this project", Clock),
    ...(isAdmin ? [
      tool("forms", "Forms that make tasks", ClipboardList),
      tool("share", "Share with a client", Globe),
      tool("template", "Save as a template", LayoutTemplate),
    ] : []),
  ]
  const dialogs = !allowed ? null : (
    <>
      <ProjectTimeDialog projectId={projectId} projectName={projectName} isAdmin={isAdmin} open={open === "time"} onOpenChange={set("time")} />
      {isAdmin && <ProjectFormsDialog projectId={projectId} open={open === "forms"} onOpenChange={set("forms")} />}
      {isAdmin && <ProjectShareDialog projectId={projectId} open={open === "share"} onOpenChange={set("share")} />}
      {isAdmin && <SaveAsTemplateDialog projectId={projectId} projectName={projectName} open={open === "template"} onOpenChange={set("template")} />}
    </>
  )
  return { allowed, tools, dialogs }
}

export function ProjectToolButtons(props: { projectId: string; projectName?: string; isAdmin: boolean; isMember: boolean }) {
  const { allowed, tools, dialogs } = useProjectTools(props)
  if (!allowed) return null
  return (
    <>
      {tools.map(({ key, label, Icon, open }) => (
        <Button key={key} size="icon" variant="ghost" className="h-9 w-9" aria-label={label} title={label} onClick={open}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      {dialogs}
    </>
  )
}

/**
 * The desktop project header's tools: the project's time stays a button (it is
 * the one people come for, and links and the journey audit open it by name),
 * and everything else is one "⋯" menu: forms, sharing, saving as a template,
 * then renaming the project and its members for its admins. Seven unlabelled
 * icons in a row read as a toolbar nobody could parse; in a menu each one has
 * its name.
 */
export function ProjectActionsMenu({
  projectId,
  projectName,
  isAdmin,
  isMember,
  onRename,
  onMembers,
}: {
  projectId: string
  projectName?: string
  isAdmin: boolean
  isMember: boolean
  onRename: () => void
  onMembers: () => void
}) {
  const { allowed, tools, dialogs } = useProjectTools({ projectId, projectName, isAdmin, isMember })
  if (!allowed) return null
  const [first, ...rest] = tools
  return (
    <>
      {first && (
        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={first.label} title={first.label} onClick={first.open}>
          <first.Icon className="h-4 w-4" />
        </Button>
      )}
      {(rest.length > 0 || isAdmin) && (<>
      {/* Not modal: an item opens a dialog, and a modal menu closing over it
          can leave the page unclickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Project actions" title="Project actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {rest.map(({ key, label, Icon, open }) => (
            <DropdownMenuItem key={key} onSelect={open}>
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </DropdownMenuItem>
          ))}
          {isAdmin && (
            <>
              {rest.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={onRename}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
                Edit project name
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onMembers}>
                <Users className="h-4 w-4 text-muted-foreground" />
                Manage project members
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </>)}
      {dialogs}
    </>
  )
}
