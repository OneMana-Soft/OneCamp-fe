"use client"

// A board comment's thread (components/board/boardComments): its messages,
// reactions and reply box, in a popover or the phone's sheet. A piece of its
// own, fetched as the board shows a pin, so the board's first load carries none
// of it.
import * as React from "react"
import { Button } from "@/components/ui/button"
import { SHEET_FOOTER_ROW } from "@/components/ui/sheetRows"
import { Check, X, Trash, SmilePlus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { useRelativeTime } from "@/hooks/useRelativeTime"
import { CommentFace } from "@/components/board/commentFace"
import type { BoardMentionInput, MentionedUser } from "@/components/board/boardMentionInput"
import type { Asked, BoardComment, CommentSheet, ThreadMessage, useAsking as UseAsking } from "@/components/board/boardComments"

function CommentThread({
  sheet = false,
  comment,
  editable,
  currentUserId,
  onReply,
  onResolve,
  onDelete,
  onDeleteMessage,
  onToggleReaction,
  onClose,
  Mention,
  useWhen,
  useAsking,
  Sheet,
}: {
  /** The app's sheet (a phone): its messages in the sheet's one scroller, the reply pinned at its foot. */
  sheet?: boolean
  comment: BoardComment
  editable: boolean
  currentUserId: string
  /** An editor's or a commenter's. */
  onReply?: (body: string, mentioned: MentionedUser[]) => Asked
  onResolve: () => void
  onDelete: () => void
  /** A commenter's own messages' Delete. */
  onDeleteMessage?: (messageId: string) => Asked
  onToggleReaction: (messageId: string, emoji: string) => void
  onClose: () => void
  /** The board's reply box (components/board/boardMentionInput), handed in: it posts, and this piece reaches no shared core. */
  Mention: typeof BoardMentionInput
  /** The board's "2 min ago" hook (hooks/useRelativeTime), handed in: it stays in the board's first load, as before this
   *  piece, so Turbopack keeps the chunks other routes share with it (a doc's) as they were. */
  useWhen: typeof useRelativeTime
  /** The board's useAsking (components/board/boardComments), handed in like useWhen: a commenter's reply waits on the server. */
  useAsking: typeof UseAsking
  /** A phone's sheet (components/board/boardComments CommentSheet: the shared sheet's chunk), handed in: this piece reaches no drawer. */
  Sheet: typeof CommentSheet
}) {
  const [reply, setReply] = React.useState("")
  const [replyMentions, setReplyMentions] = React.useState<MentionedUser[]>([])
  const field = React.useRef<HTMLTextAreaElement>(null)
  const { busy, send } = useAsking(field)
  const canManage = editable && comment.authorId === currentUserId

  const submitReply = () => {
    const body = reply.trim()
    if (!body || !onReply) return
    send(onReply(body, replyMentions), () => {
      setReply("")
      setReplyMentions([])
    })
  }

  const messages = (comment.messages || []).map((m) => (
    <ThreadMessageRow
      key={m.id}
      message={m}
      editable={editable}
      currentUserId={currentUserId}
      useWhen={useWhen}
      useAsking={useAsking}
      onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
      onDelete={onDeleteMessage && m.authorId === currentUserId ? () => onDeleteMessage(m.id) : undefined}
    />
  ))
  const replyBox = (
    <Mention
      value={reply}
      onChange={setReply}
      onMentionedUsersChange={setReplyMentions}
      onSubmit={submitReply}
      placeholder="Reply…"
      inputRef={field}
      className="min-h-[44px] resize-none text-sm"
    />
  )
  const replyButton = (
    <Button size="sm" disabled={!reply.trim()} busy={busy} onClick={submitReply}>
      Reply
    </Button>
  )

  if (sheet) {
    return (
      <Sheet
        data-board-comment=""
        title={<p className="text-heading text-ink">{comment.resolved ? "Resolved" : "Comment"}</p>}
        onClose={onClose}
        footer={
          onReply ? (
            <div className="flex flex-col gap-2">
              {replyBox}
              <div className={SHEET_FOOTER_ROW}>{replyButton}</div>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-2 px-2 pb-2">
          {editable ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={onResolve}>
                <Check className={cn("h-3.5 w-3.5", comment.resolved && "text-success-ink")} />
                {comment.resolved ? "Reopen" : "Resolve"}
              </Button>
              {canManage && (
                <Button variant="ghost" size="sm" className="text-ink-3 hover:text-danger-ink" onClick={onDelete}>
                  <Trash className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          ) : null}
          {messages}
        </div>
      </Sheet>
    )
  }

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex h-11 items-center justify-between px-3">
        <span className="text-ui-sm font-medium text-ink">{comment.resolved ? "Resolved" : "Comment"}</span>
        <div className="flex items-center gap-1" data-touch-group="24">
          {editable && (
            <Button variant="ghost" size="icon" aria-label="Resolve this comment" className="h-6 w-6" onClick={onResolve} title={comment.resolved ? "Reopen" : "Resolve"}>
              <Check className={cn("h-3.5 w-3.5", comment.resolved && "text-success-ink")} />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" aria-label="Delete this comment" className="h-6 w-6 text-muted-foreground hover:text-danger-ink" onClick={onDelete} title="Delete">
              <Trash className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Close comments" className="h-6 w-6" onClick={onClose} title="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">{messages}</div>

      {onReply && (
        <div className="border-t border-line p-2">
          {replyBox}
          <div className="mt-1.5 flex justify-end">{replyButton}</div>
        </div>
      )}
    </div>
  )
}

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "✅", "😄", "👀"]

function ThreadMessageRow({
  message,
  editable,
  currentUserId,
  useWhen,
  useAsking,
  onToggleReaction,
  onDelete,
}: {
  message: ThreadMessage
  editable: boolean
  currentUserId: string
  useWhen: typeof useRelativeTime
  useAsking: typeof UseAsking
  onToggleReaction: (emoji: string) => void
  onDelete?: () => Asked
}) {
  const relative = useWhen(message.createdAt ? new Date(message.createdAt).toISOString() : null)
  const deleting = useAsking()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const reactions = message.reactions || {}
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0)
  return (
    <div className="group/msg flex gap-2.5 rounded-xl bg-sunken px-3 py-2.5">
      <CommentFace name={message.authorName} className="size-6 shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-ui-sm font-semibold text-ink">{message.authorName}</span>
          {relative && <span className="text-meta text-ink-3">{relative}</span>}
          {onDelete && (
            <Button variant="ghost" size="icon" aria-label="Delete your message" className="ml-auto size-6 text-ink-3" busy={deleting.busy} onClick={() => deleting.send(onDelete())}>
              <Trash className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-ui text-ink">{message.body}</p>

        {/* Reactions */}
        {(reactionEntries.length > 0 || editable) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {reactionEntries.map(([emoji, users]) => {
              const mine = users.includes(currentUserId)
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={!editable}
                  onClick={() => onToggleReaction(emoji)}
                  className={cn(
                    "flex h-[26px] items-center gap-1 rounded-[13px] px-2 text-meta tabular-nums transition-colors",
                    mine ? "bg-brand-muted text-brand-text ring-1 ring-inset ring-brand/30" : "bg-raised text-ink-2 shadow-e1 hover:text-ink",
                  )}
                  title={`${users.length} reaction${users.length > 1 ? "s" : ""}`}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              )
            })}
            {editable && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/50 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto extend-touch-target"
                  title="Add reaction"
                >
                  <SmilePlus className="h-3 w-3" />
                </button>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-0" onClick={() => setPickerOpen(false)} />
                    <div className="absolute z-10 mt-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-e3">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onToggleReaction(emoji)
                            setPickerOpen(false)
                          }}
                          className="rounded p-0.5 text-sm hover:bg-accent"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CommentThread
