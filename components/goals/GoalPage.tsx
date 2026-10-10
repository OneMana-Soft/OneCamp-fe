"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { GoalDialog } from "@/components/goals/GoalDialog"
import { GoalOwner } from "@/components/goals/GoalOwner"
import { GoalProgress } from "@/components/goals/GoalProgress"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { UpdateCard } from "@/components/projectUpdates/UpdateCard"
import { UpdateComposer } from "@/components/projectUpdates/UpdateComposer"
import { UpdateText } from "@/components/projectUpdates/UpdateText"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ErrorState } from "@/components/ui/error-state"
import { kicker } from "@/components/ui/pageHeader"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"
import { useFeature, FEATURE_AI } from "@/hooks/useClientConfig"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useGoal, useGoals } from "@/hooks/useGoals"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { useToast } from "@/hooks/use-toast"
import { Megaphone, MoreHorizontal, X } from "@/lib/icons"
import {
  amount,
  checkInDue,
  dueLabel,
  measureLine,
  overdue,
  paceGap,
  paceLine,
  percent,
  progressSource,
  type GoalCheckIn,
  type GoalProjectLine,
} from "@/lib/goals"
import { cn } from "@/lib/utils/helpers/cn"
import { daysAgo } from "@/lib/utils/relativeTime"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"
import { app_project_path } from "@/types/paths"
import type { UserProfileInterface } from "@/types/user"

const GOALS_PATH = `${app_project_path}?view=goals`

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One project serving the goal: how much of it is done, what's late, and its people's last word. */
function ProjectRow({ p, canEdit, onRemove }: { p: GoalProjectLine; canEdit: boolean; onRemove: () => void }) {
  const total = p.open + p.done
  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={`${app_project_path}/${p.project_uuid}`} className="block truncate text-sm font-medium hover:underline">
          {p.project_name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {p.archived ? (
            "Archived: it no longer counts"
          ) : total === 0 ? (
            "No tasks yet: it doesn't count until it has some"
          ) : (
            <>
              {p.done} of {total} tasks done
              {p.overdue > 0 && <span className="font-medium text-danger-ink"> · {p.overdue} overdue</span>}
            </>
          )}
        </p>
      </div>
      {!p.archived && total > 0 && <GoalProgress goal={{ title: p.project_name, progress: p.progress, status: "open" }} className="w-36" />}
      <div className="flex w-36 items-center gap-1.5">
        {p.health ? <HealthPill health={p.health} /> : <span className="text-xs text-muted-foreground">No update yet</span>}
        {p.updated_at && <span className="truncate text-2xs text-muted-foreground">{daysAgo(p.updated_at)}</span>}
      </div>
      {canEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 md:pointer-events-none md:opacity-0 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          aria-label={`Take ${p.project_name} off the goal`}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  )
}

/** Adding one of the reader's projects to the goal. */
function AddProject({ linked, onAdd }: { linked: Set<string>; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const { projects } = useProjectsOverview()
  const choices = (projects ?? []).filter((p) => !linked.has(p.project_uuid))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          Add a project
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search your projects…" className="h-9" />
          <CommandList>
            <CommandEmpty>{choices.length === 0 && (projects?.length ?? 0) > 0 ? "Every project you're in is on it" : "No project found"}</CommandEmpty>
            <CommandGroup>
              {choices.map((p) => (
                <CommandItem
                  key={p.project_uuid}
                  value={`${p.project_name} ${p.project_uuid}`}
                  onSelect={() => {
                    setOpen(false)
                    onAdd(p.project_uuid)
                  }}
                >
                  <span className="truncate">{p.project_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Where a check-in moved the goal: "410 teams · 50%". */
function Moved({ c, unit }: { c: GoalCheckIn; unit?: string }) {
  if (c.value === undefined && c.progress === undefined) return null
  return (
    <p className="mb-2 text-xs tabular-nums text-muted-foreground">
      {c.value !== undefined && <span className="font-medium text-foreground">{amount(c.value, unit)}</span>}
      {c.value !== undefined && c.progress !== undefined && " · "}
      {c.progress !== undefined && `${percent(c.progress)} of the way`}
    </p>
  )
}

/**
 * A goal's page: how far it has got against its time and where it stands,
 * what serves it (projects and sub-goals, each with its own progress and last
 * word), and its check-ins, the next one drafted from all of that.
 */
export function GoalPage({ goalId }: { goalId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const hasAI = useFeature(FEATURE_AI)
  const { goals } = useGoals()
  const { goal, isLoading, isError, notFound, refresh, remove, reopen, linkProject, unlinkProject, draft, aiDraft, postCheckIn, editCheckIn, removeCheckIn } =
    useGoal(goalId)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data?.user_uuid
  const [composer, setComposer] = useState<{ editing?: GoalCheckIn } | null>(null)
  const [dialog, setDialog] = useState<"edit" | "subgoal" | null>(null)
  const [deleting, setDeleting] = useState(false)
  const now = Date.now()
  const linked = useMemo(() => new Set(goal?.project_list.map((p) => p.project_uuid)), [goal])

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <StatePlaceholder
          type="empty"
          title="This goal is gone"
          description="It was deleted, or the link is wrong. Its sub-goals, if it had any, are still there."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={GOALS_PATH}>See every goal</Link>
            </Button>
          }
        />
      </div>
    )
  }
  if (isError && !goal) return <ErrorState subject="this goal" onRetry={() => void refresh()} />
  if (isLoading || !goal) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-8" aria-busy>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const open = goal.status === "open"
  const gap = paceGap(goal)
  const late = overdue(goal, localDay())
  const due = checkInDue(goal, now)

  const composerFor = (editing?: GoalCheckIn) => (
    <UpdateComposer
      key={editing?.id ?? "new"}
      subject="goal"
      editing={editing}
      hasAI={hasAI}
      draft={draft}
      aiDraft={aiDraft}
      post={postCheckIn}
      edit={editCheckIn}
      endings={open}
      number={goal.measure === "number" && goal.current_value !== undefined ? { current: goal.current_value, unit: goal.unit ?? "" } : undefined}
      onDone={() => setComposer(null)}
    />
  )

  const act = (fn: () => Promise<unknown>, done: string) => () =>
    fn()
      .then(() => toast({ title: done }))
      .catch(() => {})

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-col gap-4">
          <nav aria-label="Where this goal is" className={cn(kicker, "flex flex-wrap items-center gap-1.5")}>
            <Link href={GOALS_PATH} className="hover:text-foreground">
              Goals
            </Link>
            {goal.parent && (
              <>
                <span aria-hidden>/</span>
                <Link href={`/app/goals/${goal.parent.id}`} className="max-w-[16rem] truncate hover:text-foreground">
                  {goal.parent.title}
                </Link>
              </>
            )}
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {/* No target icon before the title: the breadcrumb already says it is a goal. */}
              <div className="min-w-0 space-y-1.5">
                <h1 className="font-display text-2xl font-semibold text-balance">{goal.title}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <GoalOwner owner={goal.owner} />
                  <span className={cn(late && "font-medium text-danger-ink")}>
                    {open ? (late ? "Was due" : "Due") : "Was due"} {dueLabel(goal.due_date)}
                  </span>
                  {!open && <HealthPill health={goal.status} />}
                  {open && goal.health && <HealthPill health={goal.health} />}
                </div>
              </div>
            </div>
            {goal.can_edit && (
              <div className="flex items-center gap-2">
                {open && !composer && (
                  <Button size="sm" variant={due ? "default" : "outline"} className="gap-1.5" onClick={() => setComposer({})}>
                    <Megaphone className="h-4 w-4" />
                    Check in
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More for this goal">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog("edit")}>Edit the goal</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog("subgoal")}>Add a sub-goal</DropdownMenuItem>
                    {!open && <DropdownMenuItem onSelect={act(reopen, "Goal reopened")}>Reopen the goal</DropdownMenuItem>}
                    <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onSelect={() => setDeleting(true)}>
                      Delete the goal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          {goal.description && (
            <div className="max-w-prose text-sm text-muted-foreground">
              <UpdateText body={goal.description} />
            </div>
          )}
        </header>

        <section aria-label="Progress" className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {/* Proportional figures at display size; nothing measured yet is said, not drawn as a dash. */}
              {goal.progress === null ? (
                <p className="text-lg font-medium text-muted-foreground">Nothing to measure yet</p>
              ) : (
                <p className="font-display text-4xl font-semibold">{percent(goal.progress)}</p>
              )}
              <p className="text-sm text-muted-foreground">{progressSource(goal)}</p>
            </div>
            {gap !== undefined && (
              <p className={cn("text-sm font-medium", gap <= -25 ? "text-danger-ink" : gap <= -10 ? "text-warning-ink" : "text-success-ink")}>{paceLine(gap)}</p>
            )}
          </div>
          <GoalProgress goal={goal} showLabel={false} />
          {goal.expected !== undefined && open && (
            <p className="text-xs text-muted-foreground">
              The tick is where it would be by now if it moved evenly: {percent(goal.expected)} of its time has gone.
            </p>
          )}
        </section>

        {composer && !composer.editing && composerFor()}

        {(goal.measure === "projects" || goal.project_list.length > 0 || goal.hidden_projects > 0) && (
          <Section
            title="Projects serving it"
            action={goal.can_edit && <AddProject linked={linked} onAdd={(id) => void act(() => linkProject(id), "Project added")()} />}
          >
            {goal.project_list.length === 0 && goal.hidden_projects === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No project serves this goal yet. {goal.can_edit ? "Add the projects whose work moves it; their done tasks fill in its progress." : ""}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {goal.project_list.map((p) => (
                  <ProjectRow
                    key={p.project_uuid}
                    p={p}
                    canEdit={goal.can_edit}
                    onRemove={act(() => unlinkProject(p.project_uuid), "Project taken off the goal")}
                  />
                ))}
                {goal.hidden_projects > 0 && (
                  <li className="px-1 text-xs text-muted-foreground">
                    And {goal.hidden_projects === 1 ? "1 project" : `${goal.hidden_projects} projects`} you&apos;re not in, which count
                    {goal.hidden_projects === 1 ? "s" : ""} too.
                  </li>
                )}
              </ul>
            )}
          </Section>
        )}

        {(goal.measure === "subgoals" || goal.subgoal_list.length > 0) && (
          <Section
            title="Sub-goals"
            action={
              goal.can_edit && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialog("subgoal")}>
                  Add a sub-goal
                </Button>
              )
            }
          >
            {goal.subgoal_list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No sub-goals yet. Each team&apos;s or person&apos;s part of this goal goes under it, and their progress averages into it.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {goal.subgoal_list.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/goals/${s.id}`} className="block truncate text-sm font-medium hover:underline">
                        {s.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {measureLine(s)} · due {dueLabel(s.due_date)}
                      </p>
                    </div>
                    <GoalOwner owner={s.owner} compact />
                    <GoalProgress goal={s} className="w-36" />
                    <div className="w-24">
                      {s.status !== "open" ? (
                        <HealthPill health={s.status} />
                      ) : s.health ? (
                        <HealthPill health={s.health} />
                      ) : (
                        <span className="text-xs text-muted-foreground">No check-in</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Check-ins">
          {goal.checkins.length === 0 ? (
            !composer && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="max-w-md text-sm text-muted-foreground">
                  {goal.can_edit
                    ? "A check-in says where the goal stands, with a short note. OneCamp drafts it from what serves the goal: how far each project got and what's late."
                    : "Its owner's check-ins show here: where the goal stands, and what changed."}
                </p>
                {goal.can_edit && open && <Button onClick={() => setComposer({})}>Check in</Button>}
              </div>
            )
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Check-ins, newest first">
              {goal.checkins.map((c) =>
                composer?.editing?.id === c.id ? (
                  <li key={c.id}>{composerFor(c)}</li>
                ) : (
                  <li key={c.id}>
                    <UpdateCard
                      update={c}
                      now={now}
                      noun="check-in"
                      detail={<Moved c={c} unit={goal.unit} />}
                      canEdit={c.author_uuid === me}
                      canDelete={goal.can_edit || c.author_uuid === me}
                      onEdit={() => setComposer({ editing: c })}
                      onDelete={() => void removeCheckIn(c.id).catch(() => {})}
                    />
                  </li>
                ),
              )}
            </ol>
          )}
        </Section>
      </div>

      {dialog && (
        <GoalDialog
          goals={goals ?? []}
          editing={dialog === "edit" ? goal : undefined}
          parentId={dialog === "subgoal" ? goal.id : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => {
            toast({ title: dialog === "edit" ? "Goal saved" : "Sub-goal added" })
            setDialog(null)
          }}
        />
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              Its check-ins go with it. Its projects stay as they are, and its sub-goals move up to {goal.parent ? `"${goal.parent.title}"` : "the top"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                void remove()
                  .then(() => {
                    toast({ title: "Goal deleted" })
                    router.push(GOALS_PATH)
                  })
                  .catch(() => {})
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
