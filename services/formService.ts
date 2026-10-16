// Intake forms, public side: anyone with the link reads a form and sends
// answers. Plain fetch, so the signed-in axios instance is never involved.

import type { FormField } from "@/lib/forms/forms"

import { publicCall } from "@/services/publicApi"
import { numberSigns } from "@/lib/format/number"

export interface PublicForm {
  title: string
  description: string
  fields: FormField[]
}

export const getForm = (token: string) => publicCall<PublicForm>(`/public/form/${encodeURIComponent(token)}`)

/** Sends the answers as typed, with how the sender writes numbers ({decimal, group}, as the tables' requests send them), which the server reads number answers in. */
export const sendForm = (token: string, answers: Record<string, unknown>, website: string) =>
  publicCall<unknown>(`/public/form/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ answers, website, ...numberSigns() }) })
