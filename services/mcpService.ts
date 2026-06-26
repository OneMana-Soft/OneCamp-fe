import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

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
  tools_cache: string // raw JSON array string
  last_introspected_at?: string | null
  last_error?: string | null
  created_at: string
  updated_at: string
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
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

export function parseMcpTools(s: McpServer): McpTool[] {
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
