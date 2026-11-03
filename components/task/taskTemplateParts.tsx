"use client"

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import TaskTypeGlyph from "@/components/task/TaskTypeGlyph"
import { AnswerInput, taskFieldAnswer } from "@/components/forms/AnswerInput"
import { LeftOff, TemplateButton, TypeButton } from "@/components/task/taskTemplateChips"
import { useFetch } from "@/hooks/useFetch"
import { useProjectFields } from "@/hooks/useProjectFields"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { FieldValue, TaskField } from "@/lib/tasks/fields"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { projectTypesPath, type ProjectType } from "@/lib/work/keysApi"
import { askLabel, askedField, defaultFor, groupTemplates, prefillOf, typedOf, type FormValues, type Prefill, type TaskTemplate, type TemplateSummary } from "@/lib/work/taskTemplates"
import { getTaskTemplate, makeFromTemplate, type Made } from "@/lib/work/taskTemplatesApi"

export { setTaskType } from "@/lib/work/keysApi"
export { unfilled } from "@/lib/work/taskTemplates"
// An AI teammate on the Assignee chip: a template's preset brings one who isn't among the project's people, so the
// code comes with the template. Its own light module, which the template manager draws its rows with too.
export { AgentWho } from "@/components/task/agentWho"

/**
 * New task's template pieces (linear-09), a chunk of their own (fetched by
 * components/task/taskTemplateChips): the Template and Type pickers on the
 * shared combobox, what a template asks for and brings, and the calls. The
 * form owns the state.
 */

interface Chip {
  /** The form's chip look. */
  chip: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface TemplateChipProps extends Chip {
  list: TemplateSummary[]
  chosen: Pick<TemplateSummary, "id" | "name"> | null
  onPick: (id: string | null) => void
}

/** The Template chip (key T): the project's own templates, then the workspace's; "No template" once one is chosen. */
export function TemplateChip({ chip, list, chosen, open, onOpenChange, onPick }: TemplateChipProps) {
  const { project, workspace } = groupTemplates(list)
  const row = (t: TemplateSummary) => (
    <ComboboxItem key={t.id} value={t.id} keywords={[t.name]} checked={t.id === chosen?.id} onSelect={() => onPick(t.id)}>
      <span className="truncate">{t.name}</span>
    </ComboboxItem>
  )
  return (
    <Combobox open={open} onOpenChange={onOpenChange}>
      <ComboboxTrigger asChild>
        <TemplateButton chip={chip} name={chosen?.name} />
      </ComboboxTrigger>
      <ComboboxContent label="Template" portalled={false}>
        <ComboboxInput placeholder="Find a template…" />
        <ComboboxList>
          <ComboboxEmpty>No template by that name.</ComboboxEmpty>
          {project.length > 0 && <ComboboxGroup heading="This project">{project.map(row)}</ComboboxGroup>}
          {workspace.length > 0 && <ComboboxGroup heading="Workspace">{workspace.map(row)}</ComboboxGroup>}
          {chosen && (
            <ComboboxGroup>
              <ComboboxItem value="none" keywords={["No template"]} className="text-ink-3" onSelect={() => onPick(null)}>
                No template
              </ComboboxItem>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export interface TypeChipProps extends Chip {
  projectId: string
  /** The type picked; none is the project's Task. */
  type: ProjectType | undefined
  onPick: (type: ProjectType) => void
}

/** The Type chip: the project's types (asked for as it opens, as on the task page), the built-in ones first; Task has no glyph. */
export function TypeChip({ chip, projectId, type, open, onOpenChange, onPick }: TypeChipProps) {
  const types = useFetch<{ data: ProjectType[] }>(open ? projectTypesPath(projectId) : "", undefined, { revalidateOnFocus: false }, OWN_ERRORS).data?.data
  const current = type?.id ?? types?.find((t) => t.builtin === "task")?.id
  return (
    <Combobox open={open} onOpenChange={onOpenChange}>
      <ComboboxTrigger asChild>
        <TypeButton chip={chip} taskType={type}>
          {type && type.builtin !== "task" && (
            <span aria-hidden className="inline-flex">
              <TaskTypeGlyph type={type} className="text-ink-2" />
            </span>
          )}
        </TypeButton>
      </ComboboxTrigger>
      <ComboboxContent label="Type" portalled={false}>
        <ComboboxList>
          <ComboboxEmpty>{types ? "This project has no types." : "Loading types…"}</ComboboxEmpty>
          {(types ?? []).map((t) => (
            <ComboboxItem key={t.id} value={t.id} keywords={[t.name]} checked={t.id === current} onSelect={() => onPick(t)}>
              <span aria-hidden className="inline-flex">
                <TaskTypeGlyph type={t} className="text-ink-2" />
              </span>
              <span className="truncate">{t.name}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** What comes with the template that the form doesn't show: its sub-tasks. */
export function TemplateNote({ template }: { template: TaskTemplate | null }) {
  const n = template?.shape.subtasks?.length ?? 0
  if (!n) return null
  return <p className="px-4 pb-1 text-meta text-ink-3">{n === 1 ? "1 sub-task comes with it" : `${n} sub-tasks come with it`}</p>
}

/** The answer to a field a template asks for, as its box holds it, with the field it answers. */
export interface FieldAnswer {
  field: TaskField
  value: unknown
}

/**
 * What the template asks for and the form still lacks, in words, and what the
 * project couldn't take of it. One of the form's own properties opens its
 * chip; a field gets its own box here, of its own kind (the shared answer box
 * R4's forms draw: components/forms/AnswerInput), named as the project names
 * it. Why a make failed is the form's to say.
 */
export function TemplateAsks({ projectId, asks, answers, members, leftOff, onAnswer, onAsk }: {
  projectId: string | undefined
  asks: string[]
  answers: Record<string, FieldAnswer>
  /** The project's people, for a person a template asks for. */
  members: readonly { user_uuid: string; user_name?: string }[] | undefined
  leftOff: readonly string[]
  onAnswer: (answer: FieldAnswer) => void
  onAsk: (prop: string) => void
}) {
  const { fields } = useProjectFields(asks.some((a) => askedField(a) !== null) ? projectId : undefined)
  return (
    <div className="grid gap-2 px-4 pb-2" role="alert">
      {asks.length > 0 && <p className="text-ui-sm font-[510] text-foreground">This template asks for {asks.map((a) => askLabel(a, fields)).join(", ")}.</p>}
      {asks.map((a) => {
        const id = askedField(a)
        if (id === null) {
          return (
            <button key={a} type="button" className="justify-self-start text-ui-sm font-[510] text-accent-ink underline-offset-2 hover:underline" onClick={() => onAsk(a)}>
              Add {askLabel(a, fields).toLowerCase()}
            </button>
          )
        }
        const field = fields.find((f) => f.id === id)
        if (!field) return null
        const box = `template-ask-${id}`
        const input = (
          <AnswerInput id={box} value={answers[id]?.value} onChange={(value) => onAnswer({ field, value })} labelledBy={`${box}-label`} className="h-8" {...taskFieldAnswer(field, members ?? [])} />
        )
        if (field.type === "checkbox") {
          return (
            <label key={a} htmlFor={box} className="flex items-center gap-2 text-ui-sm font-[510] text-ink-2">
              {input}
              {field.name}
            </label>
          )
        }
        return (
          <div key={a} className="grid gap-1">
            {/* A multi-select's chips are each named by their option: its name names the group, never the first chip. */}
            {field.type === "multi_select" ? (
              <p id={`${box}-label`} className="text-meta font-[510] text-ink-3">
                {field.name}
              </p>
            ) : (
              <label htmlFor={box} id={`${box}-label`} className="text-meta font-[510] text-ink-3">
                {field.name}
              </label>
            )}
            {input}
          </div>
        )
      })}
      <LeftOff lines={leftOff} />
    </div>
  )
}

// Each project's types, asked for once: the Task type a new task is until another is picked, and the one a template
// names. A failed ask is forgotten, so the next one asks again.
const typesOf = new Map<string, Promise<ProjectType[]>>()
const projectTypes = (projectId: string) => {
  let types = typesOf.get(projectId)
  if (!types) {
    types = axiosInstance.get<{ data: ProjectType[] }>(projectTypesPath(projectId), OWN_ERRORS).then((r) => r.data.data ?? [])
    types.catch(() => typesOf.delete(projectId))
    typesOf.set(projectId, types)
  }
  return types
}
const taskTypeOf = (projectId: string) => projectTypes(projectId).then((types) => types.find((t) => t.builtin === "task")?.id)

/** The template a new task of the type (the project's Task while none is picked) starts from, if the project or the workspace names one. */
export async function defaultTemplate(projectId: string, defaults: Record<string, string> | undefined, typeId: string | undefined): Promise<string | undefined> {
  return defaultFor(defaults, typeId ?? (await taskTypeOf(projectId).catch(() => undefined)))
}

/** A template read for New task: it, the form's starting values from it (its days counted from today), and its type
 * as the project has it (none when the project doesn't: make then names why the task is a Task). */
export async function readTemplate(projectId: string, id: string): Promise<{ template: TaskTemplate; prefill: Prefill; type?: ProjectType } | { error: string }> {
  try {
    const template = await getTaskTemplate(projectId, id)
    const wanted = template.shape.type
    const type = wanted ? (await projectTypes(projectId).catch(() => [])).find((t) => t.id === wanted) : undefined
    return { template, prefill: prefillOf(template.shape, new Date()), type }
  } catch (err) {
    return { error: apiErrorMessage(err, "That template couldn't be read. Try again.") }
  }
}

/** The asked fields' values, each read as its field takes it (lib/tasks/fieldInput, code of its own as on the task
 * page), or why one doesn't read. */
async function answered(answers: Record<string, FieldAnswer>): Promise<{ fields: Record<string, FieldValue> } | { error: string }> {
  const fields: Record<string, FieldValue> = {}
  const all = Object.values(answers)
  if (!all.length) return { fields }
  const { readAnswer } = await import("@/lib/tasks/fieldInput")
  for (const { field, value } of all) {
    const read = readAnswer(field, value)
    if ("error" in read) return { error: read.error }
    if (read.value !== null) fields[field.id] = read.value
  }
  return { fields }
}

/**
 * Makes the task through the template, with what the form shows typed over
 * it and the asked fields from their boxes: made (with what the project
 * couldn't take), what it still asks for and what it couldn't take (nothing
 * was made), or why not, in words.
 */
export async function makeThrough(
  projectId: string,
  template: TaskTemplate,
  values: Omit<FormValues, "fields">,
  answers: Record<string, FieldAnswer>,
): Promise<{ made: Made } | { asks: string[]; leftOff: string[] } | { error: string }> {
  const read = await answered(answers)
  if ("error" in read) return read
  try {
    const res = await makeFromTemplate(projectId, template.id, typedOf({ ...values, fields: read.fields }, template.shape))
    return "asks" in res ? { asks: res.asks.missing, leftOff: res.asks.leftOff } : res
  } catch (err) {
    return { error: apiErrorMessage(err, "The task wasn't made. Try again.") }
  }
}
