"use client"

// ---------------------------------------------------------------------------
// BoardComments: Miro-style pinned comments on the canvas.
//
// Comments live in the SAME Yjs document as the drawing (a Y.Map "comments"),
// so they sync in real time, persist with the board state, and are rejected
// server-side for read-only viewers (who can still read them). Each comment is
// a pin at a scene coordinate with a small message thread + a resolved flag.
//
// Pins are an HTML overlay positioned from Excalidraw's scene<->viewport
// transforms, kept in sync with pan/zoom via a lightweight rAF loop.
// ---------------------------------------------------------------------------

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MessageCircle, Check, X, Trash, SmilePlus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { BoardMentionInput, type MentionedUser } from "@/components/board/boardMentionInput"

interface ThreadMessage {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: number
  reactions?: Record<string, string[]> // emoji -> userIds
}

interface BoardComment {
  id: string
  x: number
  y: number
  resolved: boolean
  createdAt: number
  authorId: string
  authorName: string
  messages: ThreadMessage[]
}

interface ViewState {
  scrollX: number
  scrollY: number
  zoom: { value: number }
  offsetLeft: number
  offsetTop: number
}

interface CoordFns {
  sceneToViewport: (p: { sceneX: number; sceneY: number }, v: ViewState) => { x: number; y: number }
  viewportToScene: (p: { clientX: number; clientY: number }, v: ViewState) => { x: number; y: number }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

interface BoardCommentsProps {
  provider: HocuspocusProvider
  api: ExcalidrawImperativeAPI | null
  user: { id: string; name: string }
  /** Board uuid, used to mirror @mentions into the activity feed. */
  boardId: string
  editable: boolean
  /** Controlled comment-placement mode (toggle lives in the page chrome). */
  commentMode: boolean
  onCommentModeChange: (on: boolean) => void
}

export function BoardComments({ provider, api, user, boardId, editable, commentMode, onCommentModeChange }: BoardCommentsProps) {
  const yDoc = provider.document
  const yComments = React.useMemo(() => yDoc.getMap<Record<string, unknown>>("comments"), [yDoc])

  const { makeRequest } = usePost()

  // Mirror a posted comment/reply that @mentions users into the activity
  // subsystem (persisted mention + realtime notification). The canvas thread
  // itself stays in Yjs; this is best-effort and never blocks the UI.
  const notifyMentions = React.useCallback(
    (body: string, mentioned: MentionedUser[]) => {
      const uuids = Array.from(new Set(mentioned.map((m) => m.uuid))).filter(Boolean)
      if (uuids.length === 0 || !boardId) return
      makeRequest({
        apiEndpoint: PostEndpointUrl.BoardCommentMention,
        payload: {
          board_uuid: boardId,
          comment_text: body,
          mentioned_user_uuids: uuids,
        },
        showErrorToast: false,
      }).catch(() => {
        // Notifications are best-effort; the comment is already in the thread.
      })
    },
    [boardId, makeRequest],
  )

  const [comments, setComments] = React.useState<BoardComment[]>([])
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [view, setView] = React.useState<ViewState | null>(null)
  const coordFnsRef = React.useRef<CoordFns | null>(null)
  const overlayRef = React.useRef<HTMLDivElement | null>(null)

  // Load Excalidraw's coordinate helpers once (client-only, package already
  // loaded by the canvas).
  React.useEffect(() => {
    let cancelled = false
    import("@excalidraw/excalidraw").then((mod) => {
      if (cancelled) return
      coordFnsRef.current = {
        sceneToViewport: (p, v) => mod.sceneCoordsToViewportCoords(p, v as never),
        viewportToScene: (p, v) => mod.viewportCoordsToSceneCoords(p, v as never),
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Subscribe to the shared comments map.
  React.useEffect(() => {
    const sync = () => {
      const list = Array.from(yComments.values()) as unknown as BoardComment[]
      list.sort((a, b) => a.createdAt - b.createdAt)
      setComments(list)
    }
    sync()
    yComments.observe(sync)
    return () => yComments.unobserve(sync)
  }, [yComments])

  // Track pan/zoom so pins stay anchored. rAF diffing avoids re-rendering when
  // the view hasn't moved.
  React.useEffect(() => {
    if (!api) return
    let raf = 0
    let prev = ""
    const tick = () => {
      const s = api.getAppState() as unknown as ViewState
      const key = `${s.scrollX},${s.scrollY},${s.zoom.value},${s.offsetLeft},${s.offsetTop}`
      if (key !== prev) {
        prev = key
        setView({
          scrollX: s.scrollX,
          scrollY: s.scrollY,
          zoom: { value: s.zoom.value },
          offsetLeft: s.offsetLeft,
          offsetTop: s.offsetTop,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [api])

  // ---- Yjs mutations (editors only) -------------------------------------
  const writeComment = React.useCallback(
    (c: BoardComment) => {
      yDoc.transact(() => {
        yComments.set(c.id, c as unknown as Record<string, unknown>)
      })
    },
    [yDoc, yComments],
  )

  const addComment = React.useCallback(
    (sceneX: number, sceneY: number, body: string, mentioned: MentionedUser[]) => {
      const id = uid()
      const c: BoardComment = {
        id,
        x: sceneX,
        y: sceneY,
        resolved: false,
        createdAt: Date.now(),
        authorId: user.id,
        authorName: user.name,
        messages: [{ id: uid(), authorId: user.id, authorName: user.name, body, createdAt: Date.now() }],
      }
      writeComment(c)
      setOpenId(id)
      notifyMentions(body, mentioned)
    },
    [user.id, user.name, writeComment, notifyMentions],
  )

  const addReply = React.useCallback(
    (commentId: string, body: string, mentioned: MentionedUser[]) => {
      const cur = yComments.get(commentId) as unknown as BoardComment | undefined
      if (!cur) return
      const next: BoardComment = {
        ...cur,
        messages: [...(cur.messages || []), { id: uid(), authorId: user.id, authorName: user.name, body, createdAt: Date.now() }],
      }
      writeComment(next)
      notifyMentions(body, mentioned)
    },
    [yComments, user.id, user.name, writeComment, notifyMentions],
  )

  const toggleResolved = React.useCallback(
    (commentId: string) => {
      const cur = yComments.get(commentId) as unknown as BoardComment | undefined
      if (!cur) return
      writeComment({ ...cur, resolved: !cur.resolved })
    },
    [yComments, writeComment],
  )

  const deleteComment = React.useCallback(
    (commentId: string) => {
      yDoc.transact(() => {
        yComments.delete(commentId)
      })
      setOpenId((cur) => (cur === commentId ? null : cur))
    },
    [yDoc, yComments],
  )

  const toggleReaction = React.useCallback(
    (commentId: string, messageId: string, emoji: string) => {
      if (!editable) return
      const cur = yComments.get(commentId) as unknown as BoardComment | undefined
      if (!cur) return
      const messages = (cur.messages || []).map((m) => {
        if (m.id !== messageId) return m
        const reactions: Record<string, string[]> = { ...(m.reactions || {}) }
        const users = new Set(reactions[emoji] || [])
        if (users.has(user.id)) users.delete(user.id)
        else users.add(user.id)
        if (users.size === 0) delete reactions[emoji]
        else reactions[emoji] = Array.from(users)
        return { ...m, reactions }
      })
      writeComment({ ...cur, messages })
    },
    [editable, yComments, user.id, writeComment],
  )

  // ---- Placing a new comment --------------------------------------------
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!commentMode || !coordFnsRef.current || !view) return
    const scene = coordFnsRef.current.viewportToScene({ clientX: e.clientX, clientY: e.clientY }, view)
    onCommentModeChange(false)
    // Open a draft pin composer at this location.
    setDraft({ x: scene.x, y: scene.y })
  }

  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null)

  // Escape exits comment-placement mode / closes an open thread or draft, so
  // the user is never stuck in comment mode.
  React.useEffect(() => {
    if (!commentMode && !openId && !draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (commentMode) onCommentModeChange(false)
      setDraft(null)
      setOpenId(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [commentMode, openId, draft, onCommentModeChange])

  // Compute a pin's position within the overlay container.
  const pinPos = React.useCallback(
    (sceneX: number, sceneY: number): { left: number; top: number } | null => {
      if (!coordFnsRef.current || !view) return null
      const vp = coordFnsRef.current.sceneToViewport({ sceneX, sceneY }, view)
      return { left: vp.x - view.offsetLeft, top: vp.y - view.offsetTop }
    },
    [view],
  )

  const open = comments.find((c) => c.id === openId) || null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={cn(
        "absolute inset-0 z-10",
        commentMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
      )}
    >
      {/* Existing pins */}
      {comments.map((c) => {
        const pos = pinPos(c.x, c.y)
        if (!pos) return null
        return (
          <button
            key={c.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpenId((cur) => (cur === c.id ? null : c.id))
            }}
            style={{ left: pos.left, top: pos.top }}
            className={cn(
              "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full rounded-bl-none border shadow-md transition-transform hover:scale-110",
              c.resolved ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
            title={c.resolved ? "Resolved comment" : "Comment"}
          >
            {c.resolved ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
          </button>
        )
      })}

      {/* Open thread popover */}
      {open && (() => {
        const pos = pinPos(open.x, open.y)
        if (!pos) return null
        const cw = overlayRef.current?.clientWidth ?? 0
        const ch = overlayRef.current?.clientHeight ?? 0
        const PANEL_W = 288
        const left = Math.min(Math.max(pos.left + 16, 8), Math.max(8, cw - PANEL_W - 8))
        const top = Math.min(Math.max(pos.top - 8, 8), Math.max(8, ch - 200))
        return (
          <div
            className="pointer-events-auto absolute w-72 rounded-xl border bg-popover/95 shadow-xl backdrop-blur-sm"
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            <CommentThread
              comment={open}
              editable={editable}
              currentUserId={user.id}
              onReply={(body, mentioned) => addReply(open.id, body, mentioned)}
              onResolve={() => toggleResolved(open.id)}
              onDelete={() => deleteComment(open.id)}
              onToggleReaction={(messageId, emoji) => toggleReaction(open.id, messageId, emoji)}
              onClose={() => setOpenId(null)}
            />
          </div>
        )
      })()}

      {/* New-comment draft composer */}
      {draft && (() => {
        const pos = pinPos(draft.x, draft.y)
        if (!pos) return null
        const cw = overlayRef.current?.clientWidth ?? 0
        const PANEL_W = 288
        const left = Math.min(Math.max(pos.left + 16, 8), Math.max(8, cw - PANEL_W - 8))
        const top = Math.max(pos.top - 8, 8)
        return (
          <div
            className="pointer-events-auto absolute w-72 rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-sm"
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            <NewCommentComposer
              onSubmit={(body, mentioned) => {
                addComment(draft.x, draft.y, body, mentioned)
                setDraft(null)
              }}
              onCancel={() => setDraft(null)}
            />
          </div>
        )
      })()}
    </div>
  )
}

function CommentThread({
  comment,
  editable,
  currentUserId,
  onReply,
  onResolve,
  onDelete,
  onToggleReaction,
  onClose,
}: {
  comment: BoardComment
  editable: boolean
  currentUserId: string
  onReply: (body: string, mentioned: MentionedUser[]) => void
  onResolve: () => void
  onDelete: () => void
  onToggleReaction: (messageId: string, emoji: string) => void
  onClose: () => void
}) {
  const [reply, setReply] = React.useState("")
  const [replyMentions, setReplyMentions] = React.useState<MentionedUser[]>([])
  const canManage = editable && comment.authorId === currentUserId

  const submitReply = () => {
    const body = reply.trim()
    if (!body) return
    onReply(body, replyMentions)
    setReply("")
    setReplyMentions([])
  }

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium">{comment.resolved ? "Resolved" : "Comment"}</span>
        <div className="flex items-center gap-1">
          {editable && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResolve} title={comment.resolved ? "Reopen" : "Resolve"}>
              <Check className={cn("h-3.5 w-3.5", comment.resolved && "text-green-600")} />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete">
              <Trash className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {(comment.messages || []).map((m) => (
          <ThreadMessageRow
            key={m.id}
            message={m}
            editable={editable}
            currentUserId={currentUserId}
            onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
          />
        ))}
      </div>

      {editable && (
        <div className="border-t p-2">
          <BoardMentionInput
            value={reply}
            onChange={setReply}
            onMentionedUsersChange={setReplyMentions}
            onSubmit={submitReply}
            placeholder="Reply... (use @ to mention)"
            className="min-h-[44px] resize-none text-sm"
          />
          <div className="mt-1.5 flex justify-end">
            <Button size="sm" disabled={!reply.trim()} onClick={submitReply}>
              Reply
            </Button>
          </div>
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
  onToggleReaction,
}: {
  message: ThreadMessage
  editable: boolean
  currentUserId: string
  onToggleReaction: (emoji: string) => void
}) {
  const relative = useRelativeTime(message.createdAt ? new Date(message.createdAt).toISOString() : null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const reactions = message.reactions || {}
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0)
  return (
    <div className="group/msg flex gap-2">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarFallback className="text-[10px]">{message.authorName?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium">{message.authorName}</span>
          {relative && <span className="text-[10px] text-muted-foreground">{relative}</span>}
        </div>
        <p className="whitespace-pre-wrap break-words text-xs text-foreground/90">{message.body}</p>

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
                    "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                    mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-muted/40 hover:bg-accent/50",
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
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/50 group-hover/msg:opacity-100"
                  title="Add reaction"
                >
                  <SmilePlus className="h-3 w-3" />
                </button>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-0" onClick={() => setPickerOpen(false)} />
                    <div className="absolute z-10 mt-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-lg">
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

function NewCommentComposer({ onSubmit, onCancel }: { onSubmit: (body: string, mentioned: MentionedUser[]) => void; onCancel: () => void }) {
  const [body, setBody] = React.useState("")
  const [mentions, setMentions] = React.useState<MentionedUser[]>([])

  const submit = () => {
    const text = body.trim()
    if (!text) return
    onSubmit(text, mentions)
  }

  return (
    <div>
      <BoardMentionInput
        value={body}
        onChange={setBody}
        onMentionedUsersChange={setMentions}
        onSubmit={submit}
        onCancel={onCancel}
        autoFocus
        placeholder="Add a comment... (use @ to mention)"
        className="min-h-[60px] resize-none text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!body.trim()} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  )
}

export default BoardComments
