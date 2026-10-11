"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { GoalDialog } from "@/components/goals/GoalDialog"
import { GoalOwner } from "@/components/goals/GoalOwner"
import { GoalProgress, GoalRing, PaceWords } from "@/components/goals/GoalProgress"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotSearch, SpotTasks } from "@/components/ui/graphics/spots"
import { HealthWord } from "@/components/projectUpdates/HealthPill"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { WorkSearch } from "@/components/task/WorkTabs"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { ErrorState } from "@/components/ui/error-state"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useGoals } from "@/hooks/useGoals"
import { useStoredState } from "@/hooks/useStoredState"
import { Check, ChevronDown, Filter, Plus } from "@/lib/icons"
import { checkInDue, dueLabel, filterGoals, goalTree, measureLine, overdue, type GoalSummary } from "@/lib/goals"
import { cn } from "@/lib/utils/helpers/cn"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/** The goals table's columns (work.md W42): ring, title and line, owner, pace, health. */
const GOAL_COLUMNS = "grid grid-cols-[28px_minmax(0,1fr)_150px_230px_130px] items-center gap-x-3 pr-6"

const href = (g: GoalSummary) => `/app/goals/${g.id}`
const isStatus = (v: unknown): v is "open" | "closed" => v === "open" || v === "closed"

/** Where a goal stands by its last check-in, or that one is due, or that there's none yet. */
function Standing({ goal, now }: { goal: GoalSummary; now: number }) {
  if (goal.status !== "open") return <HealthWord health={goal.status} />
  if (checkInDue(goal, now)) {
    return <span className="whitespace-nowrap text-xs font-[510] text-warning-ink">{goal.health ? "Check-in due" : "No check-in yet"}</span>
  }
  if (!goal.health) return <span className="whitespace-nowrap text-xs text-ink-3">No check-in yet</span>
  return <HealthWord health={goal.health} />
}

/** "410 of 500 teams · due 31 Dec", the date in red once it has passed. */
function Line({ goal, today, className }: { goal: GoalSummary; today: string; className?: string }) {
  const late = overdue(goal, today)
  return (
    <span className={cn("text-xs text-ink-3", className)}>
      {measureLine(goal)}
      {" · "}
      <span className={cn(late && "font-medium text-danger-ink")}>
        {late ? "was due" : "due"} {dueLabel(goal.due_date)}
      </span>
    </span>
  )
}

/**
 * Goals, as a view of the Projects page: every goal in the workspace with how
 * far it has got against its time, who owns it and where its last check-in
 * said it stood, sub-goals under their parents. Asana's goals and Linear's
 * initiatives, as one list.
 */
export function GoalsView({ compact }: { compact: boolean }) {
  const router = useRouter()
  const { goals, isLoading, isError, refresh } = useGoals()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data?.user_uuid
  const [status, setStatus] = useStoredState<"open" | "closed">("oc_goals_status", "open", isStatus)
  const [mine, setMine] = useStoredState<boolean>("oc_goals_mine", false, (v): v is boolean => typeof v === "boolean")
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const fold = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const now = Date.now()
  const today = localDay()

  const all = useMemo(() => goals ?? [], [goals])
  const counts = useMemo(() => ({ open: all.filter((g) => g.status === "open").length, closed: all.filter((g) => g.status !== "open").length }), [all])
  const shown = useMemo(() => goalTree(filterGoals(all, { status, mine, query }, me)), [all, status, mine, query, me])
  const due = useMemo(() => all.filter((g) => checkInDue(g, now)).length, [all, now])

  let body: ReactNode
  if (isError && !goals) {
    body = (
      <WorkState>
        <ErrorState subject="the goals" onRetry={() => void refresh()} />
      </WorkState>
    )
  } else if (isLoading && !goals) {
    body = (
      <div aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-3 border-b border-line px-6">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="ml-auto h-1.5 w-40" />
          </div>
        ))}
      </div>
    )
  } else if (all.length === 0) {
    body = (
      <WorkState>
        <EmptyState
          illustration={<SpotTasks hue="dusk" />}
          title="No goals yet"
          description="A goal is a number or a set of projects to finish by a date."
        />
      </WorkState>
    )
  } else if (shown.length === 0) {
    body = (
      <WorkState>
        <EmptyState illustration={<SpotSearch />} title={query ? "No goals found" : status === "closed" ? "No closed goals" : mine ? "You own no open goals" : "No open goals"} />
      </WorkState>
    )
  } else if (compact) {
    body = (
      <ul>
        {shown.map(({ goal, depth }) => (
          <li key={goal.id} className="border-b border-line">
            {/* A goal on a phone (W42): 64 px, the ring at 32 and the title and health on line 1. */}
            <Link href={href(goal)} className="flex h-16 items-center gap-3 outline-none active:bg-press focus-visible:bg-hover" style={{ paddingLeft: depth * 16 }}>
              <GoalRing goal={goal} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-[510]">{goal.title}</span>
                  <Standing goal={goal} now={now} />
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <GoalOwner owner={goal.owner} compact />
                  <Line goal={goal} today={today} className="truncate" />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    )
  } else {
    // Sub-goals fold under their parent's chevron (W42).
    const hiddenUnder = new Set<string>()
    const rows: { goal: GoalSummary; depth: number; hasChildren: boolean }[] = []
    shown.forEach(({ goal, depth }, i) => {
      if (goal.parent_id && hiddenUnder.has(goal.parent_id)) {
        hiddenUnder.add(goal.id)
        return
      }
      const hasChildren = shown[i + 1]?.goal.parent_id === goal.id
      if (hasChildren && folded.has(goal.id)) hiddenUnder.add(goal.id)
      rows.push({ goal, depth, hasChildren })
    })
    body = (
      <div role="table" aria-label="Goals" data-goals-list="">
        <div role="row" className={cn(GOAL_COLUMNS, "sticky top-0 z-10 h-8 border-b border-line bg-sheet text-xs font-[510] text-ink-3")}>
          <span />
          <span>Goal</span>
          <span>Owner</span>
          <span>Pace</span>
          <span>Last check-in</span>
        </div>
        {rows.map(({ goal, depth, hasChildren }) => (
          <div
            key={goal.id}
            role="row"
            data-goal-row=""
            className={cn(GOAL_COLUMNS, "relative h-14 cursor-pointer border-b border-line transition-colors duration-[140ms] hover:bg-hover")}
            style={{ paddingLeft: 24 + depth * 28 }}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("a,button")) router.push(href(goal))
            }}
          >
            {depth > 0 && (
              // The elbow from the parent's ring.
              <span aria-hidden="true" data-goal-elbow="" className="absolute top-0 h-[29px] w-3 rounded-bl-[6px] border-b border-l border-line-2" style={{ left: 24 + (depth - 1) * 28 + 13 }} />
            )}
            <span className="relative flex items-center">
              {hasChildren && (
                <button
                  type="button"
                  aria-label={folded.has(goal.id) ? `Show ${goal.title}'s sub-goals` : `Hide ${goal.title}'s sub-goals`}
                  aria-expanded={!folded.has(goal.id)}
                  onClick={() => fold(goal.id)}
                  className="absolute -left-5 inline-flex size-4 items-center justify-center rounded-xs text-ink-3 hover:text-foreground"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform duration-[180ms]", folded.has(goal.id) && "-rotate-90")} />
                </button>
              )}
              <GoalRing goal={goal} />
            </span>
            <div className="min-w-0">
              <Link href={href(goal)} className="block truncate text-sm font-[510] text-foreground outline-none hover:underline focus-visible:underline">
                {goal.title}
              </Link>
              <Line goal={goal} today={today} className="block truncate" />
            </div>
            <GoalOwner owner={goal.owner} />
            <span className="flex items-center gap-2.5">
              <GoalProgress goal={goal} showLabel={false} className="w-40" />
              <PaceWords goal={goal} />
            </span>
            <Standing goal={goal} now={now} />
          </div>
        ))}
      </div>
    )
  }

  const chips: { key: string; text: string; clear: () => void }[] = []
  if (status === "closed") chips.push({ key: "status", text: "Closed goals", clear: () => setStatus("open") })
  if (mine) chips.push({ key: "owner", text: "Owner: me", clear: () => setMine(false) })
  const menuRow = (on: boolean, label: ReactNode, onClick: () => void, role: "menuitemradio" | "menuitemcheckbox" = "menuitemradio") => (
    <button type="button" role={role} aria-checked={on} onClick={onClick} className="flex h-[30px] w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-press focus-visible:bg-press">
      <span className="flex items-center gap-1.5">{label}</span>
      {on && <Check className="size-3.5 text-ink-2" />}
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* One toolbar language (W10, W42): Filter with Status and Owner, the
          chips of what is chosen, search, and New goal as the one primary. */}
      <div data-work-toolbar="" className={cn(workToolbar, "h-11 flex-nowrap gap-1.5")}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size={compact ? "icon-sm" : "sm"} aria-label={compact ? "Filter" : undefined}>
              <Filter className="!size-3.5" />
              {!compact && "Filter"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[260px] p-1">
            <div role="menu" aria-label="Filter goals">
              <p className="px-2 pb-1 pt-1.5 text-xs font-[510] text-ink-3">Status</p>
              {menuRow(status === "open", <>Open <span className="tabular-nums text-ink-3">{counts.open}</span></>, () => setStatus("open"))}
              {menuRow(status === "closed", <>Closed <span className="tabular-nums text-ink-3">{counts.closed}</span></>, () => setStatus("closed"))}
              <div className="my-1 h-px bg-line" />
              <p className="px-2 pb-1 pt-1.5 text-xs font-[510] text-ink-3">Owner</p>
              {menuRow(!mine, <>Everyone&apos;s</>, () => setMine(false))}
              {menuRow(mine, <>Mine</>, () => setMine(true))}
            </div>
          </PopoverContent>
        </Popover>
        {chips.map((c) => (
          <Chip key={c.key} onRemove={c.clear} removeLabel={`Remove ${c.text}`} className="h-6 [animation:work-pop-in_180ms_var(--ease-out)_both]">
            {c.text}
          </Chip>
        ))}
        {due > 0 && !compact && <span className="truncate text-xs text-warning-ink">{due === 1 ? "1 goal needs a check-in" : `${due} goals need a check-in`}</span>}
        <span className="flex-1" />
        <WorkSearch value={query} onChange={setQuery} placeholder="Search goals or owners…" label="Search goals" />
        <Button size="sm" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="!size-3.5" />
          New goal
        </Button>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">{body}</div>
      {creating && (
        <GoalDialog
          goals={all}
          onClose={() => setCreating(false)}
          onSaved={(g) => {
            setCreating(false)
            router.push(href(g))
          }}
        />
      )}
    </div>
  )
}
