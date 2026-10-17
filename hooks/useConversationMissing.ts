"use client"

import { useSelector } from "react-redux"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { loadFailure, type LoadFailure } from "@/lib/http/loadFailure"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ConversationKind } from "@/lib/mqtt/conversationAccess"
import type { RootState } from "@/store/store"

/** The read a conversation stands on: a channel's info, the other person's profile, a group's members. */
function conversationReadKey(kind: ConversationKind, id: string): string {
  if (!id) return ""
  if (kind === "channel") return `${GetEndpointUrl.ChannelBasicInfo}/${id}`
  if (kind === "dm") return `${GetEndpointUrl.SelfProfile}/${id}`
  return `${GetEndpointUrl.GetDmGroupParticipants}/${id}`
}

/**
 * Why a conversation can't be shown, from its own read (lib/http/loadFailure):
 * not yours, gone, or not loaded. Undefined while it is there or loading. The
 * read is the one the conversation's screen makes, so asking costs nothing.
 *
 * Everything that acts on a conversation asks this: its view draws one state
 * in place of the header, the messages and the message box, on a computer and
 * a phone, and the phone's bar drops its Huddle and options. A channel that
 * isn't there showed "# channel · 0 members" with a live Huddle, "a connection
 * problem" and Join this channel; a DM with nobody, a message box (QA F-08 to
 * F-11). A group made here and not yet sent has no members on the server and
 * is there all the same.
 */
export function useConversationMissing(kind: ConversationKind, id: string): ConversationMissing {
  // The read as the conversation's own view makes it: a channel's follows the
  // page (useFetch), a person's and a group's are read once. Both are always
  // called, the other with no key, so the hooks keep their order.
  const key = conversationReadKey(kind, id)
  const followed = useFetch<ConversationRead>(kind === "channel" ? key : "")
  const once = useFetchOnlyOnce<ConversationRead>(kind === "channel" ? "" : key)
  const read = kind === "channel" ? followed : once
  const madeHere = useSelector((s: RootState) => kind === "group" && !!s.groupChat.locallyCreatedGrpInfo[id]?.participants)
  const retry = read.mutate
  const retrying = !!read.isLoading
  if (!id || madeHere) return { retry, retrying }
  // The error first: SWR keeps it while it retries, and a failed read has no
  // data, which would read as loading (TN-BUG-4).
  if (read.isError && !read.data) return { missing: loadFailure(read.isError), retry, retrying }
  if (read.data === undefined) return { retry, retrying }
  // An answer with nothing in it names nothing.
  const thing = kind === "channel" ? read.data.channel_info : read.data.data
  return { missing: thing ? undefined : "gone", retry, retrying }
}

interface ConversationMissing {
  /** Why it can't be shown; undefined while it is there or loading. */
  missing?: LoadFailure
  /** Reads it again, for Try again on a failed read. */
  retry: () => unknown
  retrying: boolean
}

/** What each conversation's read answers with, as far as this needs: the thing itself, or nothing. */
type ConversationRead = { data?: unknown; channel_info?: unknown }
