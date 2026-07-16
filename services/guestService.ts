import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

// --- Member: start an instant meeting (authed) ---

export interface InstantMeetingResponse {
    room: string
    host_token: string
    guest_token: string // raw link token, shown once
    grant_id: string
    expires_at: string
}

export async function createInstantMeeting(
    audioEnabled: boolean,
    videoEnabled: boolean,
): Promise<InstantMeetingResponse> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateInstantMeeting, {
        audio_enabled: audioEnabled,
        video_enabled: videoEnabled,
    })
    return (res.data as { data: InstantMeetingResponse }).data
}

/** Build the shareable guest link for a raw guest token. */
export function guestMeetingLink(rawToken: string): string {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/guest/m/${rawToken}`
}

// --- Public (no auth): guest validate + join. Uses plain fetch so the
//     authed axios instance (refresh/CSRF/logout) is never involved. ---

const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "")

export type GuestMeetingStatus = "available" | "unavailable"

export async function getGuestMeetingStatus(token: string): Promise<GuestMeetingStatus> {
    try {
        const res = await fetch(`${backendBase}/guest/meet/${encodeURIComponent(token)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
        })
        return res.ok ? "available" : "unavailable"
    } catch {
        return "unavailable"
    }
}

export interface GuestJoinResult {
    ok: boolean
    token?: string
    room?: string
    // error kind for UI: 'name' (bad name → fixable) | 'unavailable' (terminal)
    error?: "name" | "unavailable"
}

export async function joinGuestMeeting(
    token: string,
    displayName: string,
    audioEnabled: boolean,
    videoEnabled: boolean,
): Promise<GuestJoinResult> {
    try {
        const res = await fetch(`${backendBase}/guest/meet/${encodeURIComponent(token)}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                display_name: displayName,
                audio_enabled: audioEnabled,
                video_enabled: videoEnabled,
            }),
        })
        if (res.ok) {
            const body = (await res.json()) as { data?: { token?: string; room?: string } }
            return { ok: true, token: body.data?.token, room: body.data?.room }
        }
        if (res.status === 400) return { ok: false, error: "name" }
        return { ok: false, error: "unavailable" }
    } catch {
        return { ok: false, error: "unavailable" }
    }
}

// --- Member: create a scoped, read-only external share link for a doc/board ---

export interface GuestLinkResponse {
    token: string // raw link token, shown once
    grant_id: string
    resource_type: string
    resource_id: string
    capability: string
    expires_at: string
}

export async function createGuestLink(
    resourceType: "doc" | "board" | "table",
    resourceId: string,
    ttlHours?: number,
    capability: "view" | "comment" = "view",
): Promise<GuestLinkResponse> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateGuestLink, {
        resource_type: resourceType,
        resource_id: resourceId,
        ttl_hours: ttlHours ?? 0,
        capability,
    })
    return (res.data as { data: GuestLinkResponse }).data
}

/** Build the public share URL for a raw guest token + resource type. */
export function guestResourceLink(resourceType: "doc" | "board" | "table", rawToken: string): string {
    if (typeof window === "undefined") return ""
    const seg = resourceType === "board" ? "b" : resourceType === "table" ? "t" : "d"
    return `${window.location.origin}/guest/${seg}/${rawToken}`
}

// --- Public (no auth): exchange a share-link token for a short-lived,
//     read-only collab session (JWT + Hocuspocus document name). ---

export interface GuestCollabSession {
    collab_token: string
    document_name: string
    resource_type: "doc" | "board"
    resource_id: string
    capability?: "view" | "comment"
}

export async function getGuestCollabSession(
    token: string,
    displayName?: string,
): Promise<GuestCollabSession | null> {
    try {
        const res = await fetch(`${backendBase}/guest/collab/${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ display_name: (displayName || "").trim() }),
        })
        if (!res.ok) return null
        const body = (await res.json()) as { data?: GuestCollabSession }
        return body.data ?? null
    } catch {
        return null
    }
}

// --- Public (no auth): read-only table bundle for a guest. ---

export async function getGuestTable(token: string): Promise<any | null> {
    try {
        const res = await fetch(`${backendBase}/guest/table/${encodeURIComponent(token)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
        })
        if (!res.ok) return null
        const body = (await res.json()) as { data?: unknown }
        return body.data ?? null
    } catch {
        return null
    }
}

// --- Public (no auth): guest doc comments (capability = comment). ---

export interface GuestDocComment {
    id: string
    guest_name: string
    body: string // plain text; render escaped
    created_at: string
}

export interface GuestDocCommentsResult {
    capability: "view" | "comment"
    comments: GuestDocComment[]
}

export async function listGuestDocComments(token: string): Promise<GuestDocCommentsResult> {
    try {
        const res = await fetch(`${backendBase}/guest/doc-comments/${encodeURIComponent(token)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
        })
        if (!res.ok) return { capability: "view", comments: [] }
        const body = (await res.json()) as { data?: GuestDocCommentsResult }
        return body.data ?? { capability: "view", comments: [] }
    } catch {
        return { capability: "view", comments: [] }
    }
}

export type GuestCommentResult =
    | { ok: true; comment: GuestDocComment }
    | { ok: false; error: "view_only" | "empty" | "unavailable" }

export async function createGuestDocComment(
    token: string,
    displayName: string,
    commentBody: string,
): Promise<GuestCommentResult> {
    try {
        const res = await fetch(`${backendBase}/guest/doc-comments/${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ display_name: (displayName || "").trim(), body: commentBody }),
        })
        if (res.ok) {
            const body = (await res.json()) as { data?: GuestDocComment }
            if (body.data) return { ok: true, comment: body.data }
            return { ok: false, error: "unavailable" }
        }
        if (res.status === 403) return { ok: false, error: "view_only" }
        if (res.status === 400) return { ok: false, error: "empty" }
        return { ok: false, error: "unavailable" }
    } catch {
        return { ok: false, error: "unavailable" }
    }
}

export interface GuestGrant {
    id: string
    resource_type: string
    resource_id: string
    capability: string
    created_by: string
    expires_at: string
    created_at: string
}

export async function setGuestAccess(enabled: boolean): Promise<boolean> {
    const res = await axiosInstance.post(PostEndpointUrl.SetGuestAccess, { enabled })
    return (res.data as { data?: { guest_access_enabled?: boolean } })?.data?.guest_access_enabled ?? enabled
}

export async function listGuestGrants(): Promise<GuestGrant[]> {
    const res = await axiosInstance.get(GetEndpointUrl.GetGuestGrants)
    return (res.data as { data?: GuestGrant[] })?.data ?? []
}

export async function revokeGuestGrant(id: string): Promise<void> {
    await axiosInstance.post(`${GetEndpointUrl.GetGuestGrants}/${id}/revoke`)
}
