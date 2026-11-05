"use client"

// Putting a sensitivity label on a board or a doc, or taking it off (miro-44
// L): a dialog on a computer, the shared sheet on a phone with Save pinned in
// its footer (ResponsiveDialog). Loaded on demand, from the header's chip, a
// board's More or a doc's More and the phone's sheet. It only presents: the
// page reads and writes through its hook (./labelData's useLabelling) and
// passes the empty state in, so this chunk brings no reads of its own.
//
// Anyone who can edit the item may put a label on it; only its owner or a
// workspace admin may lower or take off its label. The server decides, and a
// refusal is shown in the server's own words.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { HueDot } from "@/components/ui/chip"
import { PartRetry } from "@/components/ui/part-retry"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { campHueOf } from "@/lib/campHue"
import { saidHere } from "@/lib/http/saidHere"
import { cn } from "@/lib/utils/helpers/cn"
import { byLevel, labelRefusal, ruleLine } from "@/lib/labels/labelRules"
import type { Labelling, SensitivityLabel } from "@/lib/labels/labelTypes"

/** The radio value for "no label". */
const NONE = ""

export default function LabelPicker({ labelling, empty, onClose }: { labelling: Labelling; empty: React.ReactNode; onClose: () => void }) {
  const { kind, label: current, labels: read } = labelling
  const { catalogue, loading, failed, retry } = read
  const [choice, setChoice] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const chosen = choice ?? current?.id ?? NONE
  const labels = byLevel(catalogue?.labels)
  const changed = chosen !== (current?.id ?? NONE)

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      await labelling.save(chosen || null)
      onClose()
    } catch (e) {
      setError(labelRefusal(e) ?? saidHere(e, "The label didn't change. Try again."))
      setSaving(false)
    }
  }

  const option = (value: string, label: SensitivityLabel | null) => {
    const on = chosen === value
    const hue = label ? campHueOf(label.colour) : null
    return (
      <button
        key={value || "none"}
        type="button"
        role="radio"
        aria-checked={on}
        data-label-option={label?.name ?? "none"}
        onClick={() => (setChoice(value), setError(""))}
        className={cn(
          "flex min-h-11 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          on ? "border-brand/40 bg-brand-muted ring-1 ring-inset ring-brand/30" : "border-line hover:bg-hover",
        )}
      >
        <span className="mt-1.5 flex size-3 shrink-0 items-center justify-center">{hue ? <HueDot hue={hue} /> : null}</span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-ui-sm font-medium text-ink [overflow-wrap:anywhere]">{label ? label.name : "No label"}</span>
          <span className="text-meta text-ink-3">{label ? ruleLine(label.rules, catalogue?.rules) : "No rules hold beyond each person's access."}</span>
        </span>
      </button>
    )
  }

  let body: React.ReactNode
  if (failed) {
    body = <PartRetry what="the labels" retry={retry} />
  } else if (loading) {
    body = (
      <div aria-label="Loading the labels" className="grid gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  } else if (labels.length === 0 && !current) {
    body = empty
  } else {
    // A label removed since it was put on the item still shows, so the person sees what they would change.
    const shown = current && !labels.some((l) => l.id === current.id) ? [current, ...labels] : labels
    body = (
      <div role="radiogroup" aria-label="Label" className="grid gap-2" data-label-picker="">
        {shown.map((l) => option(l.id, l))}
        {option(NONE, null)}
      </div>
    )
  }

  return (
    <ResponsiveDialog
      title={`Label this ${kind}`}
      description="A label's rules hold on the server, for everyone."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!changed || loading || failed} busy={saving} data-label-save="">
            Save
          </Button>
        </>
      }
    >
      {body}
      {error ? (
        <p role="alert" className="mt-3 text-ui-sm text-danger-ink" data-label-error="">
          {error}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}
