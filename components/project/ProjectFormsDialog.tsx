"use client"

// Intake forms, owner side: Asana's forms. A project's admins build a form,
// share its link, and every answer set arrives as a task in the project.

import * as React from "react"
import axiosInstance from "@/lib/axiosInstance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { serverMessage } from "@/lib/http/serverMessage"
import { GetEndpointUrl } from "@/services/endPoints"
import { FIELD_TYPES, blankForm, formUrl, moveField, newFieldId, type FieldType, type ProjectForm } from "@/lib/forms/forms"

const url = (projectId: string) => `${GetEndpointUrl.ProjectForms}/${projectId}/forms`

/**
 * Focus the dialog itself when it opens. The dialog primitive focuses the
 * first field, which here is the list's first button (Forms) or the period
 * picker (Time): opened from a menu, it lit up with a focus ring before the
 * person had done anything. Tab still starts at the first control.
 */
export function focusDialogItself(event: Event) {
  event.preventDefault()
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true })
}

export function ProjectFormsDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading, mutate } = useFetch<{ data: { forms: ProjectForm[]; can_edit: boolean } }>(open ? url(projectId) : "")
  const [editing, setEditing] = React.useState<ProjectForm | null>(null)
  React.useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto outline-none sm:max-w-xl" onOpenAutoFocus={focusDialogItself}>
        <DialogHeader>
          <DialogTitle>{editing ? (editing.id ? "Edit form" : "New form") : "Forms"}</DialogTitle>
          <DialogDescription>
            Share a form with anyone. Every answer arrives here as a task: requests, bug reports, sign-ups.
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <FormEditor projectId={projectId} form={editing} onBack={() => setEditing(null)} onSaved={async () => { await mutate(); setEditing(null) }} />
        ) : (
          <FormList projectId={projectId} forms={data?.data?.forms ?? []} loading={isLoading} onEdit={setEditing} onChanged={() => void mutate()} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormList({ projectId, forms, loading, onEdit, onChanged }: { projectId: string; forms: ProjectForm[]; loading: boolean; onEdit: (f: ProjectForm) => void; onChanged: () => void }) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Deleting asks first, under the form's row, saying what goes.
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(formUrl(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast({ title: "Couldn't copy", description: formUrl(token) })
    }
  }
  const remove = async (f: ProjectForm) => {
    setBusy(true)
    try {
      await axiosInstance.post(`${url(projectId)}/${f.id}/delete`, {})
      toast({ title: `Deleted “${f.title}”`, description: "Tasks it made stay in the project." })
      setDeleting(null)
      onChanged()
    } catch (e) {
      toast({ title: "Couldn't delete", description: serverMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : forms.length === 0 ? (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">No forms yet. Make one for design requests, bug reports or anything people ask this team for.</p>
      ) : (
        <ul className="grid gap-2">
          {forms.map((f) => (
            <li key={f.id} className="rounded-md border">
              <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => onEdit(f)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline">
                <span className="block truncate text-sm font-medium">
                  {f.title}
                  {!f.active && <span className="ml-2 text-xs font-normal text-muted-foreground">Off</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {f.fields.length} {f.fields.length === 1 ? "question" : "questions"} · {f.submissions ?? 0} {f.submissions === 1 ? "answer" : "answers"}
                </span>
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Copy the link to ${f.title}`} onClick={() => copy(f.token!)}>
                {copied === f.token ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Open ${f.title}`} asChild>
                <a href={formUrl(f.token!)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-danger-ink"
                aria-label={`Delete ${f.title}`}
                aria-expanded={deleting === f.id}
                disabled={busy}
                onClick={() => setDeleting((d) => (d === f.id ? null : (f.id ?? null)))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              </div>
              {deleting === f.id && (
                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2 text-sm" role="group" aria-label={`Delete ${f.title}`}>
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Delete “{f.title}”?</span> Its link stops working for anyone who has it.{" "}
                    {f.submissions
                      ? `The ${f.submissions} ${f.submissions === 1 ? "task" : "tasks"} its answers made stay in the project.`
                      : "Nobody has answered it yet."}{" "}
                    This can&apos;t be undone.
                  </p>
                  <div className="ml-auto flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => remove(f)}>
                      {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Delete form
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button className="justify-self-start gap-1.5" onClick={() => onEdit(blankForm())}>
        <Plus className="h-4 w-4" /> New form
      </Button>
    </div>
  )
}

function FormEditor({ projectId, form, onBack, onSaved }: { projectId: string; form: ProjectForm; onBack: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState<ProjectForm>(form)
  const [busy, setBusy] = React.useState(false)
  const { toast } = useToast()
  const set = <K extends keyof ProjectForm>(k: K, v: ProjectForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const setField = (i: number, patch: Partial<ProjectForm["fields"][number]>) =>
    setF((x) => ({ ...x, fields: x.fields.map((q, j) => (j === i ? { ...q, ...patch } : q)) }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await axiosInstance.post(url(projectId), f)
      const saved = (res.data as { data: ProjectForm }).data
      toast({ title: form.id ? "Saved" : "Form ready", description: formUrl(saved.token!) })
      onSaved()
    } catch (err) {
      toast({ title: "Couldn't save the form", description: serverMessage(err), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="form-title">Title</Label>
        <Input id="form-title" value={f.title} maxLength={120} placeholder="Design requests" onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="form-desc">Intro (optional)</Label>
        <Textarea id="form-desc" value={f.description} maxLength={2000} rows={2} className="resize-none" onChange={(e) => set("description", e.target.value)} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Questions</legend>
        {f.fields.map((q, i) => (
          <div key={q.id} className="grid gap-2 rounded-md border p-3">
            <div className="flex gap-2">
              <Input value={q.label} maxLength={200} aria-label={`Question ${i + 1}`} onChange={(e) => setField(i, { label: e.target.value })} className="h-8" required />
              <Select value={q.type} onValueChange={(v) => setField(i, { type: v as FieldType, options: v === "select" ? q.options ?? ["", ""] : undefined })}>
                <SelectTrigger className="h-8 w-36 shrink-0" aria-label={`Question ${i + 1} type`}><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {q.type === "select" && (
              <Textarea
                aria-label={`Question ${i + 1} choices, one per line`}
                placeholder="One choice per line"
                rows={3}
                className="resize-none text-sm"
                value={(q.options ?? []).join("\n")}
                onChange={(e) => setField(i, { options: e.target.value.split("\n") })}
              />
            )}
            <div className="flex items-center gap-1 text-xs">
              <label className="mr-auto flex items-center gap-2">
                <Switch checked={q.required} onCheckedChange={(v) => setField(i, { required: v })} aria-label={`Question ${i + 1} required`} />
                Required
              </label>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => set("fields", moveField(f.fields, i, -1))}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move question ${i + 1} down`} disabled={i === f.fields.length - 1} onClick={() => set("fields", moveField(f.fields, i, 1))}><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label={`Remove question ${i + 1}`} disabled={f.fields.length === 1} onClick={() => setF((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i), title_field: x.title_field === q.id ? x.fields.find((o) => o.id !== q.id)?.id ?? "" : x.title_field }))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
        {f.fields.length < 20 && (
          <Button type="button" variant="secondary" size="sm" className="justify-self-start gap-1.5" onClick={() => set("fields", [...f.fields, { id: newFieldId(f.fields), label: "", type: "short_text", required: false }])}>
            <Plus className="h-3.5 w-3.5" /> Add a question
          </Button>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Task name comes from</Label>
          <Select value={f.title_field || f.fields[0]?.id} onValueChange={(v) => set("title_field", v)}>
            <SelectTrigger className="h-9" aria-label="Task name comes from"><SelectValue /></SelectTrigger>
            <SelectContent>{f.fields.filter((q) => q.type !== "checkbox").map((q, i) => <SelectItem key={q.id} value={q.id}>{q.label || `Question ${i + 1}`}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Task priority</Label>
          <Select value={f.priority} onValueChange={(v) => set("priority", v as ProjectForm["priority"])}>
            <SelectTrigger className="h-9" aria-label="Task priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <span>
          Taking answers
          <span className="block text-xs text-muted-foreground">Turn off to close the form without deleting it.</span>
        </span>
        <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {form.id ? "Save" : "Create form"}
        </Button>
      </div>
    </form>
  )
}
