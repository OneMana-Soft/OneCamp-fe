"use client"

/**
 * ImportPlanDialog — runs the Plan stage and lets the operator confirm
 * the source-status → OneCamp-status (and priority) mappings before the
 * Run stage commits anything.
 *
 * Flow:
 *   1. On open, calls /admin/import/jobs/{id}/plan with the operator's
 *      current options to get counts + the unique status/priority values
 *      observed in the source.
 *   2. Pre-fills the mapping dropdowns from the provider's defaults.
 *   3. On "Start import", calls /admin/import/jobs/{id}/run with the
 *      confirmed mappings.
 *
 * The counts read like the task panel, quiet labels with their values in
 * ink. Each mapping is named for the source value it maps and offers
 * OneCamp's statuses by their names ("In progress"), where it offered the
 * raw keys such as inProgress in a select no screen reader could name. Every
 * warning can be read: past the eighth they were "… and 4 more".
 *
 * An uploaded table (a CSV) also lists its columns, each with what it becomes:
 * a task's own property, or a field of the kind its values suggest, which the
 * admin can change or leave out. A change plans the file again, so the counts
 * and the people show what the choice makes. And it lists the people the file
 * names, each with who they will be here and how that is known.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useToast } from "@/hooks/use-toast"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { readableBytes } from "@/lib/readableBytes"
import { FIELD_TYPES } from "@/lib/tasks/fields"
import { cn } from "@/lib/utils/helpers/cn"
import { NO_PRIORITY, TASK_PRIORITIES, taskPriorityOptions, taskStatusLabel } from "@/types/taskScale"
import {
  type ImportJob,
  type ImportPlan,
  type ImportProblem,
  type PlanColumn,
  type PlanPerson,
  type ProviderInfo,
  importProblemOf,
  jobChanged,
  needsReconnect,
  planImportJob,
  runImportJob,
} from "@/services/importService"
import { ImportStepper, TOOL_STEPS } from "@/components/admin/importParts"
import { Loader2 } from "lucide-react"

const ONECAMP_STATUSES = ["todo", "inProgress", "backlog", "inReview", "canceled", "done"] as const
const ONECAMP_PRIORITIES = [...TASK_PRIORITIES.map((p) => p.value), NO_PRIORITY.value]
const priorityLabel = (p: string) => (p === NO_PRIORITY.value ? NO_PRIORITY.label : (taskPriorityOptions.find((o) => o.id === p)?.label ?? p))

/** What a column the admin leaves out is read as (PlanColumn.kind). */
const SKIP_COLUMN = "skip"

/** Warnings shown before "Show N more", and people. */
const FIRST_WARNINGS = 8
const FIRST_PEOPLE = 8

/** What a column that fills a task's own property fills, by the property the server reads it as. */
const PROPERTY_LABEL: Record<string, string> = {
  title: "Title",
  key: "Key",
  id: "Id",
  parent: "Parent task",
  status: "Status",
  completed: "Done",
  priority: "Priority",
  assignee: "Assignee",
  assignees: "Assignees",
  start: "Start date",
  due: "Due date",
  estimate: "Estimate, in hours",
  tags: "Tags",
  description: "Description",
  created: "Created",
  created_by: "Created by",
  updated: "Updated",
  type: "Type",
  link: "Link",
  email: "Their addresses",
}

interface Props {
  job: ImportJob
  providerInfo: ProviderInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: () => void
  /** Opens the provider's connect dialog, for a plan refused over its token. */
  onReconnect?: () => void
  /** Loads the import again, when it moved on while it was being planned. */
  onChanged?: () => void
}

export const ImportPlanDialog: React.FC<Props> = ({
  job,
  providerInfo,
  open,
  onOpenChange,
  onStarted,
  onReconnect,
  onChanged,
}) => {
  const { toast } = useToast()
  const ids = useId()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [priorityMap, setPriorityMap] = useState<Record<string, string>>({})
  // The source's values as it wrote them, for the names of the mappings.
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [allWarnings, setAllWarnings] = useState(false)
  // Why planning failed, shown in the dialog. A failure used to leave the
  // dialog spinning for good behind a toast.
  const [problem, setProblem] = useState<ImportProblem | null>(null)
  const [attempt, setAttempt] = useState(0)
  // What each field column becomes (a field type, or SKIP_COLUMN), as chosen.
  const [columns, setColumns] = useState<Record<string, string>>({})
  const [replanning, setReplanning] = useState(false)
  const [columnProblem, setColumnProblem] = useState("")
  const [allPeople, setAllPeople] = useState(false)
  // The plan asked for last: an earlier answer arriving after it is dropped.
  const planAsked = useRef(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setProblem(null)
      try {
        const result = await planImportJob(job.id, {})
        if (cancelled) return
        setPlan(result)
        setAllWarnings(false)
        setColumns(columnKinds(result))
        setColumnProblem("")
        setAllPeople(false)

        // Pre-fill mappings: prefer existing job mappings → provider defaults → heuristic.
        const names: Record<string, string> = {}
        const defaults = providerInfo?.default_status_map ?? {}
        const initialStatus: Record<string, string> = {}
        for (const v of result.status_values ?? []) {
          const key = v.toLowerCase()
          names[`status:${key}`] = v
          initialStatus[key] = job.status_mappings?.[key] ?? result.status_proposals?.[key] ?? defaults[key] ?? "todo"
        }
        setStatusMap(initialStatus)

        const pdef = providerInfo?.default_priority_map ?? {}
        const initialPriority: Record<string, string> = {}
        for (const v of result.priority_values ?? []) {
          const key = v.toLowerCase()
          names[`priority:${key}`] = v
          initialPriority[key] = job.priority_mappings?.[key] ?? pdef[key] ?? "medium"
        }
        setPriorityMap(initialPriority)
        setSourceNames(names)
      } catch (err: unknown) {
        if (cancelled) return
        const p = importProblemOf(err, "Couldn't plan this import. Try again.")
        setProblem(p)
        // Run started it from another tab, say: the import is loaded again
        // behind the dialog, to show what it is now.
        if (jobChanged(p)) onChanged?.()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job.id, attempt])

  const summary = useMemo(() => {
    if (!plan) return []
    const out: { label: string; value: string }[] = []
    const n = (v: number) => v.toLocaleString("en")
    if (plan.user_count) out.push({ label: "People", value: peopleLine(plan) })
    if (plan.team_count) out.push({ label: "Teams", value: n(plan.team_count) })
    if (plan.project_count) out.push({ label: "Projects", value: n(plan.project_count) })
    if (plan.task_count) out.push({ label: "Tasks", value: n(plan.task_count) })
    if (plan.page_count) out.push({ label: "Docs", value: n(plan.page_count) })
    if (plan.board_count) out.push({ label: "Boards", value: n(plan.board_count) })
    if (plan.item_count) out.push({ label: "Items on them", value: n(plan.item_count) })
    if (plan.table_count) out.push({ label: "Tables", value: n(plan.table_count) })
    if (plan.subtask_count) out.push({ label: "Subtasks", value: n(plan.subtask_count) })
    if (plan.comment_count) out.push({ label: "Comments", value: n(plan.comment_count) })
    if (plan.file_count) out.push({ label: "Files", value: `${n(plan.file_count)} (${readableBytes(plan.file_bytes)})` })
    return out
  }, [plan])

  // A column's kind changed: the file is planned again with it, and the plan
  // shows what that makes of the fields and the people. One refused puts the
  // column back as it was.
  const chooseKind = async (column: string, kind: string) => {
    const before = columns
    const next = { ...columns, [column]: kind }
    const asked = ++planAsked.current
    setColumns(next)
    setColumnProblem("")
    setReplanning(true)
    try {
      const result = await planImportJob(job.id, { options: { ...job.options, columns: next } })
      if (asked !== planAsked.current) return
      setPlan(result)
      setColumns(columnKinds(result))
    } catch (err: unknown) {
      if (asked !== planAsked.current) return
      setColumns(before)
      const p = importProblemOf(err, "Couldn't read the file with that choice. Try again.")
      if (jobChanged(p)) {
        setProblem(p)
        onChanged?.()
      } else {
        setColumnProblem(p.message)
      }
    } finally {
      if (asked === planAsked.current) setReplanning(false)
    }
  }

  const handleStart = async () => {
    setSubmitting(true)
    try {
      await runImportJob(job.id, {
        // A table's columns as the plan shows them: planning keeps a choice
        // before it reads the file, so one put back here may be the server's.
        ...(plan?.columns?.length ? { options: { ...job.options, columns } } : {}),
        status_mappings: statusMap,
        priority_mappings: priorityMap,
      })
      toast({ title: "Import started" })
      onStarted()
      onOpenChange(false)
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({
        title: "Couldn't start the import",
        description: importProblemOf(err).message,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const warnings = plan?.warnings ?? []
  const shownWarnings = allWarnings ? warnings : warnings.slice(0, FIRST_WARNINGS)
  const tableColumns = plan?.columns ?? []
  const people = useMemo(() => placeholdersFirst(plan?.people ?? []), [plan])
  const shownPeople = allPeople ? people : people.slice(0, FIRST_PEOPLE)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan the import of {job.source_workspace_name}</DialogTitle>
          <DialogDescription>
            What will come across, and how the source&apos;s statuses and priorities become OneCamp&apos;s. Nothing
            is imported until you start it.
          </DialogDescription>
        </DialogHeader>

        <ImportStepper steps={TOOL_STEPS} current={1} />

        <OverlayBody>
          {problem && !loading ? (
            <div role="alert" className="space-y-3 py-4">
              <p className="break-words text-sm text-danger-ink">{problem.message}</p>
              <div className="flex flex-wrap gap-2">
                {needsReconnect(problem) && onReconnect && (
                  <Button size="sm" onClick={onReconnect}>Reconnect</Button>
                )}
                {!jobChanged(problem) && (
                  <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                )}
              </div>
            </div>
          ) : loading || !plan ? (
            <div role="status" aria-label="Planning the import" className="py-2">
              <SkeletonRows rows={5} avatar={false} lines={1} />
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {/* Counts */}
              <dl className="space-y-1.5">
                {summary.map((s) => (
                  <div key={s.label} className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>{s.label}</dt>
                    <dd className="text-sm">{s.value}</dd>
                  </div>
                ))}
              </dl>

              {/* Warnings, every one of them on request */}
              {warnings.length > 0 && (
                <div className="cx-imp-note text-sm">
                  <div className="mb-1 font-medium text-warning-ink">
                    {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-warning-ink">
                    {shownWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  {warnings.length > FIRST_WARNINGS && (
                    <Button variant="link" className="mt-1 h-auto p-0 text-sm" onClick={() => setAllWarnings((v) => !v)}>
                      {allWarnings ? "Show fewer" : `Show ${warnings.length - FIRST_WARNINGS} more`}
                    </Button>
                  )}
                </div>
              )}

              {/* An uploaded table's columns, and what each becomes */}
              {tableColumns.length > 0 && (
                <section aria-labelledby={`${ids}-columns`} aria-busy={replanning} className="space-y-2 border-t border-line pt-4">
                  <div>
                    <h3 id={`${ids}-columns`} className="text-sm font-medium">Columns</h3>
                    <p className="text-xs text-muted-foreground">
                      What each column of the file becomes. One that isn&apos;t a task&apos;s own becomes a field, of the kind its
                      values suggest.
                    </p>
                  </div>
                  <MappingList>
                    {tableColumns.map((c) => (
                      <MappingRow key={c.name} name={c.name}>
                        {c.property ? (
                          <span className="truncate text-sm text-muted-foreground">{PROPERTY_LABEL[c.property] ?? c.property}</span>
                        ) : (
                          <MappingPicker
                            label={`What ${c.name} becomes`}
                            value={columns[c.name] ?? c.kind ?? SKIP_COLUMN}
                            onChange={(kind) => void chooseKind(c.name, kind)}
                            options={[...FIELD_TYPES.map((t) => kindChoice(t.value, t.label, c)), { value: SKIP_COLUMN, label: "Don't import" }]}
                          />
                        )}
                      </MappingRow>
                    ))}
                  </MappingList>
                  {replanning && (
                    <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Reading the file again…
                    </p>
                  )}
                  {columnProblem && (
                    <p role="alert" className="text-sm text-danger-ink">
                      {columnProblem}
                    </p>
                  )}
                </section>
              )}

              {/* The people the file names, and who each is here */}
              {people.length > 0 && (
                <section aria-labelledby={`${ids}-people`} className="space-y-2 border-t border-line pt-4">
                  <div>
                    <h3 id={`${ids}-people`} className="text-sm font-medium">People</h3>
                    <p className="text-xs text-muted-foreground">
                      Who each person the file names is here. Someone no one here matches comes as a placeholder.
                    </p>
                  </div>
                  <ul aria-label="People in the file" className="grid gap-1.5">
                    {shownPeople.map((p) => (
                      <li key={p.source_id} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                        <span className="min-w-0 truncate text-sm" title={p.email ? `${p.name}, ${p.email}` : p.name}>
                          {p.name}
                          {p.email && <span className="text-muted-foreground"> · {p.email}</span>}
                        </span>
                        <span className={cn("shrink-0 text-xs", p.matched_by ? "text-muted-foreground" : "text-warning-ink")}>
                          {personMatchWords(p)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {people.length > FIRST_PEOPLE && (
                    <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setAllPeople((v) => !v)}>
                      {allPeople ? "Show fewer" : `Show ${people.length - FIRST_PEOPLE} more`}
                    </Button>
                  )}
                </section>
              )}

              {/* Status mapping */}
              {Object.keys(statusMap).length > 0 && (
                <section aria-labelledby={`${ids}-status`} className="space-y-2 border-t border-line pt-4">
                  <div>
                    <h3 id={`${ids}-status`} className="text-sm font-medium">Statuses</h3>
                    <p className="text-xs text-muted-foreground">Which OneCamp status each of the source&apos;s statuses becomes.</p>
                  </div>
                  <MappingList>
                    {Object.entries(statusMap).map(([src, tgt]) => {
                      const name = sourceNames[`status:${src}`] ?? src
                      return (
                        <MappingRow key={src} name={name}>
                          <MappingPicker
                            label={`OneCamp status for ${name}`}
                            value={tgt}
                            onChange={(status) => setStatusMap((m) => ({ ...m, [src]: status }))}
                            options={ONECAMP_STATUSES.map((s) => ({ value: s, label: taskStatusLabel(s) }))}
                          />
                        </MappingRow>
                      )
                    })}
                  </MappingList>
                </section>
              )}

              {/* Priority mapping */}
              {Object.keys(priorityMap).length > 0 && (
                <section aria-labelledby={`${ids}-priority`} className="space-y-2 border-t border-line pt-4">
                  <div>
                    <h3 id={`${ids}-priority`} className="text-sm font-medium">Priorities</h3>
                    <p className="text-xs text-muted-foreground">Which OneCamp priority each of the source&apos;s priorities becomes.</p>
                  </div>
                  <MappingList>
                    {Object.entries(priorityMap).map(([src, tgt]) => {
                      const name = sourceNames[`priority:${src}`] ?? src
                      return (
                        <MappingRow key={src} name={name}>
                          <MappingPicker
                            label={`OneCamp priority for ${name}`}
                            value={tgt}
                            onChange={(priority) => setPriorityMap((m) => ({ ...m, [src]: priority }))}
                            options={ONECAMP_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
                          />
                        </MappingRow>
                      )
                    })}
                  </MappingList>
                </section>
              )}
            </div>
          )}
        </OverlayBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button onClick={handleStart} disabled={loading || !plan || replanning} busy={submitting}>
            {submitting ? "Starting…" : "Start import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A mapping's rows on one grid, so every arrow and every target starts at one
 * x down the list, and a picker fills the target's column: a long value reads
 * whole there, where a fixed width cut it short.
 */
function MappingList({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)] items-center gap-2">{children}</div>
}

/** A source value, an arrow, and the OneCamp value it becomes: three cells of MappingList's grid. */
function MappingRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <span className="truncate text-sm" title={name}>
        {name}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        →
      </span>
      {children}
    </>
  )
}

/** One choice of a MappingPicker: its words when chosen, and in the open list when they say more. */
interface MappingChoice {
  value: string
  label: string
  listed?: string
}

/** What a source value becomes, from the app's own picker, a sheet on a phone (DB-2: no native controls). */
function MappingPicker({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: MappingChoice[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue>{options.find((o) => o.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.listed ?? o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** What each field column of a plan is read as, by its name. Pure. */
export function columnKinds(plan: Pick<ImportPlan, "columns">): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of plan.columns ?? []) {
    if (!c.property && c.kind) out[c.name] = c.kind
  }
  return out
}

/**
 * A kind as a column's choice names it: money with its currency, and the kind
 * its values suggest says so in the open list, never in the closed picker,
 * where it would push the value past its width. Pure.
 */
function kindChoice(kind: string, label: string, c: PlanColumn): MappingChoice {
  const named = kind === "money" && c.currency ? `${label}, ${c.currency}` : label
  return { value: kind, label: named, listed: kind === c.guess ? `${named} (suggested)` : undefined }
}

/** The people who come as placeholders first: they are the ones to look at. Pure. */
function placeholdersFirst(people: PlanPerson[]): PlanPerson[] {
  return [...people.filter((p) => !p.matched_by), ...people.filter((p) => p.matched_by)]
}

/** Who a person the file names will be here, and how that is known, in a line. Pure. */
export function personMatchWords(p: PlanPerson): string {
  switch (p.matched_by) {
    case "email":
      return p.member ? `${p.member}, by their address` : "Someone here, by their address"
    case "name":
      return p.member ? `${p.member}, by their name` : "Someone here, by their name"
    case "workspace_map":
      return p.member ? `${p.member}, as an earlier import matched them` : "As an earlier import matched them"
    case "import":
      return p.member ? `${p.member}, as this import matched them` : "As this import matched them"
  }
  if (p.same_name && p.same_name > 1) return `Comes as a placeholder: ${p.same_name} members share this name`
  return "Comes as a placeholder"
}

/**
 * The people line of a plan. Only an import that counts who is new and who
 * is already here says so; the others said "(0 new, 0 merged)" about every
 * person they found. Pure.
 */
export function peopleLine(plan: Pick<ImportPlan, "user_count" | "user_new" | "user_merge">): string {
  if (!plan.user_new && !plan.user_merge) return String(plan.user_count)
  return `${plan.user_count} (${plan.user_new} new, ${plan.user_merge} already here)`
}
