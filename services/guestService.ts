import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { publicCall } from "@/services/publicApi"

// --- Member: start an instant meeting (authed) ---

interface InstantMeetingResponse {
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

type GuestMeetingStatus = "available" | "unavailable"

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

interface GuestJoinResult {
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

interface GuestLinkResponse {
    token: string // raw link token, shown once
    grant_id: string
    resource_type: string
    resource_id: string
    capability: string
    /** Null when the link lasts until it is revoked. */
    expires_at: string | null
}

export async function createGuestLink(
    resourceType: GuestResourceType,
    resourceId: string,
    ttlHours?: number,
    capability: GuestCapability = "view",
    neverExpires = false,
): Promise<GuestLinkResponse> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateGuestLink, {
        resource_type: resourceType,
        resource_id: resourceId,
        ttl_hours: ttlHours ?? 0,
        capability,
        never_expires: neverExpires,
    })
    return (res.data as { data: GuestLinkResponse }).data
}

/** A live link to a resource, as the people who may share it see it. */
export interface ResourceGuestLink {
    id: string
    capability: GuestCapability
    expires_at: string | null
    created_at: string
    mine: boolean
}

/** The SWR key of a resource's live links. */
export const resourceGuestLinksKey = (resourceType: GuestResourceType, resourceId: string) =>
    `${PostEndpointUrl.CreateGuestLink}?resource_type=${encodeURIComponent(resourceType)}&resource_id=${encodeURIComponent(resourceId)}`

export async function turnOffGuestLink(id: string): Promise<void> {
    await axiosInstance.post(`${PostEndpointUrl.CreateGuestLink}/${id}/revoke`)
}

export type GuestResourceType = "doc" | "board" | "table" | "channel" | "project"
/** comment is for docs and projects; post is channel-only (the server coerces anything else to view). */
export type GuestCapability = "view" | "comment" | "post"

/** Where each kind of shared resource opens for its guest. */
const guestLinkSegment: Record<GuestResourceType, string> = { doc: "d", board: "b", table: "t", channel: "c", project: "p" }

/** Build the public share URL for a raw guest token + resource type. */
export function guestResourceLink(resourceType: GuestResourceType, rawToken: string): string {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/guest/${guestLinkSegment[resourceType]}/${rawToken}`
}

// --- Public (no auth): exchange a share-link token for a short-lived,
//     read-only collab session (JWT + Hocuspocus document name). ---

interface GuestCollabSession {
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

interface GuestDocCommentsResult {
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

type GuestCommentResult =
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
    /** Null when the grant lasts until it is revoked. */
    expires_at: string | null
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

// --- Public (no auth): a channel shared with a guest. ---

export interface GuestChannelMessage {
    id: string
    author: string
    text: string
    created_at: string
    reply_count: number
}

export interface GuestChannelPage {
    channel: string
    can_post: boolean
    messages: GuestChannelMessage[]
    has_more: boolean
}

export const getGuestChannel = (token: string, before?: string) =>
    publicCall<GuestChannelPage>(`/guest/channel/${encodeURIComponent(token)}${before ? `?before=${encodeURIComponent(before)}` : ""}`)

export const getGuestThread = (token: string, postId: string) =>
    publicCall<{ message: GuestChannelMessage; replies: GuestChannelMessage[] }>(
        `/guest/channel/${encodeURIComponent(token)}/thread/${encodeURIComponent(postId)}`,
    )

export const postGuestMessage = (token: string, body: { display_name: string; text: string; reply_to?: string }) =>
    publicCall<unknown>(`/guest/channel/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(body) })

// --- Public (no auth): a project shared with a client. ---

/** A client's verdict on a task. */
export interface GuestReview {
    decision: "approved" | "changes"
    name: string
    note?: string
    created_at: string
}

export interface GuestTaskCard {
    id: string
    name: string
    status: string
    status_label: string
    priority?: string
    due_date?: string
    assignee?: string
    comment_count: number
    review?: GuestReview
}

export interface GuestProjectView {
    project: string
    can_comment: boolean
    columns: { status: string; label: string; tasks: GuestTaskCard[] }[]
    total_tasks: number
    done_tasks: number
    generated_at: string
}

export interface GuestTaskView extends GuestTaskCard {
    description: string
    start_date?: string
    comments: GuestChannelMessage[]
    can_comment: boolean
}

/** refresh marks a poll, so only the first open is recorded in the audit log. */
export const getGuestProject = (token: string, refresh = false) =>
    publicCall<GuestProjectView>(`/guest/project/${encodeURIComponent(token)}${refresh ? "?refresh=1" : ""}`)

export const getGuestProjectTask = (token: string, taskId: string) =>
    publicCall<GuestTaskView>(`/guest/project/${encodeURIComponent(token)}/task/${encodeURIComponent(taskId)}`)

export const commentOnGuestTask = (token: string, taskId: string, body: { display_name: string; text: string }) =>
    publicCall<unknown>(`/guest/project/${encodeURIComponent(token)}/task/${encodeURIComponent(taskId)}/comment`, { method: "POST", body: JSON.stringify(body) })

export const reviewGuestTask = (token: string, taskId: string, body: { display_name: string; decision: GuestReview["decision"]; note: string }) =>
    publicCall<GuestReview>(`/guest/project/${encodeURIComponent(token)}/task/${encodeURIComponent(taskId)}/review`, { method: "POST", body: JSON.stringify(body) })
