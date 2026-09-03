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

/**
 * One page of the audit log, plus the categories the server actually records.
 *
 * The category list comes from the server rather than being hardcoded here. It was
 * hardcoded, and it drifted: the `agent` category was added on the backend and this
 * list never learned about it, so every agent and MCP entry — including refusals —
 * could only be seen under "all". Taking the list from the response means a new
 * category shows up in the UI with nothing to remember.
 */
export interface AuditLogPage {
    entries: AuditEntry[]
    categories: string[]
}

export async function getAdminAuditLog(category?: string, limit = 50, offset = 0): Promise<AuditLogPage> {
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    params.set("limit", String(limit))
    params.set("offset", String(offset))
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}?${params.toString()}`)
    const data = (res.data as { data?: { entries?: AuditEntry[]; categories?: string[] } })?.data
    return {
        entries: data?.entries ?? [],
        // Empty rather than a guessed default: the component keeps whatever list it
        // already has, so a partial response cannot silently remove a filter an
        // admin was using.
        categories: data?.categories ?? [],
    }
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

/**
 * downloadEvidencePack fetches the assembled evidence pack for a window.
 *
 * A different document from the audit export beside it, for a different reader.
 * The export is the log, for somebody who wants the rows. The pack is an
 * argument, for somebody deciding whether to trust the system: it carries the
 * chain recomputation, what each agent was told, a manifest fingerprinting every
 * section, and a plain statement of what it does not prove.
 *
 * Defaults to the last 90 days, which is the quarter audits are usually scoped
 * in, and the server bounds it either way so an unbounded request cannot be made
 * by leaving the fields empty.
 */
export async function downloadEvidencePack(from?: Date, to?: Date): Promise<void> {
    const params = new URLSearchParams()
    if (from) params.set("from", from.toISOString())
    if (to) params.set("to", to.toISOString())
    const query = params.toString()
    const res = await axiosInstance.get(
        `${GetEndpointUrl.GetAdminAuditLog}/evidence-pack${query ? `?${query}` : ""}`,
        { responseType: "blob" },
    )
    downloadBlob(res.data as BlobPart, "application/json", "onecamp-evidence-pack.json")
}

/**
 * downloadBlob turns a response body into a saved file.
 *
 * Extracted because a second caller needed the same eight lines, and the object
 * URL has to be revoked either way: a copy that forgets leaks the whole file for
 * the life of the tab.
 */
function downloadBlob(data: BlobPart, type: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
    downloadBlob(res.data as BlobPart, format === "json" ? "application/json" : "text/csv", `audit-log.${format}`)
}

// ─── Call transcription config (admin) ───────────────────────────────────

export type TranscriptionMode = "frontend" | "backend" | "off"
/**
 * "local" is the Whisper server bundled with OneCamp, running on the customer's
 * own machine. Its own provider rather than a preset of the OpenAI-compatible
 * one, because it is a different decision (where does the audio of my meetings
 * go) rather than a different endpoint.
 */
export type STTProvider = "deepgram" | "google" | "openai" | "local"
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

/**
 * The workspace retention policy.
 *
 * window_days of 0 means keep everything, which is the default and the previous
 * behaviour. minimum_days_floor is the six-month statutory minimum a shorter
 * value is raised to, surfaced so the interface can EXPLAIN the floor rather
 * than silently applying it: a setting that quietly turns 30 into 190 looks
 * broken, one that says why is a control.
 */
export interface RetentionPolicy {
    window_days: number
    keeps_everything: boolean
    minimum_days_floor: number
    swept_stores?: string[]
}

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
    const res = await axiosInstance.get(GetEndpointUrl.AdminRetention)
    return res.data?.data as RetentionPolicy
}

/** Returns what was APPLIED, which differs from what was asked whenever the floor intervenes. */
export async function setRetentionPolicy(windowDays: number): Promise<RetentionPolicy> {
    const res = await axiosInstance.post(GetEndpointUrl.AdminRetention, { window_days: windowDays })
    return res.data?.data as RetentionPolicy
}

/**
 * Push notification configuration.
 *
 * Deliberately carries no credential. The service accepts a service-account key
 * and never returns one: a key that can be read back leaks through a
 * screenshot, a cached response or a support ticket, and an admin who needs a
 * different key pastes a different key.
 */
export interface PushConfig {
    /** A credential is stored and parses as a service account. */
    configured: boolean
    /** Where it came from: the admin setting, a mounted file, or nowhere. */
    source: "settings" | "file" | "none"
    project_id?: string
    client_email?: string
    /**
     * Whether the messaging client actually loaded, which is a different
     * question from whether a key is stored: one can be present and rejected.
     */
    active: boolean
}

export async function getPushConfig(): Promise<PushConfig> {
    const res = await axiosInstance.get(GetEndpointUrl.AdminPush)
    return res.data?.data as PushConfig
}

export async function setPushConfig(credentialJson: string): Promise<PushConfig> {
    const res = await axiosInstance.post(GetEndpointUrl.AdminPush, { credential_json: credentialJson })
    return res.data?.data as PushConfig
}

export async function clearPushConfig(): Promise<PushConfig> {
    const res = await axiosInstance.delete(GetEndpointUrl.AdminPush)
    return res.data?.data as PushConfig
}
