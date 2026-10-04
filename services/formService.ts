// Intake forms, public side: anyone with the link reads a form and sends
// answers. Plain fetch, so the signed-in axios instance is never involved.

import type { FormField } from "@/lib/forms/forms"

import { publicCall } from "@/services/publicApi"

export interface PublicForm {
  title: string
  description: string
  fields: FormField[]
}

export const getForm = (token: string) => publicCall<PublicForm>(`/public/form/${encodeURIComponent(token)}`)

export const sendForm = (token: string, answers: Record<string, unknown>, website: string) =>
  publicCall<unknown>(`/public/form/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ answers, website }) })
