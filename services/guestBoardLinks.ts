import axiosInstance from "@/lib/axiosInstance"
import { PeoplePost } from "@/services/endpoints/people"
import { publicCall } from "@/services/publicApi"
import type { GuestCapability, ResourceGuestLink } from "@/services/guestService"

// A board's links (miro-33), apart from guestService: every guest page reaches
// that module, and these two are only the share dialog's and a board link's.

/** What changes on a board's live link: only what is given; a password of "" takes it off. */
export type GuestLinkChange = { capability?: GuestCapability; password?: string; ttl_hours?: number; never_expires?: boolean }

/** Changes a board's live link (its owner's and co-owners'): the link as it now is. A lost race is a 409 in the server's words. */
export async function changeGuestLink(id: string, change: GuestLinkChange): Promise<ResourceGuestLink> {
    const res = await axiosInstance.patch(`${PeoplePost.CreateGuestLink}/${id}`, change)
    return (res.data as { data: ResourceGuestLink }).data
}

/**
 * A board link's guest's comment: a pin, a reply or deleting their own
 * message, written by the server as the live token names them (never what
 * this sends). The pin comes back over the board's socket.
 */
export const askGuestBoardComment = (collabToken: string, boardId: string, c: { action: string; id?: string; message?: string; x?: number; y?: number; text?: string }) =>
    publicCall<{ comment?: { id?: string } }>("/guest/board-comment", {
        method: "POST",
        headers: { Authorization: `Bearer ${collabToken}` },
        body: JSON.stringify({ board_id: boardId, action: c.action, comment_id: c.id, message_id: c.message, x: c.x, y: c.y, text: c.text }),
        credentials: "omit",
    })
