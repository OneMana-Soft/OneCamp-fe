// A message whose send failed goes back into the composer.
//
// WHY. The channel, DM and group chat composers empty as soon as Send is
// pressed, before the server has the message, so the next one can be typed at
// once. When the send failed (offline, a server error, the server restarting
// in a deploy) the message was simply gone: its text, attachments and reply
// target, with nothing to say it hadn't been sent. The composer still empties
// at once; the views keep the message until the server has it, and put it back
// here when it doesn't, with a toast saying so.

import type { AttachmentMediaReq } from "@/types/attachment"
import type { FilePreview } from "@/store/slice/channelSlice"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"

/** What a composer holds: its text, attachments and reply target. */
export interface Draft {
  html: string
  files: AttachmentMediaReq[]
  previews: FilePreview[]
  replyToUuid?: string
  replyToAuthorName?: string
  replyToText?: string
}

// An attachment is known by the key its upload gave it, as its preview is.
const sameFile = (a: AttachmentMediaReq, b: AttachmentMediaReq) =>
  a === b || (!!a.attachment_obj_key && a.attachment_obj_key === b.attachment_obj_key)

/**
 * The composer's draft with an unsent message put back: the message first,
 * then anything typed or attached since, and the message's reply target unless
 * another was chosen since. Pure.
 */
export function withUnsent(current: Draft, unsent: Draft): Draft {
  const typedSince = removeEmptyPTags(current.html) !== ""
  const reply = current.replyToUuid ? current : unsent
  return {
    html: typedSince ? unsent.html + current.html : unsent.html,
    files: [...unsent.files, ...current.files.filter((f) => !unsent.files.some((u) => sameFile(u, f)))],
    previews: [...unsent.previews, ...current.previews.filter((p) => !unsent.previews.some((u) => u.key === p.key))],
    replyToUuid: reply.replyToUuid,
    replyToAuthorName: reply.replyToAuthorName,
    replyToText: reply.replyToText,
  }
}

/** What the person is told when a message wasn't sent. */
export const NOT_SENT_TOAST = {
  title: "Message not sent",
  description: "It's back in the message box. Check your connection and send it again.",
  variant: "destructive" as const,
}
