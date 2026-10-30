"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ToggleChip } from "@/components/ui/toggleChip"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ChevronDown, BadgeCheck } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useStatusRules } from "@/hooks/useTaskApprovals"
import { REQUIRABLE, ruleSummary, type Requirable, type StatusRule, type StatusRuleInput, type Who } from "@/lib/rules/approvals"
import { CATEGORY_KIND, type StatusOption } from "@/lib/taskStatus"
import { ApprovalsNeeded, ClientToo, PeopleChips, neededFor, type Person } from "@/components/work/approvals/approverPicks"

const blank = (status: string): StatusRuleInput => ({ status, who: "anyone", people: [], required: [], approvers: [], approvals_needed: 1, client: false })

/** One status's rule, open to change. */
function RuleEditor({ initial, people, onSave, onCancel, saving }: {
  initial: StatusRuleInput
  people: Person[]
  onSave: (r: StatusRuleInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [r, setR] = useState(initial)
  const set = (patch: Partial<StatusRuleInput>) => setR((cur) => ({ ...cur, ...patch }))
  const approvers = r.approvers.length
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-sunken p-3" data-status-rule-editor="">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-ink-2">Who moves tasks here</p>
        <SegmentedControl aria-label="Who moves tasks here" value={r.who} onValueChange={(who: Who) => set({ who })}
          options={[{ value: "anyone", label: "Anyone" }, { value: "admins", label: "Admins" }, { value: "people", label: "People I pick" }]} />
        {r.who === "people" && <PeopleChips label="Who" people={people} picked={r.people} onChange={(ids) => set({ people: ids })} />}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-ink-2">What it must have first</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What it must have first">
          {REQUIRABLE.map((x) => (
            <ToggleChip tone="neutral" offMark="plus" key={x.value} pressed={r.required.includes(x.value)}
              onPressedChange={(on) => set({ required: on ? [...r.required, x.value] : r.required.filter((v): v is Requirable => v !== x.value) })}>
              {x.label}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-ink-2">Who approves the move</p>
        <PeopleChips label="Approvers" people={people} picked={r.approvers}
          onChange={(ids) => set({ approvers: ids, approvals_needed: neededFor(r.approvals_needed, ids.length) })} />
        <ApprovalsNeeded needed={r.approvals_needed} of={approvers} onChange={(n) => set({ approvals_needed: n })} />
        <ClientToo pressed={r.client} onChange={(client) => set({ client })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-11 md:h-8" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="button" size="sm" className="h-11 md:h-8" onClick={() => onSave(r)} disabled={r.who === "people" && !r.people.length} busy={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

/**
 * A project's status rules (package 9 R2), in its Rules: each status, what
 * moving a task into it takes (who, what it must have, who approves), and,
 * for the project's admins, the rule to change. Kept everywhere a task moves:
 * the board, the list, the API, GitHub, agents and rules.
 */
export function StatusRulesPanel({ projectId, statuses, people }: { projectId: string; statuses: StatusOption[]; people: Person[] }) {
  const { payload, error, isLoading, save, refresh } = useStatusRules(projectId)
  const [open, setOpen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  if (error) return <ErrorState compact subject="this project's status rules" onRetry={() => void refresh()} />
  if (isLoading || !payload) {
    return <div role="status" aria-label="Loading status rules" className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
  }
  const byStatus = new Map(payload.rules.map((r: StatusRule) => [r.status, r]))
  const submit = async (r: StatusRuleInput) => {
    setSaving(true)
    try {
      await save(r)
      setOpen(null)
      toast({ title: "Status rule saved", description: "It holds wherever a task moves." })
    } catch (e) {
      toast({ title: "Couldn't save it", description: apiErrorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }
  return (
    <ul className="space-y-2" aria-label="Status rules">
      {statuses.map((s) => {
        const rule = byStatus.get(s.value)
        const isOpen = open === s.value
        return (
          <li key={s.value} data-status-rule={s.value} className="rounded-xl bg-raised p-3 shadow-e1">
            <div className="flex items-center gap-3">
              <StatusGlyph status={s.kind ?? CATEGORY_KIND[s.category]} />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{s.label}</p>
              {payload.can_manage && (
                // An open row's toggle reads as pressed in the neutral tint,
                // as a chosen pick chip or segment does: orange is for actions.
                <button type="button" {...ix("toggle", { tone: "neutral" })} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.value)}
                  className={cn("inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 md:h-8",
                    isOpen ? "bg-press text-ink" : "text-ink-2 hover:text-ink")}>
                  {rule ? "Change" : "Add a rule"}
                  <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
              )}
            </div>
            {/* Its own line, at full width, under the name: it never wraps beside Change. */}
            <p className={cn("mt-0.5 flex items-start gap-1 pl-7 text-meta", rule ? "text-ink-2" : "text-ink-3")}>
              {rule?.approvers.length || rule?.client ? <BadgeCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" /> : null}
              <span>{rule ? ruleSummary(rule) : "Anyone, any time"}</span>
            </p>
            {isOpen && (
              <RuleEditor initial={rule ? { status: rule.status, who: rule.who, people: rule.people, required: rule.required, approvers: rule.approvers, approvals_needed: rule.approvals_needed, client: rule.client } : blank(s.value)}
                people={people} saving={saving} onCancel={() => setOpen(null)} onSave={(r) => void submit(r)} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
