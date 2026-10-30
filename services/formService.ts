// Intake forms, public side: anyone with the link reads a form and sends
// answers. Plain fetch, so the signed-in axios instance is never involved.

import type { FormField } from "@/lib/forms/forms"

import { backendBase, publicCall } from "@/services/publicApi"
import { numberSigns } from "@/lib/format/number"
import { browserTZ } from "@/lib/utils/timeZone"

export interface PublicForm {
  title: string
  description: string
  fields: FormField[]
  /** The form's own words once it is sent. */
  confirmation?: string
  /** Where the visitor goes once it is sent, in place of the words (tables B5b). */
  redirect?: string
  /** What a file question takes, when the form has one. */
  files?: { max: number; mb: number }
  /** Where its cover and its logo are, on the server, when it has them (tables B5c-2): a logo may be the workspace's. */
  cover?: string
  logo?: string
}

export const getForm = (token: string) => publicCall<PublicForm>(`/public/form/${encodeURIComponent(token)}`)

/** A form's cover or logo where a page draws it: a path the server gave, on its origin; nothing for none. */
export const formPicture = (path?: string) => (path ? `${backendBase}${path}` : undefined)

/**
 * A saved form's own cover or logo, by its link, as its builder shows it: served open or closed. The picture's id
 * rides along, so a replaced one is asked for anew rather than drawn from the copy the browser holds.
 */
export const savedFormPicture = (token: string, kind: "cover" | "logo", id: string) =>
  `${backendBase}/public/form/${encodeURIComponent(token)}/${kind}?v=${encodeURIComponent(id)}`

/**
 * Sends the answers as typed, with how the sender writes numbers ({decimal,
 * group}, as the tables' requests send them), which the server reads number
 * answers in, their zone, where a date that sets the due date is a day, and
 * the claim their files were uploaded under.
 */
export const sendForm = (token: string, answers: Record<string, unknown>, website: string, claim = "") =>
  publicCall<unknown>(`/public/form/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ answers, website, ...numberSigns(), tz: browserTZ(), claim }) })
