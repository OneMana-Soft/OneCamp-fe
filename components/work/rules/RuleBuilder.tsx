"use client"

import { useId, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Pick } from "@/components/ui/pick"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { TimeField } from "@/components/ui/date-field"
import { ToggleChip } from "@/components/ui/toggleChip"
import { Tile } from "@/components/ui/graphics/Tile"
import { PrincipalTag } from "@/components/ui/principalTag"
import { WorkflowSentence } from "@/components/admin/workflowsParts"
import { Bot, Plus, GitBranch, Trash2, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { browserTZ } from "@/lib/utils/timeZone"
import { zoneLabel } from "@/lib/utils/zones"
import { WEEK } from "@/lib/calendar/repeat"
import { WEEKDAYS } from "@/lib/tasks/recurrence"
import { FIELD_LABEL, FIELD_OPS, needsValue, newAction, newCondition, variablesFor, withTrigger } from "@/lib/rules/draft"
import type { ProjectForm } from "@/lib/forms/forms"
import { ordinal, repeatOf, ruleOf, type RepeatKind } from "@/lib/rules/schedule"
import { ASSISTANT, forEachTask, ruleSentence, suggestedName, type RuleNames } from "@/lib/rules/sentence"
import type { StatusOption } from "@/lib/taskStatus"
import {
  MAX_ACTIONS, MAX_CONDITIONS, type ApprovalOutcome, type ConditionField, type RuleAction, type RuleActionType, type RuleCondition, type RuleDraft, type RuleTrigger,
  type RuleTriggerConfig, type WatchedField,
} from "@/lib/rules/types"

export interface Person {
  id: string
  name: string
  /** An AI teammate in the project: a rule may give it work, which starts it. */
  agent?: boolean
}

const TRIGGERS: { value: RuleTrigger; label: string }[] = [
  { value: "task_created", label: "A task is made" },
  { value: "task_status_changed", label: "A task moves to a status" },
  { value: "task_assigned", label: "A task is assigned" },
  { value: "task_field_changed", label: "A task's details change" },
  { value: "form_submitted", label: "A form is sent" },
  { value: "approval_decided", label: "An approval is answered" },
  { value: "schedule", label: "On a schedule" },
  { value: "task_due_soon", label: "A task is due soon" },
  { value: "task_overdue", label: "A task becomes overdue" },
]

const REPEATS: { value: RepeatKind; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "On days I pick" },
  { value: "monthly", label: "Every month" },
]

const MONTH_DAYS = [
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `On the ${ordinal(i + 1)}` })),
  { value: "-1", label: "On the last day" },
]

const WATCHED: { value: WatchedField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "due", label: "Due date" },
  { value: "tags", label: "Tags" },
  { value: "name", label: "Name" },
]

const ACTIONS: { value: RuleActionType; label: string }[] = [
  { value: "assign", label: "Assign it" },
  { value: "set_status", label: "Move it to a status" },
  { value: "set_priority", label: "Set its priority" },
  { value: "set_due", label: "Set its due date" },
  { value: "add_comment", label: "Comment on it" },
  { value: "add_subtask", label: "Add a subtask" },
  { value: "notify", label: "Tell someone" },
]

const ASK_AGENT: { value: RuleActionType; label: string } = { value: "ask_agent", label: "Ask an agent" }

const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const ANY_STATUS = "__any"
const OUTCOMES: { value: ApprovalOutcome | typeof ANY_STATUS; label: string }[] = [
  { value: ANY_STATUS, label: "Any answer" },
  { value: "approved", label: "Approved" },
  { value: "changes", label: "Changes asked for" },
  { value: "rejected", label: "Rejected" },
]

/**
 * One step of the rule: a numbered mark, its word (When, If, Then,
 * Otherwise), what it means, and its rows. Depth, not lines: the step is a
 * raised card on the dialog's sunken well.
 */
function Step({ n, title, hint, children }: { n: string; title: string; hint: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-rule-step={title.toLowerCase()} className="rounded-xl bg-raised p-3 shadow-e1 md:p-4">
      <header className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-2xs font-semibold tabular-nums",
            "bg-sunken text-ink-2",
          )}
        >
          {n}
        </span>
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-meta text-ink-3">{hint}</p>
        </div>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

/** A row's remove button: 44px on a phone, 32 on a computer. */
function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} className="absolute right-1 top-1 size-11 shrink-0 text-ink-3 md:static md:ml-auto md:size-8" onClick={onClick}>
      <X className="size-4" />
    </Button>
  )
}

/** When a schedule runs: how often, on which days, and at what time, in the reader's zone. */
function ScheduleFields({ config, onChange }: { config: RuleTriggerConfig; onChange: (c: RuleTriggerConfig) => void }) {
  const r = repeatOf(config.repeat)
  const repeat = (next: typeof r) => onChange({ ...config, repeat: ruleOf(next) })
  return (
    <div className="space-y-2" data-rule-schedule="">
      <div className="flex flex-wrap items-center gap-2">
        <Pick label="How often" value={r.kind} onChange={(k) => repeat({ ...r, kind: k as RepeatKind, days: r.days.length ? r.days : ["MO"] })} options={REPEATS} className="w-full md:w-44" />
        {r.kind === "monthly" && (
          <Pick label="Day of the month" value={String(r.monthDay)} onChange={(v) => repeat({ ...r, monthDay: Number(v) })} options={MONTH_DAYS} className="w-full md:w-40" />
        )}
        <TimeField aria-label="At" value={config.at ?? "09:00"} onChange={(at) => onChange({ ...config, at })} className="h-11 w-full md:h-8 md:w-36" />
      </div>
      {r.kind === "weekly" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
          {WEEK.map((d, i) => (
            <ToggleChip tone="neutral" offMark="plus" key={d} pressed={r.days.includes(d)} onPressedChange={(on) => repeat({ ...r, days: on ? [...r.days, d] : r.days.filter((x) => x !== d) })}>
              {WEEKDAYS[i].long}
            </ToggleChip>
          ))}
        </div>
      )}
    </div>
  )
}

/** When a due date fires a rule: how many days before it (due soon), and at what time. */
function DueFields({ trigger, config, onChange }: { trigger: RuleTrigger; config: RuleTriggerConfig; onChange: (c: RuleTriggerConfig) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-rule-due="">
      {trigger === "task_due_soon" && (
        <span className="flex items-center gap-1.5">
          <Input aria-label="Days before" inputMode="numeric" value={String(config.days ?? 1)}
            onChange={(e) => onChange({ ...config, days: Math.min(30, Number(e.target.value.replace(/\D/g, "") || 0)) })} className="h-11 w-16 text-center tabular-nums md:h-8" />
          <span className="text-xs text-ink-3">{config.days === 1 ? "day before it's due" : "days before it's due"}</span>
        </span>
      )}
      {trigger === "task_overdue" && <span className="text-xs text-ink-3">The day after it was due</span>}
      <TimeField aria-label="At" value={config.at ?? "09:00"} onChange={(at) => onChange({ ...config, at })} className="h-11 w-full md:h-8 md:w-36" />
    </div>
  )
}

function ConditionRow({
  c, onChange, onRemove, statuses, people,
}: {
  c: RuleCondition
  onChange: (c: RuleCondition) => void
  onRemove: () => void
  statuses: StatusOption[]
  people: Person[]
}) {
  const ops = FIELD_OPS[c.field]
  const value = (() => {
    if (!needsValue(c.op)) return null
    switch (c.field) {
      case "priority":
        return <Pick label="Priority" value={c.value ?? "high"} onChange={(v) => onChange({ ...c, value: v })} options={PRIORITIES} className="w-full md:w-32" />
      case "status":
        return <Pick label="Status" value={c.value ?? "todo"} onChange={(v) => onChange({ ...c, value: v })} options={statuses.map((s) => ({ value: s.value, label: s.label }))} className="w-full md:w-40" />
      case "assignee":
      case "creator":
        return (
          <Pick label="Person" value={c.value || (people[0]?.id ?? "")} onChange={(v) => onChange({ ...c, value: v })}
            options={people.map((p) => ({ value: p.id, label: p.name }))} className="w-full md:w-44" />
        )
      case "due":
        return (
          <span className="flex items-center gap-1.5">
            <Input aria-label="Days" inputMode="numeric" value={c.value ?? ""} onChange={(e) => onChange({ ...c, value: e.target.value.replace(/\D/g, "").slice(0, 3) })} className="h-11 w-16 text-center tabular-nums md:h-8" />
            <span className="text-xs text-ink-3">days</span>
          </span>
        )
      default:
        return <Input aria-label={c.field === "tags" ? "Tag" : "Words"} value={c.value ?? ""} maxLength={c.field === "tags" ? 32 : 200} onChange={(e) => onChange({ ...c, value: e.target.value })} className="h-11 w-full min-w-0 md:h-8 md:w-44" />
    }
  })()
  return (
    <div data-rule-condition="" className="relative flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-2 pr-14 md:pr-2">
      <Pick label="Field" value={c.field} onChange={(f) => onChange(newCondition(f as ConditionField))}
        options={(Object.keys(FIELD_OPS) as ConditionField[]).map((f) => ({ value: f, label: FIELD_LABEL[f] }))} className="w-[calc(50%-0.25rem)] md:w-32" />
      <Pick label="Comparison" value={c.op} onChange={(op) => onChange({ ...c, op: op as RuleCondition["op"] })}
        options={ops.map((o) => ({ value: o.op, label: o.label }))} className="w-[calc(50%-0.25rem)] md:w-32" />
      {value}
      <Remove label="Remove this condition" onClick={onRemove} />
    </div>
  )
}

/** The pick for OneCamp AI among a rule's AI teammates (a select's value can't be empty). */
const ASSISTANT_KEY = "__assistant"

function ActionRow({
  a, onChange, onRemove, statuses, people, kinds, fixed, agents = [],
}: {
  a: RuleAction
  onChange: (a: RuleAction) => void
  onRemove?: () => void
  statuses: StatusOption[]
  /** The project's people and, last, its AI teammates (only assignments name one). */
  people: Person[]
  kinds: { value: RuleActionType; label: string }[]
  /** The schedule's own first step: it makes the task, and stays. */
  fixed?: boolean
  /** The workspace's AI teammates a rule may ask, besides OneCamp AI. */
  agents?: Person[]
}) {
  const humans = people.filter((p) => !p.agent)
  const fields = (() => {
    switch (a.type) {
      case "set_status":
        return <Pick label="Status" value={a.status ?? "inProgress"} onChange={(v) => onChange({ ...a, status: v })} options={statuses.map((s) => ({ value: s.value, label: s.label }))} className="w-full md:w-44" />
      case "set_priority":
        return <Pick label="Priority" value={a.priority || "high"} onChange={(v) => onChange({ ...a, priority: v as RuleAction["priority"] })} options={PRIORITIES} className="w-full md:w-32" />
      case "assign":
        return (
          <>
            <Pick label="To whom" value={a.assign ?? "round_robin"} onChange={(v) => onChange({ ...a, assign: v as RuleAction["assign"], user_ids: v === "person" ? [people[0]?.id ?? ""] : v === "round_robin" || v === "least_loaded" ? a.user_ids : undefined })}
              options={[
                { value: "round_robin", label: "By turns" },
                { value: "least_loaded", label: "Whoever has least" },
                { value: "person", label: "A person" },
                { value: "creator", label: "Its creator" },
                { value: "actor", label: "Whoever changed it" },
                { value: "nobody", label: "Nobody" },
              ]} className="w-full md:w-44" />
            {a.assign === "person" && (
              <Pick label="Person" value={a.user_ids?.[0] || (people[0]?.id ?? "")} onChange={(v) => onChange({ ...a, user_ids: [v] })} options={people.map((p) => ({ value: p.id, label: p.agent ? `${p.name} (AI teammate)` : p.name }))} className="w-full md:w-44" />
            )}
            {(a.assign === "round_robin" || a.assign === "least_loaded") && (
              <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Among">
                <span className="mr-1 self-center text-meta text-ink-3">Among</span>
                {people.map((p) => {
                  const on = (a.user_ids ?? []).includes(p.id)
                  return (
                    <ToggleChip tone="neutral" offMark="plus" key={p.id} pressed={on} onPressedChange={(next) => onChange({ ...a, user_ids: next ? [...(a.user_ids ?? []), p.id] : (a.user_ids ?? []).filter((x) => x !== p.id) })}>
                      {p.agent ? `${p.name} · AI` : p.name}
                    </ToggleChip>
                  )
                })}
                {!(a.user_ids ?? []).length && <span className="self-center text-meta text-ink-3">everyone in the project</span>}
              </div>
            )}
          </>
        )
      case "set_due":
        return (
          <span className="flex items-center gap-1.5">
            <Pick label="When" value={a.due_in_days == null ? "clear" : "days"} onChange={(v) => onChange({ ...a, due_in_days: v === "clear" ? null : 3 })}
              options={[{ value: "days", label: "In" }, { value: "clear", label: "Clear it" }]} className="w-24" />
            {a.due_in_days != null && (
              <>
                <Input aria-label="Days" inputMode="numeric" value={String(a.due_in_days)} onChange={(e) => onChange({ ...a, due_in_days: Math.min(365, Number(e.target.value.replace(/\D/g, "") || 0)) })} className="h-11 w-16 text-center tabular-nums md:h-8" />
                <span className="text-xs text-ink-3">days</span>
              </>
            )}
          </span>
        )
      case "add_subtask":
        return <Input aria-label="Subtask" placeholder="What the subtask is called" maxLength={200} value={a.task_name ?? ""} onChange={(e) => onChange({ ...a, task_name: e.target.value })} className="h-11 min-w-0 flex-1 md:h-8" />
      case "add_comment":
        return <Textarea aria-label="Comment" rows={2} maxLength={4000} value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} className="min-h-16 w-full text-sm" />
      case "notify":
        return (
          <>
            <Pick label="Who" value={a.notify ?? "assignee"} onChange={(v) => onChange({ ...a, notify: v as RuleAction["notify"], user_ids: v === "people" ? [humans[0]?.id ?? ""] : undefined })}
              options={[
                { value: "assignee", label: "Whoever has it" },
                { value: "creator", label: "Its creator" },
                { value: "actor", label: "Whoever changed it" },
                { value: "people", label: "People I pick" },
              ]} className="w-full md:w-44" />
            {a.notify === "people" && (
              <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="People">
                {humans.map((p) => {
                  const on = (a.user_ids ?? []).includes(p.id)
                  return (
                    <ToggleChip tone="neutral" offMark="plus" key={p.id} pressed={on} onPressedChange={(next) => onChange({ ...a, user_ids: next ? [...(a.user_ids ?? []), p.id] : (a.user_ids ?? []).filter((x) => x !== p.id) })}>
                      {p.name}
                    </ToggleChip>
                  )
                })}
              </div>
            )}
            <Input aria-label="Notice" maxLength={300} value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} className="h-11 w-full md:h-8" />
          </>
        )
      case "create_task":
        return (
          <>
            <Input aria-label="Task" placeholder="What the task is called" maxLength={200} value={a.task_name ?? ""} onChange={(e) => onChange({ ...a, task_name: e.target.value })} className="h-11 min-w-0 flex-1 md:h-8" />
            <Pick label="Priority" value={a.priority || "medium"} onChange={(v) => onChange({ ...a, priority: v as RuleAction["priority"] })} options={PRIORITIES} className="w-full md:w-32" />
          </>
        )
      case "ask_agent": {
        const named = agents.find((g) => g.id === a.agent_id)
        const choices = [{ value: ASSISTANT_KEY, label: ASSISTANT }, ...agents.map((g) => ({ value: g.id, label: g.name }))]
        // A teammate since removed stays named as such until another is picked.
        if (a.agent_id && !named) choices.push({ value: a.agent_id, label: "An AI teammate no longer here" })
        return (
          <div className="w-full space-y-2">
            {/* On a phone the label sits above its row: the mark, the pick and the tag on one line. */}
            <div className="flex flex-wrap items-center gap-2" data-rule-agent="">
              <span className="w-full text-xs text-ink-3 md:w-auto">Answered by</span>
              <Tile hue="dusk" size="sm" className="bg-agent-muted text-agent-ink"><Bot /></Tile>
              {choices.length > 1 ? (
                <Pick label="Answered by" value={a.agent_id || ASSISTANT_KEY} onChange={(v) => onChange({ ...a, agent_id: v === ASSISTANT_KEY ? undefined : v })}
                  options={choices} className="flex-1 md:w-48 md:flex-none" />
              ) : (
                <span className="text-sm font-medium text-ink">{ASSISTANT}</span>
              )}
              <PrincipalTag kind="ai" />
            </div>
            <Textarea aria-label="Question" rows={2} maxLength={2000} placeholder="What should it work out? Like: how bad is this bug, and what's missing to reproduce it?"
              value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} className="min-h-16 w-full text-sm" />
            <p className="text-meta text-ink-3">
              {named ? `${named.name} takes it on as its own work and answers on the task.` : `${ASSISTANT} reads the task as you and answers on it, on your workspace's own model.`}
            </p>
          </div>
        )
      }
    }
    return null
  })()
  return (
    <div data-rule-action={a.type} className={cn("relative flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-2 md:pr-2", onRemove && "pr-14")}>
      {fixed ? (
        <span className="w-full text-xs font-medium text-ink-2 md:w-44">Make a task</span>
      ) : (
        <Pick label="Action" value={a.type} onChange={(t) => onChange(newAction(t as RuleActionType))} options={kinds} className="w-full md:w-44" />
      )}
      {fields}
      {onRemove && <Remove label="Remove this action" onClick={onRemove} />}
    </div>
  )
}

function Actions({
  list, onChange, statuses, people, addLabel, kinds, makesTask, agents,
}: {
  list: RuleAction[]
  onChange: (list: RuleAction[]) => void
  statuses: StatusOption[]
  people: Person[]
  addLabel: string
  kinds: { value: RuleActionType; label: string }[]
  /** A schedule's steps: the first makes the task the rest act on. */
  makesTask?: boolean
  agents?: Person[]
}) {
  return (
    <>
      {list.map((a, i) => (
        <ActionRow key={i} a={a} statuses={statuses} people={people} kinds={kinds} fixed={makesTask && i === 0} agents={agents}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          onRemove={makesTask && i === 0 ? undefined : () => onChange(list.filter((_, j) => j !== i))} />
      ))}
      {list.length < MAX_ACTIONS && (
        <Button type="button" variant="ghost" className="h-11 gap-1.5 text-brand-text md:h-8" onClick={() => onChange([...list, newAction("add_comment")])}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      )}
    </>
  )
}

/**
 * The rule builder (package 9 R1): When, If, Then and Otherwise, each a step
 * card, with the rule read back as one sentence above them as it changes.
 * Every choice is a pick from what the project has (its statuses, its
 * people), so a saved rule never names something the project lacks.
 */
export function RuleBuilder({
  draft, onChange, statuses, people, names, agents = false, agentChoices = [], autoName = false, onNamed, forms = [],
}: {
  draft: RuleDraft
  onChange: (d: RuleDraft) => void
  statuses: StatusOption[]
  /** The project's people, and its AI teammates marked as such. */
  people: Person[]
  names: RuleNames
  /** Whether this build can ask an agent (the AI edition). */
  agents?: boolean
  /** The workspace's AI teammates a rule may ask, besides OneCamp AI. */
  agentChoices?: Person[]
  /** The name follows the rule until someone types one (onNamed), and again once it's cleared. */
  autoName?: boolean
  onNamed?: (named: boolean) => void
  /** The project's forms, which a rule can run on. */
  forms?: Pick<ProjectForm, "id" | "title" | "fields">[]
}) {
  const nameId = useId()
  const emit = (next: RuleDraft) => onChange(autoName ? { ...next, name: suggestedName(next, names) } : next)
  const set = (patch: Partial<RuleDraft>) => emit({ ...draft, ...patch })
  const conds = draft.conditions.items ?? []
  const setConds = (items: RuleCondition[]) => set({ conditions: { ...draft.conditions, items } })
  const schedule = draft.trigger_type === "schedule"
  const each = forEachTask(draft)
  const makesTask = schedule && !each
  const humans = people.filter((p) => !p.agent)
  const kinds = agents ? [...ACTIONS, ASK_AGENT] : ACTIONS
  const setConfig = (trigger_config: RuleTriggerConfig) => set({ trigger_config })
  // A form's rule starts on the project's first form; its messages can say each of its answers.
  const pickTrigger = (t: RuleTrigger) => {
    const next = withTrigger(draft, t)
    emit(t === "form_submitted" && forms[0]?.id ? { ...next, trigger_config: { ...next.trigger_config, form_id: forms[0].id } } : next)
  }
  const form = draft.trigger_type === "form_submitted" ? forms.find((f) => f.id === draft.trigger_config.form_id) : undefined
  const answers = (form?.fields ?? []).filter((f) => f.type !== "section")
  return (
    <div className="space-y-3" data-rule-builder="">
      <div aria-live="polite" className="rounded-xl bg-sunken px-3 py-2.5">
        <p className="mb-1 text-2xs font-semibold text-ink-3">Reads as</p>
        <WorkflowSentence parts={ruleSentence(draft, names, 4)} className="text-sm" />
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-ink-2">Name</label>
        <Input id={nameId} value={draft.name} maxLength={120} placeholder={suggestedName(draft, names)}
          onChange={(e) => {
            onNamed?.(!!e.target.value.trim())
            onChange({ ...draft, name: e.target.value })
          }} className="h-11 md:h-9" />
      </div>

      <Step n="1" title="When" hint={schedule ? `On a schedule, in your time zone: ${zoneLabel(browserTZ())}` : draft.trigger_type === "form_submitted" ? "Each time it's sent, about the task it makes" : draft.trigger_type === "approval_decided" ? "When a task's request is answered for good" : "What starts the rule"}>
        <div className="flex flex-wrap items-center gap-2">
          <Pick label="Trigger" value={draft.trigger_type} onChange={(v) => pickTrigger(v as RuleTrigger)} options={TRIGGERS} className="w-full md:w-60" />
          {draft.trigger_type === "form_submitted" && forms.length > 0 && (
            <Pick label="Form" value={draft.trigger_config.form_id ?? ""} onChange={(form_id) => set({ trigger_config: { ...draft.trigger_config, form_id } })}
              options={forms.filter((f) => f.id).map((f) => ({ value: f.id!, label: f.title }))} className="w-full md:w-56" />
          )}
          {draft.trigger_type === "approval_decided" && (
            <Pick label="How it ends" value={draft.trigger_config.outcome || ANY_STATUS}
              onChange={(v) => set({ trigger_config: v === ANY_STATUS ? {} : { outcome: v as ApprovalOutcome } })}
              options={OUTCOMES} className="w-full md:w-48" />
          )}
          {draft.trigger_type === "task_status_changed" && (
            <Pick label="Status it moves to" value={draft.trigger_config.to_status || ANY_STATUS}
              onChange={(v) => set({ trigger_config: v === ANY_STATUS ? {} : { to_status: v } })}
              options={[{ value: ANY_STATUS, label: "Any status" }, ...statuses.map((s) => ({ value: s.value, label: s.label }))]} className="w-full md:w-44" />
          )}
        </div>
        {draft.trigger_type === "task_field_changed" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which details">
            {WATCHED.map((f) => {
              const on = (draft.trigger_config.fields ?? []).includes(f.value)
              return (
                <ToggleChip tone="neutral" offMark="plus" key={f.value} pressed={on}
                  onPressedChange={(next) => set({ trigger_config: { fields: next ? [...(draft.trigger_config.fields ?? []), f.value] : (draft.trigger_config.fields ?? []).filter((x) => x !== f.value) } })}>
                  {f.label}
                </ToggleChip>
              )
            })}
            {!(draft.trigger_config.fields ?? []).length && <span className="self-center text-meta text-ink-3">any of them</span>}
          </div>
        )}
        {schedule && (
          <>
            <ScheduleFields config={draft.trigger_config} onChange={setConfig} />
            <SegmentedControl aria-label="What it does" value={each ? "each" : "make"} onValueChange={(v) => emit(withTrigger(draft, "schedule", v === "each"))}
              options={[{ value: "make", label: "Makes a task" }, { value: "each", label: "Acts on each task" }]} />
          </>
        )}
        {(draft.trigger_type === "task_due_soon" || draft.trigger_type === "task_overdue") && (
          <DueFields trigger={draft.trigger_type} config={draft.trigger_config} onChange={setConfig} />
        )}
        {draft.trigger_type === "form_submitted" && !forms.length && (
          <p className="text-meta text-ink-3">This project has no forms yet. Make one under Forms, in the project&apos;s menu.</p>
        )}
      </Step>

      {!makesTask && (
      <Step n="2" title={each ? "Which tasks" : "If"} hint={each ? "Open tasks in the project that match, read when it runs" : conds.length ? "Read from the task when the rule runs" : "Optional: only for some tasks"}>
        {conds.length > 1 && (
          <SegmentedControl aria-label="Match" value={draft.conditions.match ?? "all"} onValueChange={(m) => set({ conditions: { ...draft.conditions, match: m } })}
            options={[{ value: "all", label: "All of these" }, { value: "any", label: "Any of these" }]} />
        )}
        {conds.map((c, i) => (
          <ConditionRow key={i} c={c} statuses={statuses} people={humans}
            onChange={(next) => setConds(conds.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setConds(conds.filter((_, j) => j !== i))} />
        ))}
        {conds.length < MAX_CONDITIONS && (
          <Button type="button" variant="ghost" className="h-11 gap-1.5 text-brand-text md:h-8" onClick={() => setConds([...conds, newCondition("priority")])}>
            <Plus className="size-4" /> Add a condition
          </Button>
        )}
      </Step>
      )}

      <Step n={makesTask ? "2" : "3"} title="Then" hint={makesTask ? "It makes the task, then does the rest to it, as you" : each ? "What it does to each task, as you" : "What it does, in order, as you"}>
        <Actions list={draft.actions} onChange={(actions) => set({ actions })} statuses={statuses} people={people} addLabel="Add an action" kinds={kinds} makesTask={makesTask} agents={agentChoices} />
        <div data-rule-variables="" className="text-meta text-ink-3">
          Messages can say {variablesFor(draft.trigger_type).join(", ")}{answers.length ? ", and each answer:" : "."}
          {answers.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {answers.map((a) => (
                <span key={a.id} className="inline-flex min-w-0 items-baseline gap-1">
                  <code className="rounded-sm bg-sunken px-1 font-mono text-2xs text-ink-2">{`{answer:${a.id}}`}</code>
                  <span className="truncate">{a.label}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </Step>

      {conds.length > 0 && !schedule && (
        draft.else_actions.length > 0 ? (
          <Step n="4" title="Otherwise" hint="When the conditions don't hold">
            <Actions list={draft.else_actions} onChange={(else_actions) => set({ else_actions })} statuses={statuses} people={people} addLabel="Add an action" kinds={kinds} agents={agentChoices} />
          </Step>
        ) : (
          <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2 rounded-xl text-ink-2 md:h-9" onClick={() => set({ else_actions: [newAction("notify")] })}>
            <GitBranch className="size-4" /> Add what happens otherwise
          </Button>
        )
      )}
      {draft.else_actions.length > 0 && conds.length === 0 && (
        <p className="flex items-center gap-1.5 text-meta text-ink-3">
          <Trash2 className="size-3.5" aria-hidden="true" /> Without a condition, otherwise never runs; it is dropped when you save.
        </p>
      )}
    </div>
  )
}
