import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { pinsKey } from "@/lib/conversation/conversationPath"
import { isThread, type ConversationRef, type Target } from "@/lib/conversation/types"

/**
 * Pinned messages (chat B25, PROGRAM.md D-M13; business/Pin): a message
 * pinned to its conversation, a channel's, a DM's or a group's, so everyone
 * in it can find it again. Whoever posts there pins and unpins; in an
 * announcement channel that is its channel managers. A conversation holds up
 * to 100. Read and changed at /conversations/{kind}/{id}/pins.
 *
 * Only the chat screens reach this file: never services/endPoints.ts, which
 * every route's first load carries.
 */

/** Someone as a pin names them. */
export interface PinPerson {
  user_uuid: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string
  is_bot?: boolean
}

/** A pinned message, as it is now. */
export interface PinnedMessage {
  id: string
  html: string
  created_at?: string
  by?: PinPerson
  files?: number
}

/** One pin: who pinned it, when, and the message. */
export interface Pin {
  message_id: string
  pinned_by: PinPerson
  pinned_at: string
  message: PinnedMessage
}

/** A conversation's pins, newest first, and whether the reader may pin and unpin there. */
export interface Pins {
  pins: Pin[]
  can_pin: boolean
  max: number
}

/** The key a conversation's pins are cached under. Pure. */
export function pinsKeyOf(ref: ConversationRef): string {
  return pinsKey(ref.kind, ref.id)
}

/** Pins (pinned) or unpins message in ref, and answers the pins as they are now. A refusal says why (apiErrorMessage). */
export async function setPinned(ref: ConversationRef, messageId: string, pinned: boolean): Promise<Pins> {
  const res = await axiosInstance.post<{ data: Pins }>(pinsKeyOf(ref), { message_id: messageId, pinned }, OWN_ERRORS)
  return res.data.data
}

/** "Pin to this channel", or the DM's or group's words. Pure. */
export function pinLabel(ref: ConversationRef, pinned: boolean): string {
  if (pinned) return ref.kind === "channel" ? "Unpin from this channel" : "Unpin from this conversation"
  return ref.kind === "channel" ? "Pin to this channel" : "Pin to this conversation"
}

/**
 * The conversation a row's message may be pinned in: the conversation the row
 * is shown in, or, in a thread, its root's (the root is the conversation's
 * message; a reply is not pinned). null outside a conversation (a doc's or a
 * task's comments). Pure.
 */
export function rowConversation(target: Target | null, messageId: string | undefined): ConversationRef | null {
  if (!target || !messageId) return null
  if (!isThread(target)) return target
  return target.root === messageId ? target.in : null
}
