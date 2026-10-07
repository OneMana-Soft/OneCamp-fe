"use client"

// The templates a project can start from (the built-in ones, then the ones
// this workspace saved) and what can be done with them: save a project as
// one, add one from a file, download one, delete one. Errors carry the
// server's message, written for the person; the caller shows it, so the
// global error toast stays quiet.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { appMutate } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"
import { downloadBlob } from "@/lib/utils/download"
import { templateFile, templateFileName, type ProjectTemplate, type TemplateSummary } from "@/lib/projectTemplates"

const BASE = GetEndpointUrl.ProjectTemplates

// Through the app's cache, so a list shown anywhere, or opened later, sees
// the change.
const refresh = () => appMutate(BASE)

interface SaveInput {
  name: string
  description: string
}

/** Keeps a project as it is now as a template; its dates are counted in the viewer's zone. */
export async function saveProjectAsTemplate(projectId: string, input: SaveInput): Promise<TemplateSummary> {
  const res = await axiosInstance.post(`${GetEndpointUrl.ProjectSaveAsTemplate}/${projectId}/save-as-template`, { ...input, tz: browserTZ() }, OWN_ERRORS)
  await refresh()
  return (res.data as { data: TemplateSummary }).data
}

export async function addTemplate(t: ProjectTemplate): Promise<TemplateSummary> {
  const res = await axiosInstance.post(BASE, t, OWN_ERRORS)
  await refresh()
  return (res.data as { data: TemplateSummary }).data
}

/** Saves a template as a file, to start projects from in another OneCamp. */
export async function downloadTemplate(id: string): Promise<void> {
  const res = await axiosInstance.get(`${BASE}/${encodeURIComponent(id)}`, OWN_ERRORS)
  const t = (res.data as { data: ProjectTemplate }).data
  downloadBlob(templateFile(t), "application/json", templateFileName(t.name))
}

export async function deleteTemplate(id: string): Promise<void> {
  await axiosInstance.post(`${BASE}/${encodeURIComponent(id)}/delete`, {}, OWN_ERRORS)
  await refresh()
}

export function useProjectTemplates() {
  const { data, isLoading, isError } = useFetch<{ data: TemplateSummary[] }>(BASE, undefined, { revalidateOnFocus: false })
  return { templates: data?.data ?? [], isLoading, isError: !!isError }
}
