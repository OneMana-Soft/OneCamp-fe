"use client"

import { useMemo, useState } from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Tile } from "@/components/ui/graphics/Tile"
import { RowMenu, StateWord } from "@/components/admin/connectParts"
import { WorkflowSentence } from "@/components/admin/workflowsParts"
import { Bell, CalendarClock, History, LayoutTemplate, ListTodo, Pencil, Plus, Gauge, Repeat, Trash2, UserPlus, Workflow, Zap, type LucideIcon } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useProjectRules } from "@/hooks/useProjectRules"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { GetEndpointUrl } from "@/services/endPoints"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { displayNameOf } from "@/lib/personName"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"
import { BLANK_DRAFT, draftFromRule, draftFromTemplate, draftProblem } from "@/lib/rules/draft"
import { ruleSentence, type RuleNames } from "@/lib/rules/sentence"
import type { Rule, RuleDraft, RuleTemplate } from "@/lib/rules/types"
import type { ProjectInfoRawInterface } from "@/types/project"
import { RuleBuilder, type Person } from "./RuleBuilder"
import { RuleRuns } from "./RuleRuns"

/**
 * Rules are Projects': every ready-made rule sits on Projects' hue (design
 * v3.1: colour names an area), and its glyph tells it apart. Moves to
 * areaHue("projects") once that lands.
 */
const PROJECTS_HUE: CampHue = "moss"

type View = { kind: "list" } | { kind: "templates" } | { kind: "edit"; id?: string; draft: RuleDraft } | { kind: "history"; ruleId?: string }

/** A ready-made rule's glyph, by what it does first. */
function templateGlyph(t: RuleTemplate): LucideIcon {
  const a = t.actions[0]
  if (a?.type === "assign") return a.assign === "least_loaded" ? Gauge : a.assign === "round_robin" ? Repeat : UserPlus
  if (a?.type === "set_due") return CalendarClock
  if (a?.type === "notify") return Bell
  if (a?.type === "add_subtask") return ListTodo
  return Zap
}

function RuleRow({ rule, names, canManage, onToggle, onEdit, onHistory, onDelete }: {
  rule: Rule
  names: RuleNames
  canManage: boolean
  onToggle: (on: boolean) => void
  onEdit: () => void
  onHistory: () => void
  onDelete: () => void
}) {
  const parts = ruleSentence(draftFromRule(rule), names)
  return (
    <li data-rule-row={rule.id} className={cn("group flex items-start gap-3 rounded-xl bg-raised p-3 shadow-e1 transition-[box-shadow,opacity] duration-200", !rule.is_active && "opacity-80")}>
      <button type="button" onClick={canManage ? onEdit : onHistory} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-sm font-semibold text-ink">{rule.name}</span>
        <WorkflowSentence as="span" parts={parts} className="mt-1 text-xs" />
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-3">
          {rule.paused_reason ? (
            <StateWord tone="warning">{rule.paused_reason}</StateWord>
          ) : rule.last_error ? (
            <StateWord tone="danger">Last run went wrong</StateWord>
          ) : (
            <StateWord tone={rule.is_active ? "success" : "neutral"}>{rule.is_active ? "On" : "Off"}</StateWord>
          )}
          <span className="tabular-nums">{rule.run_count.toLocaleString("en")} {rule.run_count === 1 ? "run" : "runs"}</span>
          {rule.last_run_at && <span className="tabular-nums">last {relativeTime(rule.last_run_at)}</span>}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {canManage && <Switch checked={rule.is_active} onCheckedChange={onToggle} aria-label={`${rule.is_active ? "Turn off" : "Turn on"} ${rule.name}`} />}
        <RowMenu label={`More for ${rule.name}`} items={[
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: onEdit }] : []),
          { label: "History", icon: History, onSelect: onHistory },
          ...(canManage ? [{ label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true, separated: true }] : []),
        ]} />
      </div>
    </li>
  )
}

/**
 * A project's rules (package 9 R1): work that runs itself. Every member sees
 * the rules and what they did; the project's admins make and change them.
 * One surface for the list, the ready-made rules, the builder and the
 * history: a dialog on a computer, a bottom sheet with its actions pinned on
 * a phone (ResponsiveDialog).
 */
export function ProjectRulesDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { payload, error, isLoading, save, setActive, remove, refresh } = useProjectRules(projectId)
  const { options: statuses } = useProjectStatuses(projectId)
  const members = useFetch<ProjectInfoRawInterface>(`${GetEndpointUrl.GetProjectMembers}/${projectId}`, undefined, { revalidateOnFocus: false })
  const [view, setView] = useState<View>({ kind: "list" })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState("")
  const { toast } = useToast()
  const confirm = useConfirm()

  const people: Person[] = useMemo(() => {
    const seen = new Set<string>()
    return (members.data?.data?.project_members ?? [])
      .filter((u) => u.user_uuid && !u.is_bot && !seen.has(u.user_uuid) && seen.add(u.user_uuid))
      .map((u) => ({ id: u.user_uuid, name: displayNameOf(u) || "A member" }))
  }, [members.data])
  const names: RuleNames = useMemo(() => {
    const byStatus = new Map(statuses.map((s) => [s.value, s.label]))
    const byPerson = new Map(people.map((p) => [p.id, p.name]))
    return { status: (v) => byStatus.get(v), person: (id) => byPerson.get(id) }
  }, [statuses, people])

  const rules = payload?.rules ?? []
  const canManage = !!payload?.can_manage
  const atCap = rules.length >= (payload?.max ?? 50)
  const ruleName = (id: string) => rules.find((r) => r.id === id)?.name ?? "A deleted rule"

  const startEdit = (draft: RuleDraft, id?: string) => {
    setProblem("")
    setView({ kind: "edit", id, draft })
  }
  const submit = async () => {
    if (view.kind !== "edit") return
    const d = view.draft
    const missing = draftProblem(d)
    if (missing) return setProblem(missing)
    setSaving(true)
    setProblem("")
    try {
      await save({ ...d, else_actions: (d.conditions.items ?? []).length ? d.else_actions : [] }, view.id)
      toast({ title: view.id ? "Rule saved" : "Rule made", description: d.is_active ? "It runs from now on, as you." : "It's off until you turn it on." })
      setView({ kind: "list" })
    } catch (e) {
      setProblem(apiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const toggle = async (r: Rule, on: boolean) => {
    try {
      await setActive(r.id, on)
    } catch (e) {
      toast({ title: on ? "Couldn't turn it on" : "Couldn't turn it off", description: apiErrorMessage(e), variant: "destructive" })
    }
  }
  const del = (r: Rule) =>
    confirm({
      title: `Delete the rule “${r.name}”?`,
      description: "It stops running, and its history goes with it. What it already changed stays.",
      confirmText: "Delete rule",
      destructive: true,
      onConfirm: async () => {
        try {
          await remove(r.id)
          if (view.kind === "edit") setView({ kind: "list" })
        } catch (e) {
          toast({ title: "Couldn't delete it", description: apiErrorMessage(e), variant: "destructive" })
        }
      },
    })

  const tabs = (
    <SegmentedControl aria-label="Show" value={view.kind === "history" ? "history" : "rules"}
      onValueChange={(v) => setView(v === "history" ? { kind: "history" } : { kind: "list" })}
      options={[{ value: "rules", label: "Rules", icon: Workflow }, { value: "history", label: "History", icon: History }]} />
  )

  let title = "Rules"
  let description: string | undefined = "Work that runs itself: when something happens to a task, the project does the next step."
  let body: React.ReactNode
  let footer: React.ReactNode = <Button type="button" variant="ghost" onClick={onClose}>Close</Button>

  if (error) {
    body = <ErrorState compact subject="this project's rules" onRetry={() => void refresh()} />
  } else if (isLoading || !payload) {
    body = (
      <div role="status" aria-label="Loading rules" className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)}
      </div>
    )
  } else if (view.kind === "edit") {
    title = view.id ? "Edit rule" : "New rule"
    description = "It acts as you, so it can only do what you can."
    body = (
      <RuleBuilder draft={view.draft} onChange={(draft) => setView({ ...view, draft })} statuses={statuses} people={people} names={names} />
    )
    // On a phone the primary is the full-width row; the switch and Back
    // share one row under it (the sheet stacks its footer bottom up).
    footer = (
      <>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:contents">
          <div className="flex items-center gap-2 sm:mr-auto">
            <Switch id="rule-on" checked={view.draft.is_active} onCheckedChange={(on) => setView({ ...view, draft: { ...view.draft, is_active: on } })} aria-label="On when saved" />
            <label htmlFor="rule-on" className="text-xs text-ink-2">On when saved</label>
          </div>
          <Button type="button" variant="ghost" onClick={() => setView({ kind: "list" })} disabled={saving}>Back</Button>
        </div>
        <Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : view.id ? "Save rule" : "Make rule"}</Button>
      </>
    )
  } else if (view.kind === "templates") {
    title = "Start from a ready-made rule"
    description = "Pick one, then change anything before it saves."
    body = (
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Ready-made rules">
        {payload.templates.map((t) => {
          const Glyph = templateGlyph(t)
          return (
            <li key={t.key}>
              <button type="button" data-rule-template={t.key} onClick={() => startEdit(draftFromTemplate(t))}
                className="flex h-full w-full items-start gap-3 rounded-xl bg-raised p-3 text-left shadow-e1 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0">
                <Tile hue={PROJECTS_HUE} size="lg"><Glyph /></Tile>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{t.name}</span>
                  <span className="mt-0.5 block text-meta text-ink-3">{t.description}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    )
    footer = (
      <>
        <Button type="button" variant="ghost" onClick={() => setView({ kind: "list" })}>Back</Button>
        <Button type="button" variant="outline" onClick={() => startEdit({ ...BLANK_DRAFT })}>Start from nothing</Button>
      </>
    )
  } else if (view.kind === "history") {
    title = view.ruleId ? `History: ${ruleName(view.ruleId)}` : "Rules"
    body = (
      <div className="space-y-3">
        {!view.ruleId && tabs}
        <RuleRuns projectId={projectId} ruleId={view.ruleId} ruleName={ruleName} canUndo />
      </div>
    )
    footer = view.ruleId ? <Button type="button" variant="ghost" onClick={() => setView({ kind: "list" })}>Back</Button> : footer
  } else {
    body = (
      <div className="space-y-3">
        {tabs}
        {rules.length === 0 ? (
          <EmptyState icon={Workflow} hue="dusk" title="No rules yet"
            description={canManage ? "Start from a ready-made rule: share work out, set dates, tell people. They run on every plan, as often as you need." : "The project's admins make its rules. They'll show here."} />
        ) : (
          <ul className="space-y-2" aria-label="Rules">
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} names={names} canManage={canManage}
                onToggle={(on) => void toggle(r, on)} onEdit={() => startEdit(draftFromRule(r), r.id)}
                onHistory={() => setView({ kind: "history", ruleId: r.id })} onDelete={() => del(r)} />
            ))}
          </ul>
        )}
      </div>
    )
    if (canManage) {
      footer = (
        <>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            <Button type="button" variant="outline" className="gap-1.5" disabled={atCap} onClick={() => setView({ kind: "templates" })}>
              <LayoutTemplate className="size-4" /> Ready-made
            </Button>
          </div>
          <Button type="button" className="gap-1.5" disabled={atCap} onClick={() => startEdit({ ...BLANK_DRAFT })} title={atCap ? "A project has at most 50 rules" : undefined}>
            <Plus className="size-4" /> New rule
          </Button>
        </>
      )
    }
  }

  return (
    <ResponsiveDialog title={title} description={description} onClose={onClose} wide focusSelf footer={
      <>
        {problem && view.kind === "edit" && <p role="alert" className="text-xs text-danger sm:mr-auto sm:self-center">{problem}</p>}
        {footer}
      </>
    }>
      <div data-project-rules="" className="space-y-3">{body}</div>
    </ResponsiveDialog>
  )
}
