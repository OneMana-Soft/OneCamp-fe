"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { GoalDialog } from "@/components/goals/GoalDialog"
import { GoalOwner } from "@/components/goals/GoalOwner"
import { GoalProgress } from "@/components/goals/GoalProgress"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { SearchField } from "@/components/search/searchField"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useGoals } from "@/hooks/useGoals"
import { useStoredState } from "@/hooks/useStoredState"
import { Target } from "@/lib/icons"
import { checkInDue, dueLabel, filterGoals, goalTree, measureLine, overdue, type GoalSummary } from "@/lib/goals"
import { cn } from "@/lib/utils/helpers/cn"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

const href = (g: GoalSummary) => `/app/goals/${g.id}`
const isStatus = (v: unknown): v is "open" | "closed" => v === "open" || v === "closed"

/** Where a goal stands by its last check-in, or that one is due, or that there's none yet. */
function Standing({ goal, now }: { goal: GoalSummary; now: number }) {
  if (goal.status !== "open") return <HealthPill health={goal.status} />
  if (checkInDue(goal, now)) {
    return <span className="whitespace-nowrap text-xs font-medium text-warning">{goal.health ? "Check-in due" : "No check-in yet"}</span>
  }
  if (!goal.health) return <span className="whitespace-nowrap text-xs text-muted-foreground">No check-in yet</span>
  return <HealthPill health={goal.health} />
}

/** "410 of 500 teams · due 31 Dec", the date in red once it has passed. */
function Line({ goal, today, className }: { goal: GoalSummary; today: string; className?: string }) {
  const late = overdue(goal, today)
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {measureLine(goal)}
      {" · "}
      <span className={cn(late && "font-medium text-destructive")}>
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
  const now = Date.now()
  const today = localDay()

  const all = useMemo(() => goals ?? [], [goals])
  const counts = useMemo(() => ({ open: all.filter((g) => g.status === "open").length, closed: all.filter((g) => g.status !== "open").length }), [all])
  const shown = useMemo(() => goalTree(filterGoals(all, { status, mine, query }, me)), [all, status, mine, query, me])
  const due = useMemo(() => all.filter((g) => checkInDue(g, now)).length, [all, now])

  let body: ReactNode
  if (isError && !goals) {
    body = <ErrorState subject="the goals" onRetry={() => void refresh()} />
  } else if (isLoading && !goals) {
    body = (
      <div className="grid gap-3 py-2" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  } else if (all.length === 0) {
    body = (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-10">
        <StatePlaceholder
          type="empty"
          title="No goals yet"
          description="A goal is an outcome you're after by a date: a launch, a number of customers, a reply time. Its progress fills in by itself from the projects serving it, from its sub-goals, or from a number you update."
          action={
            <Button onClick={() => setCreating(true)} variant="outline" size="sm">
              Set the first goal
            </Button>
          }
        />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="flex min-h-[30vh] flex-col items-center justify-center px-4 py-10">
        <StatePlaceholder
          type="search"
          title={query ? "No goals found" : status === "closed" ? "No closed goals" : mine ? "You own no open goals" : "No open goals"}
          description={
            query
              ? "No goal's title or owner has those words."
              : status === "closed"
                ? "Goals closed as achieved, missed or dropped show here, with how far they got."
                : "Every goal is closed. Set the next one."
          }
        />
      </div>
    )
  } else if (compact) {
    body = (
      <ul className="divide-y divide-border/60">
        {shown.map(({ goal, depth }) => (
          <li key={goal.id}>
            <Link href={href(goal)} className="block px-4 py-3 outline-none active:bg-muted focus-visible:bg-muted" style={{ paddingLeft: 16 + depth * 16 }}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{goal.title}</span>
                <Standing goal={goal} now={now} />
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <GoalOwner owner={goal.owner} compact />
                <Line goal={goal} today={today} className="truncate" />
              </div>
              <GoalProgress goal={goal} className="mt-2" />
            </Link>
          </li>
        ))}
      </ul>
    )
  } else {
    body = (
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="w-[40%] py-2 pr-4 font-medium">
              Goal
            </th>
            <th scope="col" className="w-[16%] py-2 pr-4 font-medium">
              Owner
            </th>
            <th scope="col" className="w-[24%] py-2 pr-4 font-medium">
              Progress
            </th>
            <th scope="col" className="w-[20%] py-2 font-medium">
              Last check-in
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ goal, depth }) => (
            <tr
              key={goal.id}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("a")) router.push(href(goal))
              }}
            >
              <td className="py-3 pr-4">
                <div className="flex min-w-0 items-start gap-2" style={{ paddingLeft: depth * 20 }}>
                  {depth > 0 && <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-bl border-b border-l border-border" />}
                  <div className="min-w-0">
                    <Link href={href(goal)} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
                      {goal.title}
                    </Link>
                    <Line goal={goal} today={today} className="block truncate" />
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4">
                <GoalOwner owner={goal.owner} />
              </td>
              <td className="py-3 pr-4">
                <GoalProgress goal={goal} />
              </td>
              <td className="py-3">
                <Standing goal={goal} now={now} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {all.length > 0 && (
        <div className={cn("flex flex-wrap items-center gap-2 pb-2", compact && "px-3")}>
          <ToggleGroup
            type="single"
            size="sm"
            value={status}
            onValueChange={(v) => isStatus(v) && setStatus(v)}
            aria-label="Show"
            className="rounded-md border p-0.5"
          >
            <ToggleGroupItem value="open" className="h-7 gap-1.5 px-2.5 text-xs">
              Open <span className="tabular-nums text-muted-foreground">{counts.open}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="closed" className="h-7 gap-1.5 px-2.5 text-xs">
              Closed <span className="tabular-nums text-muted-foreground">{counts.closed}</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            size="sm"
            value={mine ? "mine" : "all"}
            onValueChange={(v) => v && setMine(v === "mine")}
            aria-label="Whose"
            className="rounded-md border p-0.5"
          >
            <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs">
              Everyone&apos;s
            </ToggleGroupItem>
            <ToggleGroupItem value="mine" className="h-7 px-2.5 text-xs">
              Mine
            </ToggleGroupItem>
          </ToggleGroup>
          <SearchField value={query} onChange={setQuery} placeholder="Search goals or owners…" className={compact ? "w-full" : "w-64"} />
          {due > 0 && !compact && <span className="text-xs text-warning">{due === 1 ? "1 goal needs a check-in" : `${due} goals need a check-in`}</span>}
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setCreating(true)}>
            <Target className="h-4 w-4" />
            New goal
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
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
