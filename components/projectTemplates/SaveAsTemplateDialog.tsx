"use client"

// Save a project as a template, for anyone in the workspace to start a
// project from: its own statuses and its tasks, with dates kept as days from
// its start so they move with the next project. Who's on each task, the
// comments, files and time stay with this project.

import * as React from "react"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { saveProjectAsTemplate } from "@/hooks/useProjectTemplates"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { openUI } from "@/store/slice/uiSlice"
import { TEMPLATE_LIMITS } from "@/lib/projectTemplates"


export function SaveAsTemplateDialog({ projectId, projectName, open, onOpenChange }: { projectId: string; projectName?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const dispatch = useDispatch()
  const nameId = React.useId()
  const aboutId = React.useId()
  const [name, setName] = React.useState("")
  const [about, setAbout] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Each time it opens, it starts from the project's name.
  React.useEffect(() => {
    if (open) {
      setName((projectName ?? "").slice(0, TEMPLATE_LIMITS.name))
      setAbout("")
      setError("")
    }
  }, [open, projectName])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const saved = await saveProjectAsTemplate(projectId, { name, description: about })
      onOpenChange(false)
      toast({
        title: `Saved “${saved.name}” as a template`,
        description: "It's under New project, for everyone who creates projects.",
        action: (
          <ToastAction altText="Start a project from it" onClick={() => dispatch(openUI({ key: "createProject", data: { templateId: saved.id } }))}>
            Use it
          </ToastAction>
        ),
      })
    } catch (err) {
      setError(apiErrorMessage(err, "It couldn't be saved just now. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription>
            Keeps this project&apos;s statuses and its tasks, with their descriptions, priorities, tags and subtasks. Dates become days from the start, so they
            move with the next project. Who&apos;s on each task, comments, files and time stay here.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input id={nameId} value={name} maxLength={TEMPLATE_LIMITS.name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={aboutId}>
              When to use it <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id={aboutId} value={about} maxLength={TEMPLATE_LIMITS.about} rows={2} placeholder="A new client on a monthly retainer." onChange={(e) => setAbout(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
