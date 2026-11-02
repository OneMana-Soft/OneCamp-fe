"use client"

// The workspace's own project statuses and labels (linear-15), kept by its admins under Settings > Permissions,
// beside who changes tasks. Each status sits in one of the five categories (planned, in progress, paused, done,
// cancelled) and keeps it, so a project in "Beta" still counts as in progress to filters, the overview and reports.
// An admin adds, renames, recolours, reorders (within its category) and deletes them, and the same for labels; a
// delete offers Undo. Refusals come back in the server's words, under the row they're about.
//
// The page reads and changes the registry (usePlanRegistryEdits) and hands it in with its client, so this lazy card holds no
// request code of its own (main's chunking rule, 30 Oct): Undo's restore goes on the page's client.

import { useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ProjectStatusGlyph } from "@/components/ui/graphics/projectStatusGlyph"
import { Input } from "@/components/ui/input"
import { ColorPicker } from "@/components/ui/paletteColorPicker"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import type { PlanRegistryEdits } from "@/hooks/usePlanRegistryEdits"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "@/lib/icons"
import { fieldKeyDown } from "@/lib/keys/ime"
import { STORED_NAME, statusHueOf } from "@/lib/taskStatus"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { PLAN_CATEGORIES, nextLabelColor, type PlanLabel } from "@/lib/work/projectPlan"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"

type Http = Parameters<typeof restore>[0]
type What = "status" | "label"

/** An icon button: a full tap target on a phone, the row's height on a computer. */
// How many statuses of its own and live labels the workspace holds (the server's MostStatuses and MostLabels). Only
// this card holds Add at them, so they live here, off the plan module every project page reaches.
const MOST_PLAN_STATUSES = 50
const MOST_WORKSPACE_LABELS = 300
const TAP = "h-11 w-11 shrink-0 md:h-8 md:w-8"
const NAME_MOST = 40
const tidy = (name: string) => name.trim().replace(/\s+/g, " ")
const capWords = (n: number, what: string) => `The workspace has ${n} ${what}, as many as it may. Delete one first.`

/** One status or label: its colour, its name (Enter or leaving the field saves, Escape puts it back), its tools. */
function PlanRow({ item, what, glyph, tools, onSave, onDelete }: {
  item: PlanLabel
  what: What
  glyph?: ReactNode
  tools?: ReactNode
  onSave: (change: { name?: string; color?: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [name, setName] = useState(item.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Enter saves and then leaves the field, which would save again: the name in flight is sent once.
  const sending = useRef<string | null>(null)
  const act = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(apiErrorMessage(e, fallback))
      setName(item.name)
    } finally {
      sending.current = null
      setBusy(false)
    }
  }
  const rename = () => {
    const next = tidy(name)
    if (!next || next === item.name) return setName(item.name)
    if (next === sending.current) return
    sending.current = next
    void act(() => onSave({ name: next }), `“${item.name}” couldn't be renamed. Try again.`)
  }
  return (
    <li aria-label={item.name} className="md:ml-6">
      <div className="flex items-center gap-1">
        {glyph && <span className="hidden size-6 shrink-0 items-center justify-center md:flex">{glyph}</span>}
        <ColorPicker
          value={item.color}
          disabled={busy}
          label={item.name}
          onChange={(color) => color !== item.color && void act(() => onSave({ color }), `“${item.name}” couldn't be recoloured. Try again.`)}
        />
        <Input
          dense
          value={name}
          maxLength={NAME_MOST}
          aria-label={what === "status" ? "Status name" : "Label name"}
          data-escape-own={name !== item.name ? "" : undefined}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter") {
              rename()
              e.currentTarget.blur()
            }
            if (e.key === "Escape") setName(item.name)
          })}
          className="h-11 min-w-0 flex-1 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input md:h-8"
        />
        {tools}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(TAP, "text-muted-foreground hover:text-danger-ink")}
          aria-label={`Delete ${item.name}`}
          disabled={busy}
          onClick={() => void act(onDelete, `“${item.name}” couldn't be deleted. Try again.`)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-2 pt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </li>
  )
}

/** A new status or label: name and colour; Enter adds and keeps the row for the next, Escape or Cancel closes it. */
function AddRow({ what, start, glyph, onAdd, onClose }: {
  what: What
  start: string
  glyph?: (color: string) => ReactNode
  onAdd: (name: string, color: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(start)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const next = tidy(name)
    if (!next || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(next, color)
      setName("")
    } catch (e) {
      setError(apiErrorMessage(e, `That ${what} couldn't be added. Try again.`))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="md:ml-6">
      <div className="flex items-center gap-1">
        {glyph && <span className="hidden size-6 shrink-0 items-center justify-center md:flex">{glyph(color)}</span>}
        <ColorPicker value={color} disabled={busy} label={`the new ${what}`} onChange={setColor} />
        <Input
          dense
          autoFocus
          value={name}
          maxLength={NAME_MOST}
          aria-label={`New ${what} name`}
          data-escape-own=""
          placeholder={what === "status" ? "Name, e.g. In review" : "Name, e.g. Revenue"}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void add()
            }
            if (e.key === "Escape") onClose()
          })}
          className="h-11 min-w-0 flex-1 md:h-8"
        />
        <Button type="button" size="sm" className="h-11 md:h-8" disabled={!tidy(name)} busy={busy} onClick={() => void add()}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-11 md:h-8" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-2 pt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

export default function ProjectPlanCard({ plan, http }: { plan: PlanRegistryEdits; http: Http }) {
  const { registry, failed } = plan
  const [adding, setAdding] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ category: string; error: string | null } | null>(null)
  const readAgain = async () => plan.retry()
  const statuses = registry?.statuses ?? []
  const labels = registry?.labels ?? []
  const statusesFull = statuses.length >= MOST_PLAN_STATUSES
  const labelsFull = labels.length >= MOST_WORKSPACE_LABELS

  const waiting = (what: string) =>
    failed ? (
      <SettingsCard>
        <SettingsCardError what={`the project ${what}`} onRetry={() => plan.retry()} />
      </SettingsCard>
    ) : (
      <SettingsCard aria-label={`Loading the project ${what}`}>
        <SettingsRowsSkeleton rows={3} control="field" />
      </SettingsCard>
    )

  const move = async (category: string, ids: string[], from: number, to: number) => {
    const next = [...ids]
    ;[next[from], next[to]] = [next[to], next[from]]
    setMoving({ category, error: null })
    try {
      await plan.order(next)
      setMoving(null)
    } catch (e) {
      setMoving({ category, error: apiErrorMessage(e, "The statuses couldn't be moved. Try again.") })
    }
  }

  return (
    <>
      <SettingsSection
        id="projects-statuses"
        title="Project statuses"
        description="The steps a project moves through. Each counts as one of five categories, so a project in “Beta” is still In progress to filters, the overview and reports."
      >
        {!registry ? (
          waiting("statuses")
        ) : (
          <SettingsCard>
            {PLAN_CATEGORIES.map((c) => {
              const mine = statuses.filter((s) => s.category === c.key).sort((a, b) => a.position - b.position)
              const ids = mine.map((s) => s.id)
              const start = STORED_NAME[statusHueOf(registry.categories.find((k) => k.key === c.key)?.color)]
              const busy = moving?.category === c.key && !moving.error
              return (
                <div key={c.key} role="group" aria-label={c.name} data-plan-category={c.key} className="set-row space-y-1">
                  <div className="flex items-center gap-2 text-ui-sm font-medium text-foreground">
                    <ProjectStatusGlyph status={c.kind} size={14} />
                    {c.name}
                    <span className="text-xs font-normal text-ink-3">built-in</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(TAP, "ml-auto")}
                      aria-label={`Add a status to ${c.name}`}
                      disabled={statusesFull}
                      onClick={() => setAdding(c.key)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <ul role="list" aria-label={`${c.name} statuses`} className="space-y-1">
                    {mine.map((s, i) => (
                      <PlanRow
                        key={`${s.id}:${s.name}`}
                        item={s}
                        what="status"
                        glyph={<ProjectStatusGlyph status={c.kind} hue={statusHueOf(s.color)} size={14} />}
                        onSave={(change) => plan.editStatus(s.id, change)}
                        onDelete={async () => {
                          await plan.deleteStatus(s.id)
                          offerUndo(deletedTitle(s.name, "status"), () => restore(http, "project_status", s.id, readAgain))
                        }}
                        tools={
                          <>
                            <Button type="button" variant="ghost" size="icon" className={TAP} aria-label="Move up" disabled={busy || i === 0} onClick={() => void move(c.key, ids, i, i - 1)}>
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className={TAP} aria-label="Move down" disabled={busy || i === mine.length - 1} onClick={() => void move(c.key, ids, i, i + 1)}>
                              <ChevronDown className="size-4" />
                            </Button>
                          </>
                        }
                      />
                    ))}
                  </ul>
                  {moving?.category === c.key && moving.error && (
                    <p role="alert" className="text-xs text-danger-ink md:ml-6">
                      {moving.error}
                    </p>
                  )}
                  {adding === c.key && !statusesFull && (
                    <AddRow
                      what="status"
                      start={start}
                      glyph={(color) => <ProjectStatusGlyph status={c.kind} hue={statusHueOf(color)} size={14} />}
                      onAdd={(name, color) => plan.addStatus({ name, category: c.key, color })}
                      onClose={() => setAdding(null)}
                    />
                  )}
                </div>
              )
            })}
            {statusesFull && <p className="set-row text-sm text-ink-2">{capWords(MOST_PLAN_STATUSES, "statuses")}</p>}
          </SettingsCard>
        )}
      </SettingsSection>

      <SettingsSection
        id="projects-labels"
        title="Project labels"
        description="Labels any project can carry, up to 20 each. Deleting one takes it off its projects, and Undo puts it back."
        action={
          <Button type="button" variant="outline" size="sm" className={cn(sectionActionClass, "gap-1")} disabled={!registry || labelsFull} onClick={() => setAdding("label")}>
            <Plus className="size-4" />
            Add a label
          </Button>
        }
      >
        {!registry ? (
          waiting("labels")
        ) : (
          <SettingsCard>
            <div className="set-row space-y-1">
              <ul role="list" aria-label="Project labels" className="space-y-1">
                {labels.map((l) => (
                  <PlanRow
                    key={`${l.id}:${l.name}`}
                    item={l}
                    what="label"
                    onSave={(change) => plan.editLabel(l.id, change)}
                    onDelete={async () => {
                      await plan.deleteLabel(l.id)
                      offerUndo(deletedTitle(l.name, "label"), () => restore(http, "project_label", l.id, readAgain))
                    }}
                  />
                ))}
              </ul>
              {labels.length === 0 && adding !== "label" && (
                <p className="text-sm text-ink-2">No labels yet. Add one here, or make one from a project&apos;s Labels picker.</p>
              )}
              {adding === "label" && !labelsFull && (
                <AddRow what="label" start={nextLabelColor(labels.length)} onAdd={(name, color) => plan.addLabel({ name, color })} onClose={() => setAdding(null)} />
              )}
            </div>
            {labelsFull && <p className="set-row text-sm text-ink-2">{capWords(MOST_WORKSPACE_LABELS, "labels")}</p>}
          </SettingsCard>
        )}
      </SettingsSection>
    </>
  )
}
