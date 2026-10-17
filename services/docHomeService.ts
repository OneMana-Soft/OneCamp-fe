// The docs home's calls (docs programme B5), for the backend's
// controllers/DocHome: search in docs' bodies, a template into an empty doc,
// a doc saved as a template. Doc templates themselves are the marketplace's
// doc kind (services/marketplaceService.ts), read here in their own shape.
//
// A template's body is never laid into a doc by the browser: the server
// writes it, as it makes the doc (createDoc's template_id) or into an empty
// doc through the live copy (applyTemplate), which refuses a doc that holds
// anything, so two tabs never double it (N37).

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import type { MarketplaceTemplate } from "@/services/marketplaceService"
import type { DocTemplatePayload } from "@/types/docHome"

/** The docs home's endpoints. */
const DocHomeEndpoint = {
  Search: "/doc/search",
  ApplyTemplate: "/doc/applyTemplate",
  SaveAsTemplate: "/doc/saveAsTemplate",
  Templates: "/marketplace/templates",
} as const

/** The fewest letters a search is asked with (the server refuses fewer). */
const SEARCH_MIN_LETTERS = 2

/** One page of a search: what was typed (trimmed), whose docs, from where. */
export function searchKey(q: string, opts: { owner?: string; cursor?: string; limit?: number } = {}): string {
  const p = new URLSearchParams({ q: q.trim() })
  if (opts.owner) p.set("owner", opts.owner)
  if (opts.cursor) p.set("cursor", opts.cursor)
  if (opts.limit) p.set("limit", String(opts.limit))
  return `${DocHomeEndpoint.Search}?${p.toString()}`
}

/** Whether what was typed is enough to search with. Pure. */
export const searchable = (q: string) => [...q.trim()].length >= SEARCH_MIN_LETTERS

/** Every doc template: OneCamp's first, then the workspace's own, newest first. */
export const docTemplatesKey = `${DocHomeEndpoint.Templates}?kind=doc`

/** A doc template's payload, read safely (a template stored badly reads as one with no tile). Pure. */
export function docTemplatePayload(t: Pick<MarketplaceTemplate, "name" | "payload">): DocTemplatePayload {
  try {
    const p = JSON.parse(t.payload || "{}") as Partial<DocTemplatePayload>
    return {
      title: typeof p.title === "string" && p.title ? p.title : t.name,
      body: typeof p.body === "string" ? p.body : undefined,
      preview: typeof p.preview === "string" ? p.preview : undefined,
      builtin: p.builtin === true,
      hue: typeof p.hue === "string" ? p.hue : undefined,
      glyph: typeof p.glyph === "string" ? p.glyph : undefined,
      category: typeof p.category === "string" ? p.category : undefined,
    }
  } catch {
    return { title: t.name, builtin: false }
  }
}

/** The galleries that list doc templates: asked again after one is added or removed. */
function refreshDocTemplates() {
  void appMutate((key: unknown) => typeof key === "string" && key.startsWith(DocHomeEndpoint.Templates))
}

/**
 * Gives an empty doc a template's body, written by the server into the live
 * copy (the editor sees it arrive). Rejects with the server's answer: 409
 * when the doc holds something already, which the caller says in its own way.
 */
export async function applyTemplate(docId: string, templateId: string): Promise<{ persisted: boolean }> {
  const res = await axiosInstance.post(DocHomeEndpoint.ApplyTemplate, { doc_uuid: docId, template_id: templateId }, OWN_ERRORS)
  return (res.data?.data ?? { persisted: false }) as { persisted: boolean }
}

/** Makes a doc a template the team can start from; answers it as lists carry it. */
export async function saveAsTemplate(docId: string, name: string, description?: string): Promise<MarketplaceTemplate> {
  const res = await axiosInstance.post(DocHomeEndpoint.SaveAsTemplate, { doc_uuid: docId, name, description: description || undefined }, OWN_ERRORS)
  refreshDocTemplates()
  return res.data?.data as MarketplaceTemplate
}
