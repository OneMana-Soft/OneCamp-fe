/**
 * Anchored threads as the API sends them (business/Thread; docs programme A8).
 * A comment is the resource's own comment, with the keys every comment in the
 * app has, so it renders as one; threadsSlice keeps it, and changes it by its
 * id (commentChanged).
 */
import type { Anchor } from '@/lib/anchors/types'
import type { CommentInfoInterface } from '@/types/comment'

export type ThreadStatus = 'open' | 'resolved'

export interface Thread {
  id: string
  resource_kind: string
  resource_uuid: string
  anchor: Anchor
  status: ThreadStatus
  resolved_by?: string
  resolved_at?: string
  task_uuid?: string
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * A thread's comment: the resource's own comment (for a doc, the one the doc's
 * comment list shows and useDocComments writes), plus the thread it is in.
 */
export type ThreadComment = CommentInfoInterface & {
  thread_id: string
}

type ParticipantRole = 'author' | 'replier' | 'mentioned' | 'reader'

export interface ThreadParticipant {
  user_uuid: string
  role: ParticipantRole
  last_read_at?: string
}

/** A thread as the signed-in person sees it. */
export interface ThreadView extends Thread {
  comments: ThreadComment[]
  participants: ThreadParticipant[]
  /** Someone else commented after you last read it. */
  unread: boolean
  /** A comment from before threads, read as a page-level thread; its id is the comment's. */
  legacy?: boolean
  can_reply: boolean
  /** May resolve, reopen and reattach it. */
  can_resolve: boolean
  /**
   * May remove anyone's comment in it: the resource's owner, someone with
   * full access, or a workspace admin (B7, by the Access Resolver's decision).
   * Absent from a server older than that: then only their own.
   */
  can_moderate?: boolean
}

/** A resource threads hang on: a doc today. */
export interface ThreadResource {
  kind: string
  uuid: string
}

/** A comment as it is written: the editor's HTML and any attachments. */
export interface ThreadBody {
  body: string
  attachments?: unknown[]
}
