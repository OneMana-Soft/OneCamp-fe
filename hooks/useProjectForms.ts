"use client"

import { useMemo } from "react"
import type { AxiosRequestConfig } from "axios"
import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectForm } from "@/lib/forms/forms"
import { columnsOf, type TableFieldLike } from "@/lib/forms/build"

/** A project's forms' address; a form's own is under it (…/forms/<id>, …/forms/<id>/submissions). */
export const projectFormsKey = (projectId: string) => `${ProjectsGet.ProjectForms}/${projectId}/forms`

/** A form as its list sends it: the server has saved it, so it has its id (only an unsaved draft has none). */
export type SavedForm = ProjectForm & { id: string }

const NONE: SavedForm[] = []

/**
 * A project's intake forms (package 9 R4): its admins build them
 * (ProjectFormsDialog), and its rules can run when one is sent
 * (ProjectRulesDialog). Every member may read them. `requestConfig` is the
 * read's own, as useFetch's: a caller that shows its own error state passes
 * OWN_ERRORS.
 */
export function useProjectForms(projectId: string | undefined, requestConfig?: AxiosRequestConfig) {
  return useFormsAt(projectId ? projectFormsKey(projectId) : "", requestConfig)
}

/** A table's own forms' address (tables B5); a form's own is under it, as a project's are. */
export const tableFormsKey = (tableId: string) => `${GetEndpointUrl.GetTable}/${tableId}/forms`

/** The forms at an address: a project's (projectFormsKey) or a table's own (tableFormsKey); "" asks for none. */
export function useFormsAt(url: string, requestConfig?: AxiosRequestConfig) {
  const { data, isLoading, isError, mutate } = useFetch<{ data: { forms: SavedForm[]; can_edit: boolean } }>(url, undefined, {
    revalidateOnFocus: false,
  }, requestConfig)
  return { forms: data?.data?.forms ?? NONE, loaded: !!data, isLoading, isError, refresh: mutate }
}

/** A table a form can add rows to: one its maker can open. */
export interface FormTable {
  id: string
  name: string
}

const NO_TABLES: FormTable[] = []

/** The tables a form can add rows to (GET /tables), asked for only when wanted (package 9 R4b). */
export function useFormTables(wanted: boolean) {
  const { data, isLoading } = useFetch<{ data: FormTable[] }>(wanted ? GetEndpointUrl.GetTables : "", undefined, { revalidateOnFocus: false })
  return { tables: data?.data ?? NO_TABLES, loading: wanted && isLoading }
}

/** A table's columns as a form fills them (GET /tables/{id}/fields): the stored ones, with their options and what every row needs. */
export function useTableColumns(tableId: string | null | undefined) {
  const { data, isLoading } = useFetch<{ data: TableFieldLike[] }>(tableId ? `${GetEndpointUrl.GetTable}/${tableId}/fields` : "", undefined, { revalidateOnFocus: false })
  const columns = useMemo(() => (data?.data ? columnsOf(data.data) : undefined), [data])
  return { columns, loading: !!tableId && isLoading }
}
