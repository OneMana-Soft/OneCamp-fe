import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/**
 * Connecting an outside agent (Claude, Cowork, ChatGPT, Grok Bot) by signing
 * in. The client starts the sign-in; the person approves it on
 * /connect/authorize, choosing the agent identity it acts as and what it may
 * do. See business/MCPServer/oauth in the backend.
 */

export interface ConsentAgent {
  id: string
  name: string
  tools: number
}

export interface ConsentView {
  client_name: string
  /** Where the approval is sent back to. The part a client cannot fake. */
  redirect_host: string
  /** What the client asked for; the person may grant less. */
  scopes: string[]
  /** Agents the person sponsors and could connect it as. */
  agents: ConsentAgent[]
  /** An agent made for this client before, so a reconnect reuses it. */
  suggested_agent_id?: string | null
  /** False while an admin has outside agents turned off. */
  surface_enabled: boolean
  is_admin: boolean
  expires_at: string
}

export interface ApproveResult {
  redirect: string
  agent_id: string
  agent_name: string
  created: boolean
}

export async function getConsent(id: string): Promise<ConsentView> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetOAuthRequest}/${id}`)
  return res.data?.data as ConsentView
}

/** agent_id empty makes a new agent named after the client. */
export async function approveConsent(id: string, input: { agent_id: string; scopes: string[] }): Promise<ApproveResult> {
  const res = await axiosInstance.post(`${PostEndpointUrl.AnswerOAuthRequest}/${id}/approve`, input)
  return res.data?.data as ApproveResult
}

export async function denyConsent(id: string): Promise<string> {
  const res = await axiosInstance.post(`${PostEndpointUrl.AnswerOAuthRequest}/${id}/deny`)
  return (res.data?.data?.redirect as string) || ""
}

/** Scopes that change something, as opposed to reading. */
export function isWriteScope(scope: string): boolean {
  return scope.endsWith(":write")
}
