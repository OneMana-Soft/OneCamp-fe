/**
 * Turn an audit entry's metadata JSON into something an operator can read.
 *
 * WHY THIS EXISTS. Every audit row carries a metadata blob, and the audit log fetched it
 * and displayed none of it. So the most useful thing the backend records was invisible in
 * the product: the REASON. A row would say "refused the triage agent, read_doc" and the
 * sentence explaining it — "the originating person has no grant on this private doc" —
 * existed in the database and could only be seen by exporting CSV.
 *
 * The reasons are written to be acted on. Surfacing them is the whole point of having
 * written them carefully.
 *
 * GENERIC OVER ANY SHAPE. This knows nothing about which feature recorded the row. Keys are
 * humanised by rule, values by type, and unknown keys render as well as known ones — so a
 * recorder added later needs no change here. The label map is a nicety for the keys that
 * recur, never a filter: a key not in it is still shown.
 */

/** One metadata field, ready to render. */
export interface AuditMetadataField {
    /** The raw key, kept so callers can key React lists and test precisely. */
    key: string
    /** Human label for the key. */
    label: string
    /** Display string for the value. Never empty — absent values render as an em dash. */
    value: string
    /** True when this field is the human-readable explanation, which is shown first. */
    isReason: boolean
}

export interface AuditMetadata {
    fields: AuditMetadataField[]
    /**
     * True when the row records something that was REFUSED.
     *
     * Derived from a convention rather than from feature knowledge: a recorder signals a
     * refusal with `allowed: false` or `decision: "refused"`. Any recorder that follows it
     * gets the affordance; one that does not simply has no outcome shown, rather than being
     * shown as permitted.
     */
    refused: boolean
    /** True when the blob was present but could not be parsed — shown raw rather than dropped. */
    malformed: boolean
    /** The original string, for the malformed case. */
    raw: string
}

/**
 * Labels for keys that recur across recorders. Additive only: an unmapped key falls back to
 * the humanising rule below, so nothing is hidden by being absent here.
 */
const KEY_LABELS: Record<string, string> = {
    reason: "Reason",
    decision: "Decision",
    allowed: "Allowed",
    tool: "Tool",
    token_id: "Token",
    agent_id: "Agent ID",
    agent_name: "Agent",
    actor: "Actor type",
    principal_user_id: "Authorised by",
    client_name: "Client",
    client_version: "Client version",
    resource_kind: "Resource type",
    resource_id: "Resource",
    governed: "Per-object check",
    read_only: "Read-only",
    enforced_depth: "Enforced hop depth",
    declared_depth: "Claimed hop depth",
    declared_actors: "Claimed actors",
    scopes: "Scopes",
}

/**
 * Words that read as a typo in sentence case. Keys arrive snake_cased and lowercase, so
 * there is no capitalisation in the source to preserve — an acronym has to be recognised.
 * Small and additive: an unlisted word is simply lowercased.
 */
const ACRONYMS = new Set(["id", "ip", "url", "uri", "uuid", "api", "sql", "html", "json", "mcp", "ai"])

/**
 * snake_case / camelCase -> "Sentence case", for any key not in the label map.
 *
 * CONSISTENT ACROSS SPELLINGS: `some_new_field` and `someNewField` must produce the same
 * label, or the same logical field recorded by two backends reads as two different things in
 * the log. That means lowercasing the split words rather than keeping camelCase's capitals,
 * then re-casing the acronyms.
 */
function humaniseKey(key: string): string {
    const words = key
        .replace(/[_-]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => {
            const lower = w.toLowerCase()
            return ACRONYMS.has(lower) ? lower.toUpperCase() : lower
        })

    if (words.length === 0) return key
    const first = words[0]
    return [ACRONYMS.has(first.toLowerCase()) ? first : first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(" ")
}

/** Longest value we render inline before truncating. Full value stays in the CSV export. */
const MAX_VALUE_LENGTH = 300

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "—"
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "number") return String(value)
    if (Array.isArray(value)) {
        if (value.length === 0) return "—"
        return value.map((v) => formatValue(v)).join(", ")
    }
    if (typeof value === "object") {
        try {
            return JSON.stringify(value)
        } catch {
            return String(value)
        }
    }
    const s = String(value)
    if (s.trim() === "") return "—"
    return s.length > MAX_VALUE_LENGTH ? `${s.slice(0, MAX_VALUE_LENGTH)}…` : s
}

/**
 * Order fields so the row reads as an explanation rather than a dump.
 *
 * Reason first because it is the sentence a reviewer came for. Then who and what, then the
 * mechanical fields. Anything unrecognised keeps its relative order after the known keys,
 * so a new recorder's fields are appended predictably instead of scattered.
 */
const FIELD_ORDER = [
    "reason",
    "decision",
    "allowed",
    "agent_name",
    "actor",
    "principal_user_id",
    "tool",
    "resource_kind",
    "resource_id",
    "client_name",
    "client_version",
    "governed",
    "read_only",
    "enforced_depth",
    "declared_depth",
    "declared_actors",
    "token_id",
    "agent_id",
]

function orderIndex(key: string): number {
    const i = FIELD_ORDER.indexOf(key)
    return i === -1 ? FIELD_ORDER.length : i
}

/**
 * Parse an audit entry's metadata for display.
 *
 * Returns null when there is nothing to show, so a caller can omit the disclosure entirely
 * rather than offering an empty one. Never throws: this renders in an admin list, and a
 * malformed blob from any recorder must not take the page down — it is surfaced as raw text
 * instead, which is still more useful than hiding it.
 */
export function parseAuditMetadata(raw?: string | null): AuditMetadata | null {
    const text = (raw ?? "").trim()
    if (!text) return null

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return { fields: [], refused: false, malformed: true, raw: text }
    }

    // A non-object payload (a bare string or number) is still worth showing.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
            fields: [{ key: "value", label: "Value", value: formatValue(parsed), isReason: false }],
            refused: false,
            malformed: false,
            raw: text,
        }
    }

    const obj = parsed as Record<string, unknown>
    const fields: AuditMetadataField[] = Object.keys(obj)
        .map((key) => ({
            key,
            label: KEY_LABELS[key] ?? humaniseKey(key),
            value: formatValue(obj[key]),
            isReason: key === "reason",
        }))
        // Stable: sort by known order, then by original key order for the rest.
        .sort((a, b) => orderIndex(a.key) - orderIndex(b.key))

    const refused =
        obj.allowed === false ||
        (typeof obj.decision === "string" && obj.decision.toLowerCase().startsWith("refus"))

    return { fields, refused, malformed: false, raw: text }
}

/**
 * The one-line explanation for a row, or "" when there is none.
 *
 * Separate from the full field list because the reason is worth showing WITHOUT making an
 * operator open anything: scanning a list of refusals and their causes is the common task,
 * and burying the cause one click deep turns that into N clicks.
 */
export function auditReason(raw?: string | null): string {
    const meta = parseAuditMetadata(raw)
    if (!meta || meta.malformed) return ""
    const reason = meta.fields.find((f) => f.isReason)
    return reason && reason.value !== "—" ? reason.value : ""
}
