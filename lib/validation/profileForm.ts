// The profile editor's rules, for the desktop dialog and the phone page alike.
//
// One rule for a person's name, the server's and the sign-up page's
// (names.ts, "person"), and one for the @handle. A value already saved is
// accepted as it is: a name a sign-up or an identity provider produced before
// the rule must never stop someone saving their job title. Only what they
// change is checked. The handle is sent only when it changes, so an unchanged
// one is never checked again or taken from them.

import { z } from "zod"
import { handleProblem, nameProblem, normalizeHandle, optionalNameSchema } from "@/lib/validation/names"
import type { UserProfileUpdateInterface } from "@/types/user"

/** What the profile holds now, which the form compares against. */
export interface SavedNames {
  fullName: string
  displayName: string
  handle: string
}

/** A person's name that is accepted unchanged, and otherwise follows the rule. */
const personName = (what: string, saved: string) =>
  z.string().trim().superRefine((value, ctx) => {
    if (value === saved.trim()) return
    const problem = nameProblem("person", what, value)
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
  })

/** The profile form's schema, for what is saved now. */
export function profileFormSchema(saved: SavedNames) {
  return z.object({
    fullName: personName("Full name", saved.fullName),
    displayName: personName("Display name", saved.displayName),
    handle: z.string().superRefine((value, ctx) => {
      const handle = normalizeHandle(value)
      if (handle === normalizeHandle(saved.handle)) return
      const problem = handleProblem(handle)
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
    }),
    jobTitle: optionalNameSchema("label", "Job title").transform((e) => (e === "" ? undefined : e)),
    hobbies: optionalNameSchema("label", "Interests").transform((e) => (e === "" ? undefined : e)),
    language: z.string({ required_error: "Please select a language." }),
    status: z.boolean({}),
  })
}

export type ProfileFormValues = z.infer<ReturnType<typeof profileFormSchema>>

/**
 * The names a save sends: each name as entered (or as saved, when left empty),
 * and the handle only when it changed.
 */
export function profileNamesPayload(
  values: Pick<ProfileFormValues, "fullName" | "displayName" | "handle">,
  saved: SavedNames,
): Pick<UserProfileUpdateInterface, "user_name" | "user_full_name" | "user_handle"> {
  const out: Pick<UserProfileUpdateInterface, "user_name" | "user_full_name" | "user_handle"> = {
    user_name: values.displayName?.trim() || saved.displayName,
    user_full_name: values.fullName?.trim() || saved.fullName,
  }
  const handle = normalizeHandle(values.handle ?? "")
  if (handle && handle !== normalizeHandle(saved.handle)) out.user_handle = handle
  return out
}

/**
 * The three name fields, in the order the editor shows them, with the line
 * under each that says what it is for. The display name is the one people
 * see (lib/personName); the full name stands in when it is empty.
 */
export const PROFILE_NAME_FIELDS = [
  { name: "displayName", label: "Display name", help: "Shown on your messages." },
  { name: "fullName", label: "Full name", help: "Your whole name, on your profile. Shown when you have no display name." },
  { name: "handle", label: "Handle", help: "How people @mention you." },
] as const satisfies ReadonlyArray<{ name: keyof SavedNames; label: string; help: string }>

/** A name field's label and help line. */
export const profileNameField = (name: keyof SavedNames) => PROFILE_NAME_FIELDS.find((f) => f.name === name)!
