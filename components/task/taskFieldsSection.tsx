"use client"

// The task panel's custom fields: one row each, in the project's order. The
// project's admins set values, as every task edit, and add or change fields
// from here; others read them. A value saves the moment it's chosen (a
// typed one when its box loses focus) and shows everywhere the task is
// listed straight away, put back if the server refuses it.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProjectFieldsDialog } from "@/components/project/ProjectFieldsDialog"
import { FieldValueView, OptionPill } from "@/components/task/fieldValue"
import { TaskAssigneePicker } from "@/components/task/taskAssigneePicker"
import { useToast } from "@/hooks/use-toast"
import { useProjectFields } from "@/hooks/useProjectFields"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { Check, ExternalLink, Plus } from "@/lib/icons"
import { appMutate } from "@/lib/swrMutate"
import { colorDot } from "@/lib/taskStatus"
import { OUTSIDE_PROJECT, draftOf, formatFieldValue, parseFieldInput, withField, type FieldValue, type FieldValues, type TaskField } from "@/lib/tasks/fields"
import { fieldLabel, fieldRow, inlineInput, inlineSelect, inlineValue } from "@/lib/ui/fieldRow"
import { DateField } from "@/components/task/taskDateField"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileDataInterface } from "@/types/user"

type Save = (field: TaskField, value: FieldValue | null) => Promise<void>

const same = (a: FieldValue | null | undefined, b: FieldValue | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Saving a value: shown at once in the panel and the lists, then as the
 * server stored it, or put back with what went wrong. Each change merges into
 * the task's other values, and only the newest save of a field settles it: an
 * earlier one's answer, or its failure, arriving late changes nothing. */
function useSaveField(taskUUID: string, projectUUID: string, values: FieldValues | undefined, refreshFields: () => void): Save {
  const { toast } = useToast()
  const { optimisticSetTaskField } = useTaskUpdate()
  // What each field holds as shown, to put back if a save fails.
  const latest = React.useRef<FieldValues>(values ?? {})
  React.useEffect(() => {
    latest.current = values ?? {}
  }, [values])
  // The newest save of each field.
  const seq = React.useRef(new Map<string, number>())

  const show = React.useCallback(
    (fieldId: string, value: FieldValue | null) => {
      latest.current = withField(latest.current, fieldId, value)
      void appMutate(
        `${GetEndpointUrl.GetTaskInfo}/${taskUUID}`,
        (current: { data?: { task_fields?: FieldValues } } | undefined) =>
          current?.data ? { ...current, data: { ...current.data, task_fields: withField(current.data.task_fields, fieldId, value) } } : current,
        { revalidate: false },
      )
      optimisticSetTaskField(taskUUID, projectUUID, fieldId, value)
    },
    [taskUUID, projectUUID, optimisticSetTaskField],
  )

  return React.useCallback(
    async (field, value) => {
      const before = latest.current[field.id] ?? null
      if (same(before, value)) return
      const mine = (seq.current.get(field.id) ?? 0) + 1
      seq.current.set(field.id, mine)
      const newest = () => seq.current.get(field.id) === mine
      show(field.id, value)
      try {
        const res = await axiosInstance.post(PostEndpointUrl.SetTaskField, { task_uuid: taskUUID, field_id: field.id, value }, OWN_ERRORS)
        if (newest()) show(field.id, (res.data as { data: { value: FieldValue | null } }).data.value ?? null)
      } catch (err) {
        if (!newest()) return
        show(field.id, before)
        // The field may have changed under the panel (an option taken away).
        refreshFields()
        toast({ variant: "destructive", title: `${field.name} wasn't saved`, description: apiErrorMessage(err, "Try again in a moment.") })
      }
    },
    [taskUUID, show, toast, refreshFields],
  )
}

export function TaskFieldsSection({
  taskUUID,
  projectUUID,
  values,
  canEdit,
  members,
}: {
  taskUUID: string
  projectUUID: string
  values: FieldValues | undefined
  canEdit: boolean
  members: UserProfileDataInterface[]
}) {
  const { fields, isLoading, refresh } = useProjectFields(projectUUID)
  const [managing, setManaging] = React.useState(false)
  const save = useSaveField(taskUUID, projectUUID, values, refresh)
  const dialog = canEdit && <ProjectFieldsDialog projectId={projectUUID} open={managing} onOpenChange={setManaging} />

  if (fields.length === 0) {
    if (!canEdit || isLoading) return null
    return (
      <div className={fieldRow()}>
        <span className={fieldLabel}>Fields</span>
        <Button type="button" variant="ghost" size="sm" className={cn(inlineValue, "justify-self-start text-muted-foreground")} onClick={() => setManaging(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add a field
        </Button>
        {dialog}
      </div>
    )
  }

  return (
    <div data-task-fields="">
      {fields.map((f) => (
        <TaskFieldRow key={f.id} field={f} value={values?.[f.id]} canEdit={canEdit} members={members} onSave={(v) => save(f, v)} />
      ))}
      {canEdit && (
        <div className={fieldRow()}>
          <span aria-hidden />
          <Button type="button" variant="link" size="sm" className="h-7 justify-self-start px-0 text-xs text-muted-foreground" onClick={() => setManaging(true)}>
            Edit fields
          </Button>
        </div>
      )}
      {dialog}
    </div>
  )
}

function TaskFieldRow({
  field,
  value,
  canEdit,
  members,
  onSave,
}: {
  field: TaskField
  value: FieldValue | undefined
  canEdit: boolean
  members: UserProfileDataInterface[]
  onSave: (value: FieldValue | null) => Promise<void>
}) {
  const id = React.useId()
  if (field.type === "person") {
    // Someone the project doesn't list (they left it, or never joined) is
    // still named as such, not shown as nobody.
    const assignee =
      typeof value === "string" ? (members.find((m) => m.user_uuid === value) ?? { user_uuid: value, user_name: OUTSIDE_PROJECT } as UserProfileDataInterface) : undefined
    return (
      <TaskAssigneePicker isAdmin={canEdit} label={field.name} members={members} assignee={assignee} onChange={(user) => void onSave(user?.user_uuid ?? null)} />
    )
  }
  if (field.type === "date") {
    // The same control as the task's Start and Due dates: "8 Oct", and a calendar.
    return (
      <DateField
        isAdmin={canEdit}
        label={field.name}
        value={dayOf(value)}
        onSelect={(d) => void onSave(d ? dayKey(d) : null)}
        onClear={() => void onSave(null)}
      />
    )
  }
  return (
    <div className={fieldRow()}>
      <label htmlFor={id} className={fieldLabel}>
        {field.name}
      </label>
      <div className="min-w-0">
        {!canEdit ? (
          // A value that reads as nothing (an option since taken away) is None.
          formatFieldValue(field, value) ? <FieldValueView field={field} value={value} /> : <span className="text-sm text-muted-foreground">None</span>
        ) : field.type === "select" ? (
          <SelectEditor id={id} field={field} value={value} onSave={onSave} />
        ) : field.type === "multi_select" ? (
          <MultiSelectEditor id={id} field={field} value={value} onSave={onSave} />
        ) : field.type === "checkbox" ? (
          <Checkbox id={id} checked={value === true} onCheckedChange={(c) => void onSave(c === true ? true : null)} aria-label={field.name} />
        ) : (
          <TypedEditor id={id} field={field} value={value} onSave={onSave} />
        )}
      </div>
    </div>
  )
}

type EditorProps = { id: string; field: TaskField; value: FieldValue | undefined; onSave: (value: FieldValue | null) => Promise<void> }

/** A date field's value ("2026-10-14") as a day in the person's calendar, and back. */
function dayOf(value: FieldValue | undefined): Date | undefined {
  if (typeof value !== "string") return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const PLACEHOLDER: Partial<Record<TaskField["type"], string>> = { url: "Add a link…", number: "Add a number…", money: "Add an amount…" }

/** Text, a link, a number or money: typed, saved when the box loses focus;
 * Escape puts the value back. */
function TypedEditor({ id, field, value, onSave }: EditorProps) {
  const { toast } = useToast()
  const shown = draftOf(field, value)
  const [draft, setDraft] = React.useState(shown)
  const [focused, setFocused] = React.useState(false)
  const cancelled = React.useRef(false)
  React.useEffect(() => setDraft(shown), [shown])
  const commit = () => {
    setFocused(false)
    if (cancelled.current) {
      cancelled.current = false
      setDraft(shown)
      return
    }
    const parsed = parseFieldInput(field, draft)
    if ("error" in parsed) {
      toast({ variant: "destructive", title: `${field.name} wasn't changed`, description: parsed.error })
      setDraft(shown)
      return
    }
    void onSave(parsed.value)
  }
  const numeric = field.type === "number" || field.type === "money"
  return (
    <div className="flex items-center">
      {/* The currency beside an amount, not beside "Add an amount…". */}
      {field.type === "money" && field.currency && (draft || focused) && <span className="mr-1 text-xs text-muted-foreground">{field.currency}</span>}
      <Input
        id={id}
        value={draft}
        inputMode={numeric ? "decimal" : field.type === "url" ? "url" : undefined}
        placeholder={PLACEHOLDER[field.type] ?? "Add text…"}
        autoComplete="off"
        spellCheck={field.type === "text"}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            // Handled: the panel this field sits in stays open.
            e.preventDefault()
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
        className={cn(inlineInput, numeric ? "w-40 tabular-nums" : "w-full max-w-xs", field.type === "money" && field.currency && (draft || focused) && "ml-0")}
      />
      {field.type === "url" && typeof value === "string" && (
        <a href={value} target="_blank" rel="noopener noreferrer" aria-label={`Open ${field.name}`} className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}

const NONE = "__none"

function SelectEditor({ id, field, value, onSave }: EditorProps) {
  const chosen = typeof value === "string" ? field.options.find((o) => o.id === value) : undefined
  return (
    <Select value={typeof value === "string" ? value : NONE} onValueChange={(v) => void onSave(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={inlineSelect} aria-label={field.name}>
        <SelectValue>
          {chosen ? (
            <span className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorDot(chosen.color))} aria-hidden />
              {chosen.label}
            </span>
          ) : (
            <span className="text-muted-foreground">Choose…</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-muted-foreground">
          None
        </SelectItem>
        {field.options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorDot(o.color))} aria-hidden />
              {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Any of a field's options: a list to tick, each tick saved as it's made. */
function MultiSelectEditor({ id, field, value, onSave }: EditorProps) {
  const [open, setOpen] = React.useState(false)
  const chosen = Array.isArray(value) ? value : []
  const toggle = (optionId: string) => {
    const next = chosen.includes(optionId) ? chosen.filter((x) => x !== optionId) : [...chosen, optionId]
    void onSave(next.length ? next : null)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="ghost" role="combobox" aria-expanded={open} aria-label={field.name} className={cn(inlineValue, "h-auto min-h-8")}>
          {chosen.length ? (
            <FieldValueView field={field} value={chosen} />
          ) : (
            <span className="text-sm font-normal text-muted-foreground">Choose…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Find in ${field.name}…`} />
          <CommandList>
            <CommandEmpty>No option by that name.</CommandEmpty>
            <CommandGroup>
              {field.options.map((o) => (
                <CommandItem key={o.id} value={o.label} onSelect={() => toggle(o.id)}>
                  <Check className={cn("mr-2 h-4 w-4", chosen.includes(o.id) ? "opacity-100" : "opacity-0")} aria-hidden />
                  <OptionPill label={o.label} color={o.color} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
