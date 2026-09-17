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
    /**
     * Who acted, as opposed to who answers for it.
     *
     * actor_email names the accountable person, which for an agent is whoever
     * authorised it, so a row about an agent reads as though the person did it
     * themselves. Absent on entries written before the field existed, which is
     * why the UI shows nothing rather than guessing "human".
     */
    actor_kind?: "human" | "agent" | "system"
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
    /**
     * True when only a WINDOW of the chain was recomputed. A window seeds from
     * its earliest row's stored hash rather than from the first entry ever
     * written, so it proves the links inside itself and takes that one value on
     * trust: "the last 500 entries verify" and "the log has not been altered" are
     * different claims and the UI must not blur them.
     */
    partial?: boolean
    /** Where the window began, so a reader can see what was not covered. */
    from_seq?: number
    /**
     * How many rows had their content cleared by the retention policy and so
     * could not be recomputed from it.
     *
     * The server has always sent this and nothing here declared it, so the one
     * number that separates "I verified this row" from "I took this row's word
     * for it" was dropped on the floor between the two. An auditor is entitled
     * to both, which is why the server reports them separately.
     */
    redacted?: number
}

/**
 * Recompute the server-side hash chain.
 *
 * "recent" by default because the log only grows: a full walk is instant on a
 * fresh install and a gateway timeout on a workspace that has been running a
 * year, which is exactly when an auditor most wants the answer. "full" is the
 * explicit, slower check, offered once the fast one has come back.
 */
export async function verifyAuditLog(scope: "recent" | "full" = "recent"): Promise<AuditVerifyResult | null> {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}/verify`, { params: { scope } })
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
    const res = await axiosInstance.get(evidencePackUrl(from, to), { responseType: "blob" })
    downloadBlob(res.data as BlobPart, "application/json", "onecamp-evidence-pack.json")
}

/**
 * One URL for both readers of the pack, so the document on screen and the file an
 * auditor verifies cannot be built from different windows.
 */
function evidencePackUrl(from?: Date, to?: Date): string {
    const params = new URLSearchParams()
    if (from) params.set("from", from.toISOString())
    if (to) params.set("to", to.toISOString())
    const query = params.toString()
    return `${GetEndpointUrl.GetAdminAuditLog}/evidence-pack${query ? `?${query}` : ""}`
}

/** One fingerprinted part of the pack. The digest is over that section's JSON. */
export interface EvidenceManifestEntry {
    section: string
    rows: number
    sha256: string
    describes: string
}

/**
 * The assembled pack, as the server builds it.
 *
 * `sections` is deliberately untyped. Sections are CONTRIBUTED by whichever
 * packages this edition links, so the set differs between the AI and AI-free
 * builds and grows without this file being touched. A renderer that knew the
 * section names would silently drop a new one; the manifest is the index, and it
 * comes from the same document.
 */
export interface EvidencePack {
    pack: { generated_at: string; generated_by: string; from: string; to: string; product: string }
    integrity: {
        chain_verification: AuditVerifyResult | null
        manifest: EvidenceManifestEntry[]
        pack_fingerprint: string
    }
    sections: Record<string, unknown>
    how_to_verify: string[]
    limits: string[]
}

/**
 * getEvidencePack reads the same document downloadEvidencePack saves, for showing
 * on screen rather than handing over.
 *
 * WHY BOTH EXIST. The pack is assembled, fingerprinted and honest about its own
 * limits, and it was only ever available as a .json file. Nobody hands an auditor
 * a JSON file; they hand them a document. But the file is what verifies, because
 * the fingerprint is a digest of those exact bytes, so the readable version is a
 * READING of the pack rather than a replacement for it and has to say so.
 */
export async function getEvidencePack(from?: Date, to?: Date): Promise<EvidencePack | null> {
    const res = await axiosInstance.get(evidencePackUrl(from, to))
    return (res.data as EvidencePack) ?? null
}

/**
 * What a completed month's pack said, at the time it said it.
 *
 * A pack can always be regenerated; a receipt is the only record of what the
 * EARLIER one contained. Retention redacts row content once it passes the
 * window, so a pack rebuilt later over the same month verified fewer rows and
 * took more of them at their word, and says "verified" either way. The receipt
 * is taken while the rows are intact and stores no content, only the
 * fingerprint, the per-section digests and the counts.
 */
export interface EvidenceReceipt {
    id: string
    period_start: string
    period_end: string
    generated_at: string
    pack_fingerprint: string
    manifest: EvidenceManifestEntry[]
    chain_ok: boolean
    chain_checked: number
    chain_redacted: number
}

export async function listEvidenceReceipts(): Promise<EvidenceReceipt[]> {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAdminAuditLog}/receipts`)
    return (res.data as { data?: EvidenceReceipt[] })?.data ?? []
}

/**
 * The address of the document for a receipt's window.
 *
 * Built from the receipt rather than from a date picker, so the page a reader
 * opens covers exactly the window the fingerprint was computed over. Two
 * different windows would produce two different fingerprints and one confused
 * reader.
 */
export function evidencePageHref(r: Pick<EvidenceReceipt, "period_start" | "period_end">): string {
    const params = new URLSearchParams({ from: r.period_start, to: r.period_end })
    return `/app/admin/evidence?${params.toString()}`
}

/** A period as a person says it: "August 2026". */
export function receiptLabel(r: Pick<EvidenceReceipt, "period_start">): string {
    const d = new Date(r.period_start)
    if (Number.isNaN(d.getTime())) return r.period_start
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
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
