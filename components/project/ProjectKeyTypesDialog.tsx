"use client"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { Archive, Check, Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import TaskTypeGlyph, { TYPE_ICONS, type TypeIcon } from "@/components/task/TaskTypeGlyph"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import {
  archiveProjectType,
  createProjectType,
  projectKeyPath,
  projectTypesPath,
  setProjectKey,
  updateProjectType,
  type ProjectKey,
  type ProjectType,
} from "@/lib/work/keysApi"

const KEY_SHAPE = /^[A-Z][A-Z0-9]{1,4}$/

/**
 * A project's key and its types (projects A8K, its admins): the key its
 * tasks read as ("Q4-12"), with the keys it had, which keep finding their
 * tasks; and the types its tasks can have, the six built in and its own.
 */
export function ProjectKeyTypesDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const key = useFetch<{ data: ProjectKey }>(open ? projectKeyPath(projectId) : "", undefined, { revalidateOnFocus: false })
  const types = useFetch<{ data: ProjectType[]; icons: string[] }>(open ? projectTypesPath(projectId) : "", undefined, { revalidateOnFocus: false })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Key and types</DialogTitle>
          <DialogDescription>Every task in this project reads as its key and a number. A key you change keeps its old links working.</DialogDescription>
        </DialogHeader>
        {key.isError ? (
          <ErrorState subject="the project's key" onRetry={() => void key.mutate()} />
        ) : key.data ? (
          <KeyEditor projectId={projectId} current={key.data.data} onSaved={(k) => void key.mutate({ data: k }, { revalidate: false })} />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
        <section aria-label="Types" className="space-y-1.5 border-t border-line pt-4">
          <h3 className="text-ui-sm font-[590] text-foreground">Types</h3>
          {types.isError ? (
            <ErrorState subject="the project's types" onRetry={() => void types.mutate()} />
          ) : types.data ? (
            <TypeList projectId={projectId} types={types.data.data} refresh={() => void types.mutate()} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}

function KeyEditor({ projectId, current, onSaved }: { projectId: string; current: ProjectKey; onSaved: (k: ProjectKey) => void }) {
  const { toast } = useToast()
  const { mutate } = useSWRConfig()
  const [typed, setTyped] = useState(current.key)
  const [saving, setSaving] = useState(false)
  const next = typed.toUpperCase()
  const valid = KEY_SHAPE.test(next)
  const changed = next !== current.key
  const save = async () => {
    if (!valid || !changed) return
    setSaving(true)
    try {
      const k = await setProjectKey(projectId, next)
      onSaved(k)
      setTyped(k.key)
      toast({ title: `Tasks now read as ${k.key}-${Math.max(1, k.next_number - 1)}`, description: `${current.key} links keep working.` })
      // Every list of this project's tasks reads the new keys.
      void mutate((cacheKey) => typeof cacheKey === "string" && cacheKey.includes(projectId))
    } catch (e) {
      toast({ title: "Couldn't change the key", description: apiErrorMessage(e, "The key is as it was."), tone: "error" })
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label htmlFor="project-key" className="text-ui-sm font-[510] text-foreground">
        Key
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="project-key"
          value={typed}
          maxLength={5}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!valid || undefined}
          aria-describedby="project-key-hint"
         
          onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          className="w-28 font-[510] tabular-nums uppercase"
        />
        <Button type="button" onClick={(e) => e.currentTarget.form?.requestSubmit()} variant="secondary" size="sm" disabled={!valid || !changed || saving}>
          {saving ? "Saving…" : "Save key"}
        </Button>
      </div>
      <p id="project-key-hint" className={cn("text-meta", valid ? "text-ink-3" : "text-danger-ink")}>
        {valid ? `The next task is ${next}-${current.next_number}.` : "2 to 5 letters and digits, starting with a letter."}
      </p>
      {current.aliases.length > 0 && (
        <p className="text-meta text-ink-3">
          Links with {current.aliases.join(", ")} still open their tasks.
        </p>
      )}
    </form>
  )
}

function TypeList({ projectId, types, refresh }: { projectId: string; types: ProjectType[]; refresh: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  // Says whether it worked, so a form clears only what was saved.
  const run = async (fn: () => Promise<unknown>, failed: string) => {
    setBusy(true)
    try {
      await fn()
      refresh()
      return true
    } catch (e) {
      toast({ title: failed, description: apiErrorMessage(e, "Nothing changed."), tone: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }
  const builtIn = types.filter((t) => !t.own)
  const own = types.filter((t) => t.own)
  return (
    <div className="space-y-3">
      <ul aria-label="Built in" className="flex flex-wrap gap-1.5">
        {builtIn.map((t) => (
          <li key={t.id} className="chip h-6 gap-1.5 bg-raised text-foreground shadow-e1">
            <TaskTypeGlyph type={t} className="text-ink-2" />
            {t.name}
          </li>
        ))}
      </ul>
      {own.length > 0 ? (
        <ul aria-label="This project's own" className="space-y-1">
          {own.map((t) => (
            <OwnType
              key={t.id}
              type={t}
              busy={busy}
              onSave={(name, icon) => run(() => updateProjectType(projectId, t.id, name, icon), "Couldn't save the type")}
              onArchive={() => run(() => archiveProjectType(projectId, t.id), "Couldn't archive the type")}
            />
          ))}
        </ul>
      ) : (
        <p className="text-meta text-ink-3">No types of its own yet. Add one for the kinds of work this project has.</p>
      )}
      <AddType busy={busy} onAdd={(name, icon) => run(() => createProjectType(projectId, name, icon), "Couldn't add the type")} />
    </div>
  )
}

function IconPicker({ icon, onPick, disabled, label }: { icon: string; onPick: (icon: TypeIcon) => void; disabled?: boolean; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="icon" className="size-8 shrink-0" aria-label={label} disabled={disabled} data-touch-target="">
          <TaskTypeGlyph type={{ icon, name: label }} className="size-4 text-ink-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid w-auto grid-cols-6 gap-0.5 p-1">
        {(Object.keys(TYPE_ICONS) as TypeIcon[]).map((i) => (
          <DropdownMenuItem key={i} onSelect={() => onPick(i)} aria-label={i} className={cn("size-9 justify-center p-0", i === icon && "bg-press")}>
            <TaskTypeGlyph type={{ icon: i, name: i }} className="size-4" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function OwnType({ type, busy, onSave, onArchive }: { type: ProjectType; busy: boolean; onSave: (name: string, icon: string) => void; onArchive: () => void }) {
  const [name, setName] = useState(type.name)
  const [icon, setIcon] = useState(type.icon)
  const changed = name.trim() !== type.name || icon !== type.icon
  return (
    <li className="flex items-center gap-2" data-own-type={type.id}>
      <IconPicker icon={icon} onPick={setIcon} disabled={busy} label={`The icon of ${type.name}`} />
      <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label={`The name of ${type.name}`} className="h-8 flex-1" />
      {changed && (
        <Button type="button" variant="secondary" size="icon" className="size-8" aria-label={`Save ${type.name}`} disabled={busy || !name.trim()} onClick={() => onSave(name, icon)}>
          <Check className="size-4" />
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon" className="size-8 text-ink-3 hover:text-foreground" aria-label={`Archive ${type.name}; its tasks keep it`} title="Archive: its tasks keep it" disabled={busy} onClick={onArchive}>
        <Archive className="size-4" />
      </Button>
    </li>
  )
}

function AddType({ busy, onAdd }: { busy: boolean; onAdd: (name: string, icon: string) => Promise<boolean> }) {
  const [name, setName] = useState("")
  const [icon, setIcon] = useState<TypeIcon>("flag")
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void onAdd(name, icon).then((saved) => saved && setName(""))
      }}
    >
      <IconPicker icon={icon} onPick={setIcon} disabled={busy} label="The new type's icon" />
      <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="A type, such as Spike" aria-label="The new type's name" className="h-8 flex-1" />
      <Button type="button" onClick={(e) => e.currentTarget.form?.requestSubmit()} variant="secondary" size="sm" disabled={busy || !name.trim()} className="gap-1.5">
        <Plus className="size-3.5" />
        Add type
      </Button>
    </form>
  )
}
