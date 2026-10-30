"use client"

import dynamic from "next/dynamic"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ErrorState } from "@/components/ui/error-state"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Bar } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { MilestoneMark } from "@/components/work/milestones/MilestoneMark"
import { useConfirm } from "@/hooks/useConfirm"
import { useProjectMilestones } from "@/hooks/useProjectMilestones"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"
import { toast } from "@/hooks/use-toast"
import { ArrowDown, ArrowUp, Link2, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from "@/lib/icons"
import { useProjectHue } from "@/lib/projectHue"
import { percentDone } from "@/lib/tasks/cycles"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { MILESTONES_MOST, alsoIn, finished, progressWords, targetWords, type Milestone } from "@/lib/work/milestones"

// Each dialog mounts when it opens, so it needs a Suspense boundary of its own
// (ssr: false): without one, its first open sends the page back to the
// route's loading skeleton until the chunk lands.
const MilestoneDialog = dynamic(() => import("./MilestoneDialog").then((m) => m.MilestoneDialog), { ssr: false })
const ShareMilestoneDialog = dynamic(() => import("./ShareMilestoneDialog").then((m) => m.ShareMilestoneDialog), { ssr: false })

/**
 * A project's milestones (linear-16), at the head of its Updates as Linear keeps
 * them on its project's overview: each with its target day, its progress over
 * the tasks the reader may open and the other projects it shows in, the next
 * unfinished one marked. Its admins add, order and take off milestones; the
 * admins of a milestone's home project edit, share and delete it.
 */
export function MilestonesSection({ projectId }: { projectId: string }) {
  const { read, milestones, canManage, create, edit, remove, share, unshare, reorder, http } = useProjectMilestones(projectId)
  const hue = useProjectHue(projectId)
  const confirm = useConfirm()
  const heading = useId()
  const [editing, setEditing] = useState<Milestone | "new" | null>(null)
  const [sharing, setSharing] = useState<Milestone | null>(null)
  // The milestone the share dialog shows, as last read.
  const shared = sharing && (milestones?.find((m) => m.id === sharing.id) ?? sharing)
  const failed = (what: string) => (e: unknown) => toast({ title: what, description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })

  const move = (i: number, by: -1 | 1) => {
    if (!milestones) return
    const ids = milestones.map((m) => m.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    reorder(ids).catch(failed("The milestones couldn't be reordered"))
  }
  /**
   * Takes a milestone off a project it shows in, once confirmed: this project,
   * from its own row (its admins), or one the share dialog names (the home's
   * admins). That project's tasks leave it; its home keeps it. The confirm
   * waits for the server, and says so there if it refuses.
   */
  const takeOff = (m: Milestone, project?: string) => {
    const nameOf = (id: string) => m.projects.find((p) => p.project_uuid.toLowerCase() === id.toLowerCase())?.project_name
    const off = nameOf(project ?? projectId) ?? "this project"
    confirm({
      title: `Take ${m.name} off ${off}?`,
      description: `Its tasks in ${off} leave it; ${nameOf(m.project_uuid) ?? "the project that made it"} keeps it.`,
      confirmText: "Take off",
      destructive: true,
      onConfirm: () => unshare(m.id, project),
    })
  }
  const drop = (m: Milestone) =>
    confirm({
      title: `Delete the milestone ${m.name}?`,
      description: m.projects.length + m.hidden_projects > 1 ? "Every project it's shared with loses it too. Its tasks stay, in no milestone." : "Its tasks stay, in no milestone.",
      confirmText: "Delete milestone",
      destructive: true,
      onConfirm: () => remove(m.id).then(() => offerUndo(deletedTitle(m.name), () => restore(http, "milestone", m.id, () => read.mutate())), failed(`${m.name} couldn't be deleted`)),
    })

  return (
    <section aria-labelledby={heading} data-milestones="" className={cn(HUE_CLASS[hue], "rounded-xl bg-raised p-4 shadow-e1")}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 id={heading} className="text-ui font-medium text-ink-1">
          Milestones
        </h2>
        {canManage && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setEditing("new")} disabled={milestones === undefined || milestones.length >= MILESTONES_MOST}>
            <Plus className="size-3.5" />
            Add
          </Button>
        )}
      </div>
      {milestones === undefined ? (
        read.isError ? (
          <ErrorState compact subject="the milestones" onRetry={() => void read.mutate()} />
        ) : (
          <div role="status" aria-label="Loading milestones" className="mt-2">
            <MilestoneRowsLoading />
          </div>
        )
      ) : milestones.length === 0 ? (
        <p className="mt-1 text-ui-sm text-ink-3" data-milestones-empty="">
          No milestones yet.{canManage ? " Add the stages this project's work goes through, each with its tasks and a target day." : ""}
        </p>
      ) : (
        <ol className="mt-2 grid gap-0.5">
          {milestones.map((m, i) => {
            const target = targetWords(m)
            const also = alsoIn(m, projectId)
            const done = finished(m.progress)
            const edits = m.home && m.can_edit
            return (
              <li key={m.id} data-milestone={m.id} data-next={m.next || undefined} className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                <MilestoneMark progress={m.progress} next={m.next} className="mt-1.5" />
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-ui font-medium text-ink-1">{m.name}</span>
                    {m.next && !done && <span className="shrink-0 text-meta font-medium text-warning-ink">Next</span>}
                    {target && (
                      <span className={cn("ml-auto shrink-0 text-meta tabular-nums", target.late ? "text-danger-ink" : "text-ink-3")} data-milestone-day="">
                        {target.late ? `Late · ${target.text}` : target.text}
                      </span>
                    )}
                  </div>
                  {m.description && <p className="line-clamp-2 text-ui-sm text-ink-2">{m.description}</p>}
                  <div className="flex items-center gap-2">
                    <Bar value={percentDone(m.progress)} label={`${m.name}, ${progressWords(m.progress)}`} className="w-28 shrink-0" />
                    <span className="truncate text-meta tabular-nums text-ink-3" data-milestone-progress="">
                      {progressWords(m.progress)}
                    </span>
                  </div>
                  {also && (
                    <p className="flex min-w-0 items-center gap-1 text-meta text-ink-3" data-milestone-shared="">
                      <Link2 className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{also}</span>
                    </p>
                  )}
                </div>
                {(canManage || edits) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`${m.name} options`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {edits && (
                        <DropdownMenuItem onSelect={() => setEditing(m)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {edits && (
                        <DropdownMenuItem onSelect={() => setSharing(m)}>
                          <Share2 className="size-3.5" />
                          Share with a project
                        </DropdownMenuItem>
                      )}
                      {canManage && i > 0 && (
                        <DropdownMenuItem onSelect={() => move(i, -1)}>
                          <ArrowUp className="size-3.5" />
                          Move up
                        </DropdownMenuItem>
                      )}
                      {canManage && i < milestones.length - 1 && (
                        <DropdownMenuItem onSelect={() => move(i, 1)}>
                          <ArrowDown className="size-3.5" />
                          Move down
                        </DropdownMenuItem>
                      )}
                      {canManage && !m.home && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-danger-ink" onSelect={() => takeOff(m)}>
                            <Trash2 className="size-3.5" />
                            Take off this project
                          </DropdownMenuItem>
                        </>
                      )}
                      {edits && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-danger-ink" onSelect={() => drop(m)}>
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {editing && (
        <MilestoneDialog
          milestone={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => (editing === "new" ? create(input) : edit(editing.id, input))}
        />
      )}
      {shared && (
        <ShareMilestoneDialog
          milestone={shared}
          onClose={() => setSharing(null)}
          onShare={(p) => share(shared.id, p)}
          onTakeOff={(p) => takeOff(shared, p)}
        />
      )}
    </section>
  )
}

/**
 * The list while it is read: rows in a milestone row's own shape and pitch
 * (a diamond, a name line, a bar line), so the first row lands where the
 * first loading row stood.
 */
function MilestoneRowsLoading() {
  return (
    <ol aria-hidden className="grid gap-0.5">
      {[0, 1, 2].map((i) => (
        <li key={i} data-milestone-loading="" className="flex items-start gap-3 px-2 py-2">
          <Skeleton className="mt-1.5 size-2.5 shrink-0 rotate-45 rounded-[2px]" />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
            <div className="flex h-4 items-center gap-2">
              <Skeleton className="h-1.5 w-28 shrink-0" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
