"use client"

/**
 * How a project estimates (linear-05): in hours, as before, or in points on
 * one of Linear's four scales, with its two larger sizes or not, zero as a
 * size or not, and a task with no points counting as one or as nothing. The
 * backlog, burndown and capacity then count in it, and hours and logged time
 * stay on every task beside the points. Its admins set it; a sheet on a phone.
 */

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Switch } from "@/components/ui/switch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useEstimates } from "@/lib/work/estimates"
import { saveScale } from "@/lib/work/estimateWrites"
import type { EstimateScale, ScaleChoice, ScaleSetting } from "@/lib/work/points"

const HOURS: ScaleSetting = { kind: "hours", extended: false, allow_zero: false, count_unestimated: true }

const settingOf = (s: EstimateScale | null): ScaleSetting =>
  s ? { kind: s.kind, extended: s.extended, allow_zero: s.allow_zero, count_unestimated: s.count_unestimated } : HOURS

/** "1, 2, 3, 5, 8" or "XS, S, M, L, XL": a scale's sizes as a task picks them, with zero and the larger two when they're on. */
function sizesLine(k: ScaleChoice, s: ScaleSetting): string {
  const all = [...k.sizes, ...(s.extended ? k.more : [])]
  const named = all.map((n, i) => k.names?.[i] ?? String(n))
  return [...(s.allow_zero ? ["0"] : []), ...named].join(", ")
}

export default function EstimatesDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const read = useEstimates(projectId)
  const answer = read.data?.data
  const [draft, setDraft] = useState<ScaleSetting | null>(null)
  const setting = draft ?? (answer ? settingOf(answer.scale) : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const ids = { kind: useId(), extended: useId(), zero: useId(), unestimated: useId() }
  const set = (patch: Partial<ScaleSetting>) => setting && setDraft({ ...setting, ...patch })
  const points = setting && setting.kind !== "hours" ? answer?.kinds.find((k) => k.kind === setting.kind) : undefined

  const save = async () => {
    if (!setting || !answer) return
    setSaving(true)
    setError("")
    try {
      const scale = await saveScale(projectId, setting)
      await read.mutate({ data: { ...answer, scale } }, { revalidate: false })
      onSaved()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, "The estimates couldn't be saved. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveDialog
      title="Estimates"
      description="How this project's tasks are sized. The backlog, burndowns and capacity count in it; hours and the time logged stay on every task."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!setting} busy={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {setting && answer ? (
        <div className="grid gap-4 pb-2" data-estimates-form="">
          <div className="grid gap-1.5">
            <Label id={ids.kind}>Estimate in</Label>
            <RadioGroup aria-labelledby={ids.kind} value={setting.kind} onValueChange={(v) => set({ kind: v as ScaleSetting["kind"] })} disabled={saving}>
              {[{ kind: "hours" as const, name: "Hours", line: "How long each task should take." }, ...answer.kinds.map((k) => ({ kind: k.kind, name: k.name, line: sizesLine(k, setting) }))].map((o) => (
                <label key={o.kind} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-hover sm:min-h-10" data-scale-kind={o.kind}>
                  <RadioGroupItem value={o.kind} aria-label={o.name} />
                  <span className="min-w-0">
                    <span className="block text-ui-sm font-[510] text-foreground">{o.name}</span>
                    <span className="block truncate text-meta tabular-nums text-ink-3">{o.line}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          {points ? (
            <div className="grid">
              <label htmlFor={ids.extended} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-ui-sm text-foreground sm:min-h-10">
                The two larger sizes ({points.more.map((n, i) => points.names?.[points.sizes.length + i] ?? String(n)).join(" and ")})
                <Switch id={ids.extended} checked={setting.extended} onCheckedChange={(v) => set({ extended: v })} disabled={saving} />
              </label>
              <label htmlFor={ids.zero} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-ui-sm text-foreground sm:min-h-10">
                Zero is a size
                <Switch id={ids.zero} checked={setting.allow_zero} onCheckedChange={(v) => set({ allow_zero: v })} disabled={saving} />
              </label>
              <label htmlFor={ids.unestimated} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-ui-sm text-foreground sm:min-h-10">
                A task with no estimate counts as one point
                <Switch id={ids.unestimated} checked={setting.count_unestimated} onCheckedChange={(v) => set({ count_unestimated: v })} disabled={saving} />
              </label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-meta text-danger-ink">
              {error}
            </p>
          ) : null}
        </div>
      ) : read.isError ? (
        <ErrorState compact subject="the project's estimates" onRetry={() => void read.mutate()} />
      ) : (
        <div role="status" aria-label="Loading the project's estimates">
          <SkeletonRows rows={5} />
        </div>
      )}
    </ResponsiveDialog>
  )
}
