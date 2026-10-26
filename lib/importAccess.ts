"use client"

// Old imports' access, re-checked against each import's own tool, for an
// admin to look over (components/admin/ImportAccessCard): the card's read and
// an admin's four choices about one import. Each choice is answered at once
// and done on the server in the background; the read then says how it went.

import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

export const IMPORT_ACCESS_KEY = "/admin/import-access"

/** Where an import, or one of its projects, stands. */
export type ImportAccessState = "rechecking" | "rechecked" | "needs_admin" | "kept" | "contained" | "undone"

/** One of an import's projects, with its re-check's counts; tasks by id only. */
export interface ImportAccessProject {
  project_uuid: string
  name: string
  archived: boolean
  state: ImportAccessState
  restricted: number
  unassigned: number
  already_restricted: number
  opened_since: number
  opened: number
  creator_outside: number
  creator_outside_tasks?: string[]
  assignee_outside: number
  assignee_outside_tasks?: string[]
  comments_hidden: number
  gone_or_hidden: number
  gone_or_hidden_tasks?: string[]
  failed?: string[]
}

/** One old import: its tool and site, who ran it and when, where it stands and why. */
export interface ImportAccess {
  import_id: string
  provider: string
  site: string
  ran_at: string
  ran_by: string
  state: ImportAccessState
  reason?: string
  decided_by?: string
  decided_at?: string
  projects: ImportAccessProject[]
}

export function useImportAccess() {
  return useFetch<{ imports: ImportAccess[] }>(IMPORT_ACCESS_KEY, undefined, undefined, OWN_ERRORS)
}

/**
 * An admin's choice about an import: re-check it with their own connection,
 * undo its re-check, keep its tasks to their projects' admins until it is
 * re-checked, or keep it as it is.
 */
export type ImportAccessChoice = "recheck" | "undo" | "contain" | "keep"

/** Asks for a choice about an import, and answers the server's words for it. */
export async function chooseForImportAccess(importId: string, choice: ImportAccessChoice): Promise<string> {
  const res = await axiosInstance.post<{ msg: string }>(`${IMPORT_ACCESS_KEY}/${encodeURIComponent(importId)}/${choice}`, undefined, OWN_ERRORS)
  return res.data.msg
}
