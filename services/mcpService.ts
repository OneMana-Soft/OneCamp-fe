import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints"

// MCP (Model Context Protocol) server admin client. An MCP server is an
// external endpoint exposing tools; once registered and introspected, its tools
// become available to agents (namespaced by the server's tool_prefix). Mirrors
// agentService conventions: list via useFetch in the card, mutations here.

export type McpAuthType = "none" | "bearer" | "header"

export interface McpServer {
  id: string
  name: string
  description?: string | null
  url: string
  transport: string
  auth_type: McpAuthType
  auth_header_name?: string | null
  has_auth_secret: boolean
  enabled: boolean
  tool_prefix: string
  tools_cache: string // raw JSON array string, exactly as the server reported it
  // tools is the API-enriched tool list: the same tools, each carrying the risk
  // OneCamp enforces (read_only / destructive). Derived server-side from
  // tools_cache on every read, so a classifier change relabels tools with no
  // re-introspection. Prefer this over parsing tools_cache yourself.
  tools?: McpTool[]
  last_introspected_at?: string | null
  last_error?: string | null
  created_at: string
  updated_at: string
}

// McpTool is one tool an MCP server exposes. read_only/destructive are
// OneCamp's OWN enforced classification, resolved host-side — not the external
// server's self-reported annotations (those are never sent to the client).
export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
  // read_only: the agent may run this tool automatically, no approval needed.
  read_only?: boolean
  // destructive: irreversible change; never auto-run, always warned about.
  destructive?: boolean
}

// McpToolRisk is what actually happens when an agent calls the tool.
export type McpToolRisk = "auto" | "approval" | "destructive"

// mcpToolRisk maps a tool's enforced flags to its risk state. Fails closed: a
// tool with no classification (an older payload) is treated as needing
// approval, exactly like the backend's own default.
export function mcpToolRisk(t: McpTool): McpToolRisk {
  if (t.destructive) return "destructive"
  if (t.read_only) return "auto"
  return "approval"
}

export interface McpServerInput {
  name: string
  description?: string
  url: string
  transport?: string
  auth_type: McpAuthType
  auth_header_name?: string
  auth_secret?: string
  enabled: boolean
}

// parseMcpTools returns a server's tools. It uses the API-enriched list (which
// carries the enforced risk flags) when present, and falls back to the raw
// tools_cache blob otherwise — those tools then read as "needs approval", the
// safe default.
export function parseMcpTools(s: McpServer): McpTool[] {
  if (Array.isArray(s.tools)) return s.tools
  try {
    const v = JSON.parse(s.tools_cache || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// The full (namespaced) tool name an agent enables for an MCP tool.
export function mcpToolFullName(s: McpServer, t: McpTool): string {
  return `${s.tool_prefix}${t.name}`
}

// McpCatalogEntry is one vetted connector from the curated catalog. Its fields
// prefill the add-server dialog; the admin supplies the deployed URL + secret.
export interface McpCatalogEntry {
  slug: string
  name: string
  description: string
  category: string
  docs_url: string
  transport: string
  auth_type: McpAuthType
  auth_header_name?: string
  secret_required: boolean
  secret_hint?: string
  url_placeholder?: string
  installed: boolean
}

export async function getMcpCatalog(): Promise<McpCatalogEntry[]> {
  const res = await axiosInstance.get(GetEndpointUrl.GetMcpCatalog)
  return (res.data?.data as McpCatalogEntry[]) || []
}

export async function createMcpServer(input: McpServerInput): Promise<McpServer> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateMcpServer, input)
  return res.data?.data as McpServer
}

export async function updateMcpServer(
  id: string,
  input: McpServerInput,
  updateSecret: boolean,
): Promise<McpServer> {
  const res = await axiosInstance.post(`${PostEndpointUrl.UpdateMcpServer}/${id}/update`, {
    ...input,
    update_secret: updateSecret,
  })
  return res.data?.data as McpServer
}

export async function setMcpServerEnabled(id: string, enabled: boolean): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.SetMcpServerEnabled}/${id}/enabled`, { enabled })
}

export async function deleteMcpServer(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteMcpServer}/${id}/delete`)
}

// testMcpServer introspects the server live and returns its tools. The endpoint
// returns { ok, data?, msg? } so connection failures surface as ok=false rather
// than an HTTP error toast.
export async function testMcpServer(
  id: string,
): Promise<{ ok: boolean; tools?: McpTool[]; msg?: string }> {
  const res = await axiosInstance.post(`${PostEndpointUrl.TestMcpServer}/${id}/test`)
  return { ok: !!res.data?.ok, tools: res.data?.data as McpTool[], msg: res.data?.msg }
}
