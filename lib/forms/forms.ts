/** Intake forms on the client: question types and a blank question. Pure. */

export type FieldType = "short_text" | "long_text" | "email" | "number" | "date" | "select" | "checkbox"

export interface FormField {
  id: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

export interface ProjectForm {
  id?: string
  token?: string
  title: string
  description: string
  fields: FormField[]
  title_field: string
  priority: "low" | "medium" | "high"
  active: boolean
  submissions?: number
}

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice" },
  { value: "checkbox", label: "Checkbox" },
]

/** A question id no other question in the form has. */
export function newFieldId(fields: FormField[]): string {
  let n = fields.length + 1
  while (fields.some((f) => f.id === `q${n}`)) n++
  return `q${n}`
}

export const blankForm = (): ProjectForm => ({
  title: "",
  description: "",
  fields: [
    { id: "q1", label: "What do you need?", type: "short_text", required: true },
    { id: "q2", label: "Your email", type: "email", required: true },
    { id: "q3", label: "Details", type: "long_text", required: false },
  ],
  title_field: "q1",
  priority: "medium",
  active: true,
})

/** Moves a question up or down; out of range leaves the list as it is. */
export function moveField(fields: FormField[], index: number, by: -1 | 1): FormField[] {
  const to = index + by
  if (to < 0 || to >= fields.length) return fields
  const next = [...fields]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export const formUrl = (token: string) => (typeof window === "undefined" ? `/f/${token}` : `${window.location.origin}/f/${token}`)
