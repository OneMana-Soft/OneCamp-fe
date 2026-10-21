import axios from "axios"
import type { UnknownAction } from "@reduxjs/toolkit"
import { injectSlice, type RootState } from "@/store/store"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { FilePreview } from "@/store/slice/channelSlice"
import {
  clearChannelReplyTarget, deleteChannelPreviewFiles, removeChannelUploadedFiles, restoreUnsentChannelPost, updateChannelInputText,
} from "@/store/slice/channelSlice"
import {
  clearChatReplyTarget, createOrUpdateChatBody, deleteChatPreviewFiles, removeChatUploadedFiles, restoreUnsentChatMessage,
} from "@/store/slice/chatSlice"
import {
  clearGroupChatReplyTarget, createOrUpdateGroupChatBody, deleteGroupChatPreviewFiles, removeGroupChatUploadedFiles, restoreUnsentGroupChatMessage,
} from "@/store/slice/groupChatSlice"
import {
  addChannelCommentMsgPreviewFiles, addChannelCommentMsgUploadedFiles, clearChannelCommentMsgInputState,
  createOrUpdateChannelCommentMsg, setChannelCommentAlsoSend,
} from "@/store/slice/channelCommentSlice"
import {
  addChatCommentPreviewFiles, addChatCommentUploadedFiles, clearChatCommentInputState, createOrUpdateChatCommentBody,
} from "@/store/slice/chatCommentSlice"
import { draftRestored, draftRestoresSlice } from "@/lib/conversation/draftRestores"
import type { DraftPlace, KeptDraft } from "@/lib/conversation/drafts"

/**
 * Where each composer's draft lives in today's store, read as one shape
 * (lib/conversation/drafts KeptDraft) and written with the slices' own
 * actions: a channel's, a DM's and a group's composer, and a channel's and a
 * DM's or group's thread reply box. The Draft Store (lib/conversation/
 * draftSync) keeps every one through these, ahead of CHAT-A1B folding the
 * stacks' slices into store/conversations. Nothing here is in the shared
 * slices: it loads with the Draft Store, after the page.
 */
export interface DraftSlot {
  place: DraftPlace
  /** The slice's drafts, by the id it keeps each by; the same object until one changes. */
  drafts(state: RootState): Readonly<Record<string, unknown>> | undefined
  /** One of them as a kept draft: words, finished uploads, reply, choice. */
  read(raw: unknown): KeptDraft
  /**
   * The actions that put a kept draft in the composer in place of what it
   * holds now (null empties it), so it shows even while the box has focus.
   * They are dispatched together, as one change.
   */
  restore(id: string, draft: KeptDraft | null, holds: unknown): UnknownAction[]
}

// The thread boxes' revisions (lib/conversation/draftRestores) come with the Draft Store.
injectSlice(draftRestoresSlice)

/** A finished upload as its composer shows it (useUploadFile: the preview's key is the file's). */
function previewOf(f: AttachmentMediaReq): FilePreview {
  return {
    key: f.attachment_obj_key || f.attachment_uuid,
    fileName: f.attachment_file_name,
    progress: 100,
    cancelSource: axios.CancelToken.source(),
    attachmentType: f.attachment_type,
    uuid: f.attachment_uuid,
  }
}

// Only finished uploads outlive the tab: one still uploading has no object yet.
const finished = (files: AttachmentMediaReq[] | undefined): AttachmentMediaReq[] =>
  (files ?? []).filter((f) => !!f.attachment_uuid)

// A file a composer holds is keyed by its object key; the preview and the file share it.
const keyed = (f: AttachmentMediaReq): AttachmentMediaReq => ({ ...f, attachment_obj_key: f.attachment_obj_key || f.attachment_uuid })

type MainDraft = {
  filesUploaded?: AttachmentMediaReq[]
  filePreview?: FilePreview[]
  filesPreview?: FilePreview[]
  replyToUuid?: string
  replyToAuthorName?: string
  replyToText?: string
}

const readMain = (html: string | undefined, raw: MainDraft): KeptDraft => ({
  html: html ?? "",
  files: finished(raw.filesUploaded),
  ...(raw.replyToUuid ? { replyTo: { uuid: raw.replyToUuid, authorName: raw.replyToAuthorName, text: raw.replyToText } } : {}),
})

/**
 * A kept draft as a composer takes back a message that wasn't sent (lib/chat/
 * unsentMessage Draft): put in an emptied box, it takes the box's place, and
 * the box's revision moves.
 */
const unsentOf = (d: KeptDraft) => {
  const files = d.files.map(keyed)
  return {
    html: d.html,
    files,
    previews: files.map(previewOf),
    replyToUuid: d.replyTo?.uuid,
    replyToAuthorName: d.replyTo?.authorName,
    replyToText: d.replyTo?.text,
  }
}

export const DRAFT_SLOTS: readonly DraftSlot[] = [
  {
    place: "channel",
    drafts: (s) => s.channel?.channelInputState,
    read: (raw) => readMain((raw as { inputTextHTML?: string }).inputTextHTML, raw as MainDraft),
    restore: (id, d, holds) => {
      const h = (holds ?? {}) as MainDraft
      return [
        updateChannelInputText({ channelId: id, inputTextHTML: "" }),
        clearChannelReplyTarget({ channelId: id }),
        ...(h.filePreview ?? []).map((p) => deleteChannelPreviewFiles({ channelId: id, key: p.key })),
        ...(h.filesUploaded ?? []).map((f) => removeChannelUploadedFiles({ channelId: id, key: f.attachment_obj_key ?? "" })),
        ...(d ? [restoreUnsentChannelPost({ channelId: id, unsent: unsentOf(d) })] : []),
      ]
    },
  },
  {
    place: "dm",
    drafts: (s) => s.chat?.chatInputState,
    read: (raw) => readMain((raw as { chatBody?: string }).chatBody, raw as MainDraft),
    restore: (id, d, holds) => {
      const h = (holds ?? {}) as MainDraft
      return [
        createOrUpdateChatBody({ chatUUID: id, body: "" }),
        clearChatReplyTarget({ chatUUID: id }),
        ...(h.filesPreview ?? []).map((p) => deleteChatPreviewFiles({ chatUUID: id, key: p.key })),
        ...(h.filesUploaded ?? []).map((f) => removeChatUploadedFiles({ chatUUID: id, key: f.attachment_obj_key ?? "" })),
        ...(d ? [restoreUnsentChatMessage({ chatUUID: id, unsent: unsentOf(d) })] : []),
      ]
    },
  },
  {
    place: "group",
    drafts: (s) => s.groupChat?.chatInputState,
    read: (raw) => readMain((raw as { chatBody?: string }).chatBody, raw as MainDraft),
    restore: (id, d, holds) => {
      const h = (holds ?? {}) as MainDraft
      return [
        createOrUpdateGroupChatBody({ grpID: id, body: "" }),
        clearGroupChatReplyTarget({ grpId: id }),
        ...(h.filesPreview ?? []).map((p) => deleteGroupChatPreviewFiles({ grpId: id, key: p.key })),
        ...(h.filesUploaded ?? []).map((f) => removeGroupChatUploadedFiles({ grpId: id, key: f.attachment_obj_key ?? "" })),
        ...(d ? [restoreUnsentGroupChatMessage({ grpId: id, unsent: unsentOf(d) })] : []),
      ]
    },
  },
  {
    place: "post-thread",
    drafts: (s) => s.channelComment?.commentInputState,
    read: (raw) => {
      const r = raw as { commentMsgBody?: string; filesUploaded?: AttachmentMediaReq[]; alsoSendToChannel?: boolean }
      return { html: r.commentMsgBody ?? "", files: finished(r.filesUploaded), ...(r.alsoSendToChannel ? { alsoSend: true } : {}) }
    },
    restore: (id, d) => [
      clearChannelCommentMsgInputState({ threadId: id }),
      ...(d
        ? [
            createOrUpdateChannelCommentMsg({ threadId: id, body: d.html }),
            ...d.files.map(keyed).flatMap((f) => [
              addChannelCommentMsgPreviewFiles({ threadId: id, filesUploaded: previewOf(f) }),
              addChannelCommentMsgUploadedFiles({ threadId: id, filesUploaded: f }),
            ]),
            ...(d.alsoSend ? [setChannelCommentAlsoSend({ threadId: id, on: true })] : []),
          ]
        : []),
      draftRestored(`post-thread:${id}`),
    ],
  },
  {
    place: "chat-thread",
    drafts: (s) => s.chatComments?.chatCommentInputState,
    read: (raw) => {
      const r = raw as { commentBody?: string; filesUploaded?: AttachmentMediaReq[] }
      return { html: r.commentBody ?? "", files: finished(r.filesUploaded) }
    },
    restore: (id, d) => [
      clearChatCommentInputState({ threadId: id }),
      ...(d
        ? [
            createOrUpdateChatCommentBody({ threadId: id, body: d.html }),
            ...d.files.map(keyed).flatMap((f) => [
              addChatCommentPreviewFiles({ threadId: id, fileUploaded: previewOf(f) }),
              addChatCommentUploadedFiles({ threadId: id, filesUploaded: f }),
            ]),
          ]
        : []),
      draftRestored(`chat-thread:${id}`),
    ],
  },
]
