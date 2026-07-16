// Admin workspace-settings service. All routes are admin-gated server-side.

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

export interface WorkspaceSettings {
    upload_limit_mb: number
    upload_limit_source: "db" | "env" | "default"
    allowed_users: string[]
    allowed_users_source: "db" | "env" | "default"
    has_resend_api_key: boolean
    resend_source: "db" | "env" | "none"
    guest_access_enabled: boolean
}

export interface UpdateSettingsRequest {
    upload_limit_mb?: number
    allowed_users?: string[]
    resend_api_key?: string
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings | null> {
    const res = await axiosInstance.get(GetEndpointUrl.GetWorkspaceSettings)
    return (res.data as { data?: WorkspaceSettings })?.data ?? null
}

export async function updateWorkspaceSettings(req: UpdateSettingsRequest): Promise<WorkspaceSettings | null> {
    const res = await axiosInstance.post(PostEndpointUrl.UpdateWorkspaceSettings, req)
    return (res.data as { data?: WorkspaceSettings })?.data ?? null
}

export interface AuditEntry {
    id: string
    actor_email?: string
    action: string
    category: string
    summary: string
    metadata?: string
    ip_address?: string
    user_agent?: string
    created_at: string
}

export async function getAdminAuditLog(category?: string, limit = 50, offset = 0): Promise<AuditEntry[]> {
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    params.set("limit", String(limit))
    params.set("offset", String(offset))
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}?${params.toString()}`)
    return (res.data as { data?: { entries?: AuditEntry[] } })?.data?.entries ?? []
}

export interface AuditVerifyResult {
    ok: boolean
    checked: number
    first_bad_seq?: number
    first_bad_id?: string
    message: string
}

// verifyAuditLog recomputes the server-side hash chain and reports whether the
// log is provably unaltered (the tamper-evidence an auditor relies on).
export async function verifyAuditLog(): Promise<AuditVerifyResult | null> {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}/verify`)
    return (res.data as { data?: AuditVerifyResult })?.data ?? null
}

// exportAuditLog downloads the audit entries (chain order, with per-row hashes
// so the file is independently verifiable) as CSV or JSON.
export async function exportAuditLog(format: "csv" | "json", category?: string): Promise<void> {
    const params = new URLSearchParams()
    params.set("format", format)
    if (category) params.set("category", category)
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}/export?${params.toString()}`, {
        responseType: "blob",
    })
    const blob = new Blob([res.data as BlobPart], { type: format === "json" ? "application/json" : "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

// ─── Call transcription config (admin) ───────────────────────────────────

export type TranscriptionMode = "frontend" | "backend" | "off"
export type STTProvider = "deepgram" | "google" | "openai"
export type ConfigSource = "db" | "env" | "default" | "none"

export interface TranscriptionConfig {
    mode: TranscriptionMode
    mode_source: ConfigSource
    stt_provider: STTProvider
    stt_provider_source: ConfigSource
    stt_model: string
    stt_base_url: string
    stt_language: string
    has_stt_api_key: boolean
    stt_api_key_source: ConfigSource
    has_google_credentials: boolean
    google_source: ConfigSource
}

export interface UpdateTranscriptionConfigRequest {
    mode?: TranscriptionMode
    stt_provider?: STTProvider
    stt_model?: string
    stt_base_url?: string
    stt_language?: string
    // Secret fields: omit to keep, "" to clear, value to set.
    stt_api_key?: string
    google_credentials?: string
}

export async function getTranscriptionConfig(): Promise<TranscriptionConfig | null> {
    const res = await axiosInstance.get(GetEndpointUrl.GetTranscriptionConfig)
    return (res.data as { data?: TranscriptionConfig })?.data ?? null
}

export async function updateTranscriptionConfig(
    req: UpdateTranscriptionConfigRequest,
): Promise<TranscriptionConfig | null> {
    const res = await axiosInstance.post(PostEndpointUrl.UpdateTranscriptionConfig, req)
    return (res.data as { data?: TranscriptionConfig })?.data ?? null
}

export interface TranscriptionTestResult {
    ok: boolean
    provider: string
    message: string
}

export async function testTranscriptionConfig(): Promise<TranscriptionTestResult | null> {
    const res = await axiosInstance.post(PostEndpointUrl.TestTranscriptionConfig, {})
    return (res.data as { data?: TranscriptionTestResult })?.data ?? null
}
