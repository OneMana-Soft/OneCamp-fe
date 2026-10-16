"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { GoalDialog } from "@/components/goals/GoalDialog"
import { GoalOwner } from "@/components/goals/GoalOwner"
import { GoalProgress, GoalRing } from "@/components/goals/GoalProgress"
import { Bar } from "@/components/ui/progress"
import { celebrateCamp } from "@/lib/celebrate"
import { HealthPill, HealthWord } from "@/components/projectUpdates/HealthPill"
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
import { usePageName } from "@/lib/utils/pageName"
import { daysAgo } from "@/lib/utils/relativeTime"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
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
      {/* At least 14rem before the progress and health wrap under it: on a
          phone the name was squeezed to one word a line beside them. The
          project's own colour leads it, as everywhere else. */}
      <div className="min-w-[min(100%,14rem)] flex-1">
        <Link href={`${app_project_path}/${p.project_uuid}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
          <ProjectTile id={p.project_uuid} size={16} />
          <span className="truncate">{p.project_name}</span>
        </Link>
        <p className="pl-[18px] text-xs text-muted-foreground">
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
          className="h-7 w-7 pointer-coarse:h-11 pointer-coarse:w-11 md:pointer-events-none md:opacity-0 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
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

/** Where a check-in moved the goal (W43): "4.5 → 3.5 h" as a chip, from the check-in before it. */
function Moved({ c, prev, unit }: { c: GoalCheckIn; prev?: GoalCheckIn; unit?: string }) {
  if (c.value === undefined && c.progress === undefined) return null
  return (
    <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-ink-2">
      {c.value !== undefined && (
        <span data-moved="" className="chip h-6 text-foreground">
          {prev?.value !== undefined && prev.value !== c.value ? `${prev.value} → ${amount(c.value, unit)}` : amount(c.value, unit)}
        </span>
      )}
      {c.progress !== undefined && <span>{percent(c.progress)} of the way</span>}
    </p>
  )
}

/** A health's signal colour, for a check-in's dot on the rail. */
const RAIL_DOT: Record<string, string> = {
  on_track: "bg-camp-moss",
  at_risk: "bg-camp-sun",
  off_track: "bg-destructive",
  achieved: "bg-camp-moss",
  missed: "bg-destructive",
}

/**
 * The goal's values over its check-ins (W43): a 1.5 px moss line with a 10 %
 * area under it and a 4 px dot at its end, drawn once on reveal (600 ms), with
 * where it started and where it is aiming as ink-3 words. Two or more
 * check-ins with a value draw it; fewer have nothing to show.
 */
export function GoalSparkline({ points, start, target }: { points: number[]; start?: string; target?: string }) {
  if (points.length < 2) return null
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const range = hi - lo || 1
  const W = 300
  const H = 64
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, H - 4 - ((v - lo) / range) * (H - 8)] as const)
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const [ex, ey] = xy[xy.length - 1]
  return (
    <div data-goal-sparkline="" className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-16 w-full overflow-visible" aria-hidden="true">
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="var(--camp-moss)" fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--camp-moss)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray={1}
          style={{ animation: "work-tick-draw 600ms var(--ease-out) both" }}
        />
      </svg>
      <span aria-hidden="true" className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-camp-moss" style={{ left: `${(ex / W) * 100}%`, top: ey }} />
      {(start || target) && (
        <div className="mt-1 flex justify-between text-xs text-ink-3">
          <span>{start}</span>
          <span>{target}</span>
        </div>
      )}
    </div>
  )
}

/**
 * A goal's page/**
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
  // The tab says the goal's name: it said "OneCamp" (PTC-38).
  usePageName(goal?.title)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data?.user_uuid
  const [composer, setComposer] = useState<{ editing?: GoalCheckIn } | null>(null)
  const [dialog, setDialog] = useState<"edit" | "subgoal" | null>(null)
  const [deleting, setDeleting] = useState(false)
  const now = Date.now()
  const linked = useMemo(() => new Set(goal?.project_list.map((p) => p.project_uuid)), [goal])
  // The Camp tier (W04, W43): a check-in by this person that takes the goal
  // to its target fires once, from the hero ring, remembered per person.
  const ringRef = useRef<HTMLDivElement>(null)
  const checkInsBefore = useRef<number | null>(null)
  useEffect(() => {
    if (!goal || checkInsBefore.current === null || goal.checkins.length <= checkInsBefore.current) return
    checkInsBefore.current = null
    if ((goal.progress ?? 0) >= 1 || goal.status === "achieved") {
      if (celebrateCamp(ringRef.current, "goal", goal.id)) toast({ title: `${goal.title} reached its target.` })
    }
  }, [goal, toast])

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
  const target = goal.measure === "number" && goal.target_value !== undefined ? amount(goal.target_value, goal.unit) : undefined
  // Oldest first: the value each check-in left, else how far along it was.
  const history = [...goal.checkins].reverse()
  const byValue = history.filter((c) => c.value !== undefined).map((c) => c.value as number)
  const spark = byValue.length >= 2 ? byValue : history.filter((c) => c.progress !== undefined).map((c) => (c.progress as number) * 100)
  const sparkFrom = byValue.length >= 2 && goal.start_value !== undefined ? `Started at ${amount(goal.start_value, goal.unit)}` : undefined

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
      onDone={() => {
        if (!editing) checkInsBefore.current = goal.checkins.length
        setComposer(null)
      }}
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
                <h1 className="text-title-1 font-[590] text-balance">{goal.title}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <GoalOwner owner={goal.owner} />
                  <span className={cn(late && "font-medium text-danger-ink")}>
                    {open ? (late ? "Was due" : "Due") : "Was due"} {dueLabel(goal.due_date)}
                  </span>
                  {!open && <HealthWord health={goal.status} />}
                  {open && goal.health && <HealthWord health={goal.health} />}
                </div>
              </div>
            </div>
            {goal.can_edit && (
              <div className="flex items-center gap-2">
                {open && !composer && (
                  <Button size="sm" className="gap-1.5" data-due={due || undefined} onClick={() => setComposer({})}>
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

        {/* The hero (W43): a 96 px ring that fills on reveal, what it measures,
            the pace bar with its tick and the words for ahead or behind, and
            the line of its check-ins. */}
        <section aria-label="Progress" data-goal-hero="" className="flex flex-col gap-6 rounded-lg bg-raised p-6 shadow-e1 sm:flex-row sm:items-center">
          <div ref={ringRef} className="flex shrink-0 justify-center">
            <GoalRing goal={goal} size={96} weight={6} duration={480}>
              {goal.progress !== null && (
                <span className="flex flex-col items-center">
                  <span className="text-title-1 font-semibold tabular-nums text-foreground">{percent(goal.progress)}</span>
                  {target && <span className="max-w-[72px] truncate text-3xs text-ink-3">of {target}</span>}
                </span>
              )}
            </GoalRing>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {goal.progress === null ? (
              <p className="text-body text-ink-2">Nothing to measure yet</p>
            ) : (
              <p className="text-body text-foreground">{progressSource(goal)}</p>
            )}
            {goal.progress !== null && (
              <Bar
                value={Math.round(Math.min(1, Math.max(0, goal.progress)) * 100)}
                size={8}
                pace={goal.expected !== undefined && open ? Math.round(goal.expected * 100) : undefined}
                label={`${goal.title}: ${percent(goal.progress)} of the way${goal.expected !== undefined && open ? `, with ${percent(goal.expected)} of its time gone` : ""}`}
              />
            )}
            {gap !== undefined && <p className={cn("text-xs font-[510]", gap < 0 ? "text-danger-ink" : "text-camp-moss-ink")}>{paceLine(gap)}</p>}
            <GoalSparkline points={spark} start={sparkFrom} target={target ? `Aiming for ${target}` : undefined} />
          </div>
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
            <ol
              data-checkin-rail=""
              className="relative flex flex-col gap-3 pl-7 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-line-2"
              aria-label="Check-ins, newest first"
            >
              {goal.checkins.map((c, i) =>
                composer?.editing?.id === c.id ? (
                  <li key={c.id}>{composerFor(c)}</li>
                ) : (
                  <li key={c.id} className="relative [animation:work-rise-in_240ms_var(--ease-out)_both]">
                    {/* Its health, as a dot on the rail with a ring in the sheet's colour. */}
                    <span aria-hidden="true" className={cn("absolute -left-[21px] top-4 size-2.5 rounded-full ring-[3px] ring-sheet", RAIL_DOT[c.health] ?? "bg-ink-3")} />
                    <UpdateCard
                      update={c}
                      now={now}
                      noun="check-in"
                      detail={<Moved c={c} prev={goal.checkins[i + 1]} unit={goal.unit} />}
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
