import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

// Templates client: shareable templates (agents, workflows, tables). Publish
// something you built, browse, and install a copy. All mutations are POST
// (OneCamp router convention); reads use useFetch in components.

export type TemplateKind = "agent" | "workflow" | "table"

export interface MarketplaceTemplate {
  id: string
  kind: TemplateKind
  name: string
  description?: string | null
  icon?: string | null
  payload: string // raw JSON
  created_by: string
  created_at: string
  updated_at: string
  author_name?: string
}

export interface InstallResult {
  kind: TemplateKind
  entity_id: string
  name: string
}

export async function publishTemplate(input: {
  kind: TemplateKind
  name: string
  description?: string
  icon?: string
  payload: unknown
}): Promise<MarketplaceTemplate> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateMarketplaceTemplate, input)
  return res.data?.data as MarketplaceTemplate
}

export async function deleteTemplate(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteMarketplaceTemplate}/${id}/delete`)
}

export async function installTemplate(id: string): Promise<InstallResult> {
  const res = await axiosInstance.post(`${PostEndpointUrl.InstallMarketplaceTemplate}/${id}/install`)
  return res.data?.data as InstallResult
}

// Where an installed entity lives, for post-install navigation.
export function installedPath(res: InstallResult): string {
  switch (res.kind) {
    case "table":
      return `/app/tables/${res.entity_id}`
    case "agent":
      return `/app/settings/agents`
    case "workflow":
      return `/app/settings/workflows`
    default:
      return "/app/templates"
  }
}
