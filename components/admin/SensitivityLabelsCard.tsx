"use client"

// Settings › Security › Sensitivity labels (miro-44 L): the labels a board or a
// doc can carry, each with rules that hold on the server for everyone. Only a
// workspace admin defines, changes or removes them (the /admin routes refuse
// anyone else, and an AI agent acting for an admin); anyone who can edit a
// board or a doc puts one on it (components/labels/LabelPicker), and only the
// item's owner or an admin lowers it or takes it off. Guests never see labels.
//
// A change is confirmed in place beside the list's heading, never by a toast
// over the next row (LegalHoldsCard's rule, main 3 Nov 02:0x).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { HueDot } from "@/components/ui/chip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorPicker } from "@/components/ui/paletteColorPicker"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { Switch } from "@/components/ui/switch"
import { campHueOf } from "@/lib/campHue"
import { Plus, ShieldCheck } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  byLevel,
  changeLabel,
  defineLabel,
  draftProblem,
  loadLabels,
  removeLabel,
  ruleLine,
  type LabelCatalogue,
  type LabelDraft,
  type LabelHttp,
  type SensitivityLabel,
} from "@/lib/labels/labels"

type Load = "loading" | "ready" | "failed"

/** A new label's starting point: the berry hue (lib/taskStatus STORED_NAME), level 1, no rules yet. */
const FRESH: LabelDraft = { name: "", colour: "rose", rank: 1, rules: [] }

export default function SensitivityLabelsCard({ http }: { http: LabelHttp }) {
  const { status, run } = useSaveStatus()
  const [catalogue, setCatalogue] = React.useState<LabelCatalogue | null>(null)
  const [state, setState] = React.useState<Load>("loading")
  const [open, setOpen] = React.useState<{ to: "add" } | { to: "change" | "remove"; label: SensitivityLabel } | null>(null)

  const load = React.useCallback(async () => {
    setState("loading")
    try {
      setCatalogue(await loadLabels(http))
      setState("ready")
    } catch {
      setState("failed")
    }
  }, [http])
  React.useEffect(() => {
    void load()
  }, [load])

  // A label added, changed or removed: the list is read again, and the tick beside its heading says it saved. An add or a
  // change is offered back on the toast (design-14's Undo): the new label taken off, or the label's last values put back,
  // then the list read again. A remove was asked first and has no way back on the server, so it offers none.
  const done = (what?: string, back?: () => Promise<unknown>) => {
    setOpen(null)
    const offer = what && back ? { what, undo: async () => { await back(); await load() } } : undefined
    void run(load, offer)
  }
  const labels = byLevel(catalogue?.labels)

  return (
    <SettingsSection
      id="security-labels"
      title="Sensitivity labels"
      description="Labels a board or a doc can carry. Their rules hold on the server, for everyone. Anyone who can edit a board or a doc labels it; only its owner or an admin lowers or takes off its label."
    >
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Labels</h3>
            <SavedTick status={status} />
          </div>
          <Button type="button" variant="outline" size="sm" className={sectionActionClass} disabled={state !== "ready"} onClick={() => setOpen({ to: "add" })}>
            <Plus className="h-4 w-4" aria-hidden />
            Add a label
          </Button>
        </div>
        {state === "loading" && (
          <SettingsCard aria-label="Loading the labels">
            <SettingsRowsSkeleton rows={2} control="button" />
          </SettingsCard>
        )}
        {state === "failed" && <SettingsCardError what="the labels" onRetry={() => void load()} />}
        {state === "ready" && labels.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            headingLevel={4}
            title="No labels yet"
            description="Add one, such as Confidential with no guest links and no exports. People who can edit a board or a doc then put it on."
          />
        )}
        {state === "ready" && labels.length > 0 && (
          <SettingsCard>
            <ul aria-label="Sensitivity labels" className="divide-y divide-border">
              {labels.map((l) => (
                <LabelRow key={l.id} label={l} rules={catalogue?.rules} onOpen={(to) => setOpen({ to, label: l })} />
              ))}
            </ul>
          </SettingsCard>
        )}
      </div>
      {open?.to === "add" && catalogue && <LabelDialog http={http} catalogue={catalogue} onClose={() => setOpen(null)} onDone={done} />}
      {open?.to === "change" && catalogue && <LabelDialog http={http} catalogue={catalogue} label={open.label} onClose={() => setOpen(null)} onDone={done} />}
      {open?.to === "remove" && <RemoveDialog http={http} label={open.label} onClose={() => setOpen(null)} onDone={done} />}
    </SettingsSection>
  )
}

function LabelRow({ label, rules, onOpen }: { label: SensitivityLabel; rules?: LabelCatalogue["rules"]; onOpen: (to: "change" | "remove") => void }) {
  const hue = campHueOf(label.colour)
  return (
    <li aria-label={label.name} data-label-row={label.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <span className="flex size-3 shrink-0 items-center justify-center">{hue ? <HueDot hue={hue} /> : null}</span>
          <span className="[overflow-wrap:anywhere]">{label.name}</span>
        </p>
        <p className="pl-5 text-sm text-ink-2">
          {ruleLine(label.rules, rules)} · Level {label.rank}
        </p>
      </div>
      <div className="flex gap-2 pl-5 sm:pl-0">
        <Button type="button" variant="outline" size="sm" className={sectionActionClass} aria-label={`Change ${label.name}`} onClick={() => onOpen("change")}>
          Change
        </Button>
        <Button type="button" variant="destructive" size="sm" className={sectionActionClass} aria-label={`Remove ${label.name}`} onClick={() => onOpen("remove")}>
          Remove
        </Button>
      </div>
    </li>
  )
}

/** A label's values as a draft: the form's start when it changes, and what Undo puts back. */
const draftOf = (l: SensitivityLabel): LabelDraft => ({ name: l.name, colour: l.colour, rank: l.rank, rules: l.rules ?? [] })

function LabelDialog({ http, catalogue, label, onClose, onDone }: { http: LabelHttp; catalogue: LabelCatalogue; label?: SensitivityLabel; onClose: () => void; onDone: (what: string, back: () => Promise<unknown>) => void }) {
  const [draft, setDraft] = React.useState<LabelDraft>(label ? draftOf(label) : FRESH)
  const [level, setLevel] = React.useState(String(draft.rank))
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const set = (patch: Partial<LabelDraft>) => (setDraft((d) => ({ ...d, ...patch })), setError(""))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const d = { ...draft, rank: level.trim() === "" ? NaN : Number(level) }
    const problem = draftProblem(d, catalogue.labels, label?.id)
    if (problem) return setError(problem)
    setSaving(true)
    try {
      const saved = await (label ? changeLabel(http, label.id, d) : defineLabel(http, d))
      onDone(`${saved.name}: ${label ? "changed" : "added"}`, label ? () => changeLabel(http, label.id, draftOf(label)) : () => removeLabel(http, saved.id))
    } catch (err) {
      setError(apiErrorMessage(err, label ? "The label didn't change. Try again." : "The label wasn't added. Try again."))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form onSubmit={(e) => void submit(e)} className="contents" data-label-form="">
          <DialogHeader>
            <DialogTitle>{label ? `Change ${label.name}` : "Add a label"}</DialogTitle>
            <DialogDescription>
              {label ? "Every board and doc that carries it follows the change at once." : "People who can edit a board or a doc put it on. Its rules then hold there for everyone."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="label-name">Name</Label>
              <div className="flex items-center gap-2">
                <ColorPicker value={draft.colour} onChange={(colour) => set({ colour })} label={draft.name.trim() || "the label"} />
                <Input id="label-name" value={draft.name} maxLength={60} autoComplete="off" placeholder="Confidential" onChange={(e) => set({ name: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="label-level">Level</Label>
              <Input
                id="label-level"
                inputMode="numeric"
                value={level}
                className="w-24"
                aria-describedby="label-level-help"
                onChange={(e) => (setLevel(e.target.value.replace(/[^0-9]/g, "").slice(0, 3)), setError(""))}
              />
              <p id="label-level-help" className="text-meta text-ink-3">
                From 0 to 100. Moving an item to a lower level, or to a label with fewer rules, is for its owner or an admin.
              </p>
            </div>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium text-foreground">Rules</legend>
              {catalogue.rules.map((r) => {
                const on = draft.rules.includes(r.key)
                const id = `label-rule-${r.key}`
                return (
                  <div key={r.key} className="flex min-h-11 items-center justify-between gap-3">
                    <Label htmlFor={id} className="font-normal">
                      {r.name}
                    </Label>
                    <Switch id={id} checked={on} onCheckedChange={(next) => set({ rules: next ? [...draft.rules, r.key] : draft.rules.filter((k) => k !== r.key) })} />
                  </div>
                )
              })}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-danger-ink">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={saving}>
              {label ? "Save the label" : "Add the label"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveDialog({ http, label, onClose, onDone }: { http: LabelHttp; label: SensitivityLabel; onClose: () => void; onDone: () => void }) {
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const remove = async () => {
    setSaving(true)
    try {
      await removeLabel(http, label.id)
      onDone()
    } catch (e) {
      setError(apiErrorMessage(e, "The label wasn't removed. Try again."))
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Remove {label.name}?</DialogTitle>
          <DialogDescription>Its rules stop holding on every board and doc that carries it. The audit log keeps who removed it.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="px-6 pb-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" busy={saving} onClick={() => void remove()}>
            Remove the label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
