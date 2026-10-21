import type { AttachmentMediaReq } from "@/types/attachment"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"

/**
 * Drafts kept beyond the tab (chat P5; PROGRAM.md B24's drafts, D-M4): what a
 * composer holds is kept on the device as it is typed and on the server a
 * moment later, so a reload, a crash or a deploy loses nothing, and the same
 * draft waits on another device. The server is business/Draft; the keeping is
 * lib/conversation/draftSync; this file is the shapes and rules they share.
 *
 * A place is named by its draft key, as the server names it:
 *
 *   channel:<channel uuid>        a channel's composer
 *   dm:<grouping id>              a DM's (both people's ids, sorted, a space between)
 *   group:<grouping id>           a group's
 *   post-thread:<root uuid>       a channel thread's reply box
 *   chat-thread:<root uuid>       a DM's or group's thread's reply box
 */

/** Which composer a draft is for. */
export type DraftPlace = "channel" | "dm" | "group" | "post-thread" | "chat-thread"

/** The message a draft answers inline (the reply pill). */
export interface DraftReply {
  uuid: string
  authorName?: string
  text?: string
}

/** A draft as it outlives the tab: the composer's words, its finished uploads, its reply. */
export interface KeptDraft {
  html: string
  files: AttachmentMediaReq[]
  replyTo?: DraftReply
  /** A channel thread's "Also send to #channel". */
  alsoSend?: boolean
}

/** A draft as the server keeps it (business/Draft Draft). */
export interface ServerDraft {
  key: string
  html: string
  reply_to?: { uuid: string; author_name?: string; text?: string }
  files?: AttachmentMediaReq[]
  also_send?: boolean
  updated_at: string
}

/** Whether a draft holds nothing: no words or picture, no files, no reply. Pure. */
export function isBlankDraft(d: KeptDraft | null | undefined): boolean {
  if (!d) return true
  const html = d.html ?? ""
  const words = removeEmptyPTags(html).replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "")
  return words === "" && !html.includes("<img") && (d.files?.length ?? 0) === 0 && !d.replyTo?.uuid
}

/**
 * What a draft says, as one string two drafts can be compared by: equal for
 * the same words, files, reply and choice, and "" for every blank one. Pure.
 */
export function draftSignature(d: KeptDraft | null | undefined): string {
  if (!d || isBlankDraft(d)) return ""
  return JSON.stringify([
    d.html,
    (d.files ?? []).map((f) => f.attachment_obj_key || f.attachment_uuid),
    d.replyTo?.uuid ?? "",
    !!d.alsoSend,
  ])
}

/** The server's draft as the app keeps it. Pure. */
export function fromServerDraft(s: ServerDraft): KeptDraft {
  return {
    html: s.html ?? "",
    files: s.files ?? [],
    ...(s.reply_to?.uuid ? { replyTo: { uuid: s.reply_to.uuid, authorName: s.reply_to.author_name, text: s.reply_to.text } } : {}),
    ...(s.also_send ? { alsoSend: true } : {}),
  }
}

/** What PUT /drafts takes for a draft. Pure. */
export function toServerDraft(key: string, d: KeptDraft): Omit<ServerDraft, "updated_at"> {
  return {
    key,
    html: d.html,
    files: d.files,
    ...(d.replyTo?.uuid ? { reply_to: { uuid: d.replyTo.uuid, author_name: d.replyTo.authorName, text: d.replyTo.text } } : {}),
    ...(d.alsoSend ? { also_send: true } : {}),
  }
}

/**
 * The draft key of a composer, from the id its store keeps it by: a channel's
 * uuid, a DM's other person (the reader's own id makes its grouping id), a
 * group's id, or a thread's root. Null for a DM while the reader isn't known.
 * Pure.
 */
export function draftKeyOf(place: DraftPlace, id: string, viewer: string | null | undefined): string | null {
  if (!id) return null
  if (place === "dm") return viewer ? `dm:${getGroupingId(viewer, id)}` : null
  return `${place}:${id}`
}

/**
 * The composer a draft key names, and the id its store keeps it by (a DM's is
 * the other person: you, for notes to yourself). Null for a key that names no
 * composer, or a DM the reader isn't in. Pure.
 */
export function draftPlaceOf(key: string, viewer: string | null | undefined): { place: DraftPlace; id: string } | null {
  const at = key.indexOf(":")
  if (at < 0) return null
  const place = key.slice(0, at) as DraftPlace
  const id = key.slice(at + 1)
  if (!id) return null
  switch (place) {
    case "channel":
    case "group":
    case "post-thread":
    case "chat-thread":
      return { place, id }
    case "dm": {
      if (!viewer) return null
      const people = id.split(" ")
      if (people.length !== 2 || !people.includes(viewer)) return null
      return { place, id: people[0] === viewer ? people[1] : people[0] }
    }
  }
  return null
}
