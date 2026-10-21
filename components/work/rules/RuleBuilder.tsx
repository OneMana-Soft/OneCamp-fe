"use client"

import { useId, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ToggleChip } from "@/components/ui/toggleChip"
import { WorkflowSentence } from "@/components/admin/workflowsParts"
import { Plus, GitBranch, Trash2, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { FIELD_LABEL, FIELD_OPS, VARIABLES, needsValue, newAction, newCondition } from "@/lib/rules/draft"
import { ruleSentence, type RuleNames } from "@/lib/rules/sentence"
import type { StatusOption } from "@/lib/taskStatus"
import {
  MAX_ACTIONS, MAX_CONDITIONS, type ConditionField, type RuleAction, type RuleActionType, type RuleCondition, type RuleDraft, type RuleTrigger, type WatchedField,
} from "@/lib/rules/types"

export interface Person {
  id: string
  name: string
}

const TRIGGERS: { value: RuleTrigger; label: string }[] = [
  { value: "task_created", label: "A task is made" },
  { value: "task_status_changed", label: "A task moves to a status" },
  { value: "task_assigned", label: "A task is assigned" },
  { value: "task_field_changed", label: "A task's details change" },
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
  { value: "add_subtask", label: "Add a sub-task" },
  { value: "notify", label: "Tell someone" },
]

const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const ANY_STATUS = "__any"

/** A select on the builder's 32px row, its own label for a screen reader. */
function Pick({
  label, value, onChange, options, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: ReactNode }[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger dense aria-label={label} className={cn("h-11 min-w-0 text-sm md:h-8 md:text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-sm md:text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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

function ActionRow({
  a, onChange, onRemove, statuses, people,
}: {
  a: RuleAction
  onChange: (a: RuleAction) => void
  onRemove: () => void
  statuses: StatusOption[]
  people: Person[]
}) {
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
              <Pick label="Person" value={a.user_ids?.[0] || (people[0]?.id ?? "")} onChange={(v) => onChange({ ...a, user_ids: [v] })} options={people.map((p) => ({ value: p.id, label: p.name }))} className="w-full md:w-44" />
            )}
            {(a.assign === "round_robin" || a.assign === "least_loaded") && (
              <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Among">
                <span className="mr-1 self-center text-meta text-ink-3">Among</span>
                {people.map((p) => {
                  const on = (a.user_ids ?? []).includes(p.id)
                  return (
                    <ToggleChip key={p.id} pressed={on} onPressedChange={(next) => onChange({ ...a, user_ids: next ? [...(a.user_ids ?? []), p.id] : (a.user_ids ?? []).filter((x) => x !== p.id) })}>
                      {p.name}
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
        return <Input aria-label="Sub-task" placeholder="What the sub-task is called" maxLength={200} value={a.task_name ?? ""} onChange={(e) => onChange({ ...a, task_name: e.target.value })} className="h-11 min-w-0 flex-1 md:h-8" />
      case "add_comment":
        return <Textarea aria-label="Comment" rows={2} maxLength={4000} value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} className="min-h-16 w-full text-sm" />
      case "notify":
        return (
          <>
            <Pick label="Who" value={a.notify ?? "assignee"} onChange={(v) => onChange({ ...a, notify: v as RuleAction["notify"], user_ids: v === "people" ? [people[0]?.id ?? ""] : undefined })}
              options={[
                { value: "assignee", label: "Whoever has it" },
                { value: "creator", label: "Its creator" },
                { value: "actor", label: "Whoever changed it" },
                { value: "people", label: "People I pick" },
              ]} className="w-full md:w-44" />
            {a.notify === "people" && (
              <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="People">
                {people.map((p) => {
                  const on = (a.user_ids ?? []).includes(p.id)
                  return (
                    <ToggleChip key={p.id} pressed={on} onPressedChange={(next) => onChange({ ...a, user_ids: next ? [...(a.user_ids ?? []), p.id] : (a.user_ids ?? []).filter((x) => x !== p.id) })}>
                      {p.name}
                    </ToggleChip>
                  )
                })}
              </div>
            )}
            <Input aria-label="Notice" maxLength={300} value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} className="h-11 w-full md:h-8" />
          </>
        )
    }
    return null
  })()
  return (
    <div data-rule-action={a.type} className="relative flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-2 pr-14 md:pr-2">
      <Pick label="Action" value={a.type} onChange={(t) => onChange(newAction(t as RuleActionType))} options={ACTIONS} className="w-full md:w-44" />
      {fields}
      <Remove label="Remove this action" onClick={onRemove} />
    </div>
  )
}

function Actions({
  list, onChange, statuses, people, addLabel,
}: {
  list: RuleAction[]
  onChange: (list: RuleAction[]) => void
  statuses: StatusOption[]
  people: Person[]
  addLabel: string
}) {
  return (
    <>
      {list.map((a, i) => (
        <ActionRow key={i} a={a} statuses={statuses} people={people}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(list.filter((_, j) => j !== i))} />
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
  draft, onChange, statuses, people, names,
}: {
  draft: RuleDraft
  onChange: (d: RuleDraft) => void
  statuses: StatusOption[]
  people: Person[]
  names: RuleNames
}) {
  const nameId = useId()
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch })
  const conds = draft.conditions.items ?? []
  const setConds = (items: RuleCondition[]) => set({ conditions: { ...draft.conditions, items } })
  return (
    <div className="space-y-3" data-rule-builder="">
      <div aria-live="polite" className="rounded-xl bg-sunken px-3 py-2.5">
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">Reads as</p>
        <WorkflowSentence parts={ruleSentence(draft, names, 4)} className="text-sm" />
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-ink-2">Name</label>
        <Input id={nameId} value={draft.name} maxLength={120} placeholder="Share new work out by turns" onChange={(e) => set({ name: e.target.value })} className="h-11 md:h-9" />
      </div>

      <Step n="1" title="When" hint="What starts the rule">
        <div className="flex flex-wrap items-center gap-2">
          <Pick label="Trigger" value={draft.trigger_type} onChange={(v) => set({ trigger_type: v as RuleTrigger, trigger_config: {} })} options={TRIGGERS} className="w-full md:w-60" />
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
                <ToggleChip key={f.value} pressed={on}
                  onPressedChange={(next) => set({ trigger_config: { fields: next ? [...(draft.trigger_config.fields ?? []), f.value] : (draft.trigger_config.fields ?? []).filter((x) => x !== f.value) } })}>
                  {f.label}
                </ToggleChip>
              )
            })}
            {!(draft.trigger_config.fields ?? []).length && <span className="self-center text-meta text-ink-3">any of them</span>}
          </div>
        )}
      </Step>

      <Step n="2" title="If" hint={conds.length ? "Read from the task when the rule runs" : "Optional: only for some tasks"}>
        {conds.length > 1 && (
          <SegmentedControl aria-label="Match" value={draft.conditions.match ?? "all"} onValueChange={(m) => set({ conditions: { ...draft.conditions, match: m } })}
            options={[{ value: "all", label: "All of these" }, { value: "any", label: "Any of these" }]} />
        )}
        {conds.map((c, i) => (
          <ConditionRow key={i} c={c} statuses={statuses} people={people}
            onChange={(next) => setConds(conds.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setConds(conds.filter((_, j) => j !== i))} />
        ))}
        {conds.length < MAX_CONDITIONS && (
          <Button type="button" variant="ghost" className="h-11 gap-1.5 text-brand-text md:h-8" onClick={() => setConds([...conds, newCondition("priority")])}>
            <Plus className="size-4" /> Add a condition
          </Button>
        )}
      </Step>

      <Step n="3" title="Then" hint="What it does, in order, as you">
        <Actions list={draft.actions} onChange={(actions) => set({ actions })} statuses={statuses} people={people} addLabel="Add an action" />
        <p className="text-meta text-ink-3">Messages can say {VARIABLES.join(", ")}.</p>
      </Step>

      {conds.length > 0 && (
        draft.else_actions.length > 0 ? (
          <Step n="4" title="Otherwise" hint="When the conditions don't hold">
            <Actions list={draft.else_actions} onChange={(else_actions) => set({ else_actions })} statuses={statuses} people={people} addLabel="Add an action" />
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
