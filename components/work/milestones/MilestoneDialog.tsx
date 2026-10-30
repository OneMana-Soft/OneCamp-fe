"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { DateField } from "@/components/ui/date-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { DESCRIPTION_MOST, NAME_MOST, type Milestone, type MilestoneInput } from "@/lib/work/milestones"

/**
 * A milestone's name, a few words on what it means and its target day (linear-16):
 * a new one, or (milestone) one to change. Saving waits for the server, whose
 * refusal is shown in its words, and closes once it's kept.
 */
export function MilestoneDialog({ milestone, onClose, onSave }: { milestone?: Milestone; onClose: () => void; onSave: (input: MilestoneInput) => Promise<void> }) {
  const id = useId()
  const [name, setName] = useState(milestone?.name ?? "")
  const [description, setDescription] = useState(milestone?.description ?? "")
  const [day, setDay] = useState(milestone?.target_date ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), description: description.trim(), target_date: day || null })
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "The milestone couldn't be saved. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveDialog
      title={milestone ? "Edit milestone" : "New milestone"}
      description="A stage of this project's work, with the tasks that make it up."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} size="sm" busy={saving} disabled={!name.trim()}>
            {milestone ? "Save" : "Add milestone"}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="grid gap-3"
        data-milestone-form=""
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input id={`${id}-name`} value={name} maxLength={NAME_MOST} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-about`}>What it means</Label>
          <Textarea id={`${id}-about`} value={description} maxLength={DESCRIPTION_MOST} rows={3} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-day`}>Target date</Label>
          <DateField id={`${id}-day`} value={day} onChange={setDay} className="w-auto" />
        </div>
        {error && (
          <p role="alert" className="text-meta text-danger-ink">
            {error}
          </p>
        )}
      </form>
    </ResponsiveDialog>
  )
}
