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
import { Archive, Bell, ClipboardList, Clock, Globe, LayoutTemplate, Link2, MoreHorizontal, Pencil, RotateCcw, Users } from "@/lib/icons"
import { useArchiveProject } from "@/hooks/useArchiveProject"
import { appMutate } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import { app_project_path } from "@/types/paths"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationLevelItems, notificationLevelLabel } from "@/components/Notification/notificationLevels"
import dynamic from "next/dynamic"

// The project's tools are dialogs nobody needs until they are asked for, so
// each is its own chunk, fetched on first open (the project route's script
// grew 80 KB with them in it, 11 Oct). Each waits for its chunk in a Suspense
// boundary of its own (`loading`): without one, the chunk suspended the whole
// page into the route's loading skeleton, and the list behind came back empty
// (components/task/lazyBoundary.test.ts). They start loading as soon as the
// menu's button or the time button is pointed at, so they open at once.
const ProjectFormsDialog = dynamic(() => import("@/components/project/ProjectFormsDialog").then((m) => m.ProjectFormsDialog), { loading: () => null })
const ProjectShareDialog = dynamic(() => import("@/components/project/ProjectShareDialog").then((m) => m.ProjectShareDialog), { loading: () => null })
const ProjectTimeDialog = dynamic(() => import("@/components/project/ProjectTimeDialog").then((m) => m.ProjectTimeDialog), { loading: () => null })
const SaveAsTemplateDialog = dynamic(() => import("@/components/projectTemplates/SaveAsTemplateDialog").then((m) => m.SaveAsTemplateDialog), { loading: () => null })

/** Starts the menu's dialogs loading, so the one chosen opens without a wait. */
function warmTools() {
  void import("@/components/project/ProjectFormsDialog")
  void import("@/components/project/ProjectShareDialog")
  void import("@/components/projectTemplates/SaveAsTemplateDialog")
}
const warmTime = () => void import("@/components/project/ProjectTimeDialog")

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
  // A dialog renders (and its chunk loads) from its first opening on.
  const [opened, setOpened] = useState<Set<ToolKey>>(() => new Set())
  useEffect(() => {
    if (open && !opened.has(open)) setOpened((s) => new Set(s).add(open))
  }, [open, opened])
  const was = (k: ToolKey) => open === k || opened.has(k)
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
      {was("time") && <ProjectTimeDialog projectId={projectId} projectName={projectName} isAdmin={isAdmin} open={open === "time"} onOpenChange={set("time")} />}
      {isAdmin && was("forms") && <ProjectFormsDialog projectId={projectId} open={open === "forms"} onOpenChange={set("forms")} />}
      {isAdmin && was("share") && <ProjectShareDialog projectId={projectId} open={open === "share"} onOpenChange={set("share")} />}
      {isAdmin && was("template") && <SaveAsTemplateDialog projectId={projectId} projectName={projectName} open={open === "template"} onOpenChange={set("template")} />}
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
        <Button key={key} size="icon" variant="ghost" className="h-11 w-11" aria-label={label} title={label} onClick={open}>
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
/** A row the menu's caller adds after the project's tools. */
export interface ProjectMenuExtra {
  key: string
  label: string
  /** A short value on the row's right ("All messages"). */
  detail?: string
  Icon: React.ComponentType<{ className?: string }>
  onSelect: () => void
}

export function ProjectActionsMenu({
  projectId,
  projectName,
  isAdmin,
  isMember,
  onRename,
  onMembers,
  compact = false,
  extra,
  archived = false,
  notifications,
}: {
  projectId: string
  projectName?: string
  isAdmin: boolean
  isMember: boolean
  onRename?: () => void
  onMembers?: () => void
  /** Archived: its admins see Restore project in place of Archive project. */
  archived?: boolean
  /** The person's notification level and how to change it: a Notifications item whose levels are picked, not cycled. */
  notifications?: { level: string; onChoose: (level: string) => void }
  /** The phone: every tool in the one menu (work.md W53), none as a bare icon. */
  compact?: boolean
  /**
   * More rows after the tools (the phone's notifications, rename and
   * members, which the top bar's own "⋯" sheet held until the two met).
   */
  extra?: ProjectMenuExtra[]
}) {
  const { allowed, tools: allTools, dialogs } = useProjectTools({ projectId, projectName, isAdmin, isMember })
  const tools = allowed ? allTools : []
  // Archive from the project itself (PTC-13); it was only on the team's page
  // and the phone's long press. An archived project leaves the person's
  // projects, so they go back to them.
  const router = useRouter()
  const { archive, restore } = useArchiveProject()
  const archiveIt = () =>
    archive(projectId, {
      name: projectName,
      done: () => {
        void appMutate(GetEndpointUrl.SelfProfile)
        router.push(app_project_path)
      },
    })
  // The page reads "archived" from the project's own answer: read it again.
  const restoreIt = () =>
    restore(projectId, {
      name: projectName,
      done: () => {
        void appMutate(GetEndpointUrl.SelfProfile)
        void appMutate(`${GetEndpointUrl.GetProjectInfo}/${projectId}`)
      },
    })
  if (!allowed && !extra?.length) return null
  // Sharing with a client is a word in the header bar (design v3, work.md
  // W16); the time button is the clock beside it; the rest is one menu.
  const share = compact ? undefined : tools.find((t) => t.key === "share")
  const listed = tools.filter((t) => t.key !== "share" || compact)
  const first = compact ? undefined : listed[0]
  const rest = compact ? listed : listed.slice(1)
  return (
    <>
      {share && (
        <Button size="sm" variant="ghost" className="text-ui-sm" onClick={share.open}>
          <Link2 className="size-3.5" />
          Share
        </Button>
      )}
      {first && (
        <Button size="icon-sm" variant="ghost" aria-label={first.label} title={first.label} onClick={first.open} onPointerEnter={warmTime} onFocus={warmTime}>
          <first.Icon className="size-4" />
        </Button>
      )}
      {(rest.length > 0 || isAdmin || !!extra?.length || !!notifications) && (<>
      {/* Not modal: an item opens a dialog, and a modal menu closing over it
          can leave the page unclickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Project actions" title="Project actions" onPointerEnter={warmTools} onFocus={warmTools}>
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
          {isAdmin && onRename && onMembers && (
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
          {notifications && (
            <>
              {rest.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">Notifications</span>
                  <span className="shrink-0 text-meta text-ink-3">{notificationLevelLabel(notifications.level)}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-64">
                    <NotificationLevelItems level={notifications.level} onChoose={notifications.onChoose} />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </>
          )}
          {extra?.length ? (
            <>
              {(rest.length > 0 || !!notifications) && <DropdownMenuSeparator />}
              {extra.map(({ key, label, detail, Icon, onSelect }) => (
                <DropdownMenuItem key={key} onSelect={onSelect}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {detail ? <span className="shrink-0 text-meta text-ink-3">{detail}</span> : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {/* What takes the project away is alone, and last (design v3, mobile C7). */}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem onSelect={restoreIt}>
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  Restore project
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={archiveIt} variant="destructive">
                  <Archive className="h-4 w-4" />
                  Archive project…
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </>)}
      {dialogs}
    </>
  )
}
