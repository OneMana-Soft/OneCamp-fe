"use client"

/**
 * A project's own task statuses, for its admins: add, rename, recolour,
 * change what they count as, reorder, delete.
 *
 * Each custom status sits under the built-in status it counts as, because that
 * is what it means everywhere else: a task in "QA" is In Review to reminders,
 * overdue counts and reports. Deleting one asks where its tasks go, and
 * defaults to the built-in status it counted as, so nothing is lost.
 */

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useProjectStatuses, type StatusInput } from "@/hooks/useProjectStatuses"
import { BUILT_IN_STATUSES, type CustomTaskStatus, type StatusCategory } from "@/lib/taskStatus"
import { ColorPicker } from "@/components/ui/paletteColorPicker"
import { cn } from "@/lib/utils/helpers/cn"

export function ProjectStatusesDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { project, options, create, update, remove, reorder } = useProjectStatuses(open ? projectId : undefined)
  const customs = useMemo(() => project?.custom ?? [], [project])
  const max = project?.max ?? 20
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await fn()
      if (done) toast({ title: done })
    } catch {
      // The request layer has said what went wrong.
    } finally {
      setBusy(false)
    }
  }

  // Board order: grouped by category, then position. Moving up or down swaps
  // with the neighbour in the same category.
  const ordered = useMemo(
    () => options.filter((o) => o.custom).map((o) => customs.find((c) => c.id === o.value)!).filter(Boolean),
    [options, customs],
  )
  const move = (c: CustomTaskStatus, dir: -1 | 1) => {
    const same = ordered.filter((x) => x.category === c.category)
    const i = same.findIndex((x) => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= same.length) return
    const ids = ordered.map((x) => x.id)
    const a = ids.indexOf(same[i].id)
    const b = ids.indexOf(same[j].id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    void run(() => reorder(ids))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Statuses</DialogTitle>
          <DialogDescription>
            Add your own steps to this project&apos;s board. Each counts as a built-in status, so a task in &ldquo;QA&rdquo; is still In Review to reminders, overdue counts and reports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {BUILT_IN_STATUSES.map((b) => {
            const mine = ordered.filter((c) => c.category === b.value)
            return (
              <section key={b.value} aria-label={b.label} className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {b.icon && <b.icon className="h-4 w-4 text-muted-foreground" />}
                  {b.label}
                  <span className="text-xs font-normal text-muted-foreground">built-in</span>
                </div>
                {mine.map((c, i) => (
                  <StatusRow
                    key={c.id}
                    status={c}
                    busy={busy}
                    first={i === 0}
                    last={i === mine.length - 1}
                    onMove={(dir) => move(c, dir)}
                    onSave={(input) => run(() => update(c.id, input))}
                    onDelete={(moveTo) => run(() => remove(c.id, moveTo), `Deleted ${c.name}`)}
                    moveTargets={options.filter((o) => o.value !== c.id)}
                  />
                ))}
              </section>
            )
          })}
        </div>

        <AddStatus busy={busy} full={customs.length >= max} max={max} onAdd={(input) => run(() => create(input), `Added ${input.name}`)} />
      </DialogContent>
    </Dialog>
  )
}

function CategorySelect({ value, onChange, disabled }: { value: StatusCategory; onChange: (c: StatusCategory) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusCategory)} disabled={disabled}>
      <SelectTrigger className="h-8 w-[160px] shrink-0 text-xs" aria-label="Counts as">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BUILT_IN_STATUSES.map((b) => (
          <SelectItem key={b.value} value={b.value} className="text-xs">
            Counts as {b.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function StatusRow({
  status,
  busy,
  first,
  last,
  onMove,
  onSave,
  onDelete,
  moveTargets,
}: {
  status: CustomTaskStatus
  busy: boolean
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onSave: (input: StatusInput) => void
  onDelete: (moveTo: string) => void
  moveTargets: { value: string; label: string; custom: boolean }[]
}) {
  const [name, setName] = useState(status.name)
  const [deleting, setDeleting] = useState(false)
  const [moveTo, setMoveTo] = useState<string>(status.category)
  const save = (patch: Partial<StatusInput>) => {
    const next = { name: name.trim(), category: status.category, color: status.color, ...patch }
    if (!next.name) {
      setName(status.name)
      return
    }
    if (next.name === status.name && next.category === status.category && next.color === status.color) return
    onSave(next)
  }

  return (
    <div className="ml-6 rounded-md border border-border/60">
      <div className="flex items-center gap-1 p-1">
        <ColorPicker value={status.color} disabled={busy} onChange={(color) => save({ color })} />
        <Input
          value={name}
          maxLength={40}
          aria-label="Status name"
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save({})}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") setName(status.name)
          }}
          className="h-8 flex-1 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input"
        />
        <CategorySelect value={status.category} disabled={busy} onChange={(category) => save({ category })} />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-7" aria-label="Move up" disabled={busy || first} onClick={() => onMove(-1)}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-7" aria-label="Move down" disabled={busy || last} onClick={() => onMove(1)}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${status.name}`}
          disabled={busy}
          onClick={() => setDeleting((d) => !d)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {deleting && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Its tasks move to</span>
          <Select value={moveTo} onValueChange={setMoveTo}>
            <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Move its tasks to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {moveTargets.map((o) => (
                <SelectItem key={o.value} value={o.value} className={cn("text-xs", o.custom && "pl-6")}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => onDelete(moveTo)}>
              Delete {status.name}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddStatus({ busy, full, max, onAdd }: { busy: boolean; full: boolean; max: number; onAdd: (input: StatusInput) => void }) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<StatusCategory>("inProgress")
  const [color, setColor] = useState("violet")
  const submit = () => {
    const n = name.trim()
    if (!n) return
    onAdd({ name: n, category, color })
    setName("")
  }
  if (full) {
    return <p className="border-t border-border/60 pt-3 text-sm text-muted-foreground">This project has {max} statuses of its own, the most it can have.</p>
  }
  return (
    <form
      className="flex items-center gap-1 border-t border-border/60 pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <ColorPicker value={color} disabled={busy} onChange={setColor} />
      <Input
        value={name}
        maxLength={40}
        placeholder="New status, e.g. QA"
        aria-label="New status name"
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        className="h-8 flex-1"
      />
      <CategorySelect value={category} disabled={busy} onChange={setCategory} />
      <Button type="submit" size="sm" className="h-8 gap-1" disabled={busy || !name.trim()}>
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  )
}
