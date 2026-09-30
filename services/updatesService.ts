import axiosInstance from "@/lib/axiosInstance"

// "Is there a newer OneCamp?" The server asks onemana.dev only when this is
// called, which is only when an admin clicks: a workspace never reports to us
// on its own.

export interface UpdateStatus {
    /** This server's release, "" when it was built from source. */
    running: string
    /** Its edition ("v2"), "" when running is unknown. */
    edition: string
    /** Newest release on that edition, "" when unknown. */
    latest: string
    latest_by_line: Record<string, string>
    update_available: boolean
    /** OneCamp Cloud hosts this workspace and updates it. */
    managed: boolean
    /** What a self-hosted admin runs on the server; absent when managed. */
    update_command?: string
    /** The host that was asked. */
    source: string
    checked_at: string
}

export const updatesUrl = "/admin/updates"

export async function checkForUpdates(): Promise<UpdateStatus> {
    const res = await axiosInstance.get<{ data: UpdateStatus }>(updatesUrl)
    return res.data.data
}

export type UpdateTone = "current" | "available" | "unknown"

export interface UpdateSummary {
    tone: UpdateTone
    title: string
    body: string
    /** Set when the admin has something to run. */
    command?: string
}

const EDITION_NAME: Record<string, string> = { v1: "without AI", v2: "with AI" }

/** What to tell the admin, for every combination the server can report. */
export function updateSummary(s: UpdateStatus): UpdateSummary {
    if (!s.running) {
        const lines = Object.entries(s.latest_by_line || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([line, tag]) => `${tag} (${EDITION_NAME[line] ?? line})`)
        return {
            tone: "unknown",
            title: "This server can't tell which release it runs",
            body:
                "It was built from source rather than installed from a release. " +
                (lines.length ? `The newest releases are ${lines.join(" and ")}.` : ""),
        }
    }
    if (!s.latest) {
        return {
            tone: "unknown",
            title: `Running ${s.running}`,
            body: "No published release was found for this edition, so there is nothing to compare it with.",
        }
    }
    if (!s.update_available) {
        return { tone: "current", title: `Up to date on ${s.running}`, body: "This is the newest release on your edition." }
    }
    if (s.managed) {
        return {
            tone: "available",
            title: `${s.latest} is available`,
            body: `You're on ${s.running}. OneCamp Cloud moves your workspace to it for you, usually within two days of a release. Nothing to do.`,
        }
    }
    return {
        tone: "available",
        title: `${s.latest} is available`,
        body:
            `You're on ${s.running}. On the server, in your install directory, run the install command from your licence email. ` +
            "It offers the new release and applies it: a backup first, then migrations, a rebuild and a health check. Your data and settings stay.",
        command: s.update_command || undefined,
    }
}
