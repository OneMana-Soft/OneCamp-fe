"use client"

// ---------------------------------------------------------------------------
// BoardComments: Miro-style pinned comments on the canvas.
//
// Comments live in the SAME Yjs document as the drawing (a Y.Map "comments"),
// so they sync in real time and persist with the board. Editors write them
// there; a commenter's go through the server (lib/board/commentServer), the
// board being read-only for them; viewers read them. The writes are the
// caller's (miro-33): the board page's member writes (boardCommentWrites), or a
// board link's guest's ask with their link, so a guest carries no member code. Each is a pin at a scene
// coordinate with a small message thread + a resolved flag.
//
// Pins are an HTML overlay positioned from Excalidraw's scene<->viewport
// transforms, kept in sync with pan/zoom by useBoardView.
// ---------------------------------------------------------------------------

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { useBoardView } from "@/hooks/useBoardView"
import { clientToScene, sceneToLocal } from "@/lib/board/viewport"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Button } from "@/components/ui/button"
import { useSheetMode } from "@/components/ui/overlayMode"
import { SHEET_FOOTER_ROW } from "@/components/ui/sheetRows"
import { Check } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { onEscape } from "@/lib/keys/onEscape"
import { BoardMentionInput, type MentionedUser } from "@/components/board/boardMentionInput"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { CommentFace } from "@/components/board/commentFace"
import type { CommentAsk } from "@/lib/board/commentServer"

// A pin's thread, a piece of its own (fetched once the board shows a pin). Like the board's other pieces it keeps
// lazyPiece's own failure (a deploy reloads the page; otherwise it asks again online or when next drawn): a `failed` row here would put
// PieceUnavailable in the board's first load, and Turbopack then re-splits the app layout's chunk for every route.
const CommentThread = lazyPiece(() => import("@/components/board/boardCommentThread"))
// A phone's sheet for the thread and a new comment, from the shared sheet's chunk (components/ui/responsive-sheet),
// which holds the drawer: this file and the thread reach no drawer, so the guest board's comments piece (miro-33)
// opens no chunk group holding it, and the app layout's shell keeps its chunks (WZ39K trace, 16 Nov). Warmed while
// a phone shows pins or places one, so a sheet opens at once.
export const CommentSheet = lazyPiece(() => import("@/components/ui/responsive-sheet").then((m) => ({ default: m.DrawnSheet })))

export interface ThreadMessage {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: number
  reactions?: Record<string, string[]> // emoji -> userIds
}

export interface BoardComment {
  id: string
  x: number
  y: number
  resolved: boolean
  createdAt: number
  authorId: string
  authorName: string
  messages: ThreadMessage[]
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/**
 * The comments' writes, from the caller (miro-33): the board page's member writes (boardCommentWrites: usePost, the
 * mirror, the server's ask, the people search), or a board link's guest's ask with their link, mentioning no one.
 */
export interface CommentWrites {
  /** An editor's comment mirrored into search and activity (best effort); a guest's has no mirror. */
  syncComment?: (c: BoardComment, mentioned: MentionedUser[]) => Promise<unknown>
  deleteCommentMirror?: (id: string) => Promise<unknown>
  /** A commenter's comment asked of the server: the answer, or nothing once it wasn't taken (said by the writer). */
  ask: (c: CommentAsk) => Promise<{ id?: string } | undefined>
  /** The workspace's people on "@" (a member's); a guest mentions no one. */
  findPeople?: React.ComponentProps<typeof BoardMentionInput>["findPeople"]
  /** Fetches the server's part ahead of a comment (a member's). */
  warm?: () => void
}

const unmirrored = async () => undefined

export interface BoardCommentsProps {
  provider: HocuspocusProvider
  api: ExcalidrawImperativeAPI | null
  user: { id: string; name: string }
  writes: CommentWrites
  editable: boolean
  /** May comment, not edit (miro-32): through the server. */
  commenter?: boolean
  /** Controlled comment-placement mode (toggle lives in the page chrome). */
  commentMode: boolean
  onCommentModeChange: (on: boolean) => void
  /** Show resolved pins (faded, with a moss check); hidden otherwise. */
  showResolved?: boolean
}

function BoardComments({ provider, api, user, writes, editable, commenter = false, commentMode, onCommentModeChange, showResolved = false }: BoardCommentsProps) {
  const yDoc = provider.document
  const yComments = React.useMemo(() => yDoc.getMap<Record<string, unknown>>("comments"), [yDoc])

  const { syncComment = unmirrored, deleteCommentMirror = unmirrored, ask, findPeople, warm } = writes
  // The box finds people with the caller's search: a member's; a guest's box says nothing of mentions.
  const Mention = React.useMemo<typeof BoardMentionInput>(
    () => (findPeople ? function PeopleMentionInput(p) { return <BoardMentionInput {...p} findPeople={findPeople} /> } : BoardMentionInput),
    [findPeople],
  )

  const [comments, setComments] = React.useState<BoardComment[]>([])
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null)
  React.useEffect(() => {
    if (commentMode || openId) warm?.()
  }, [commentMode, openId, warm])
  const pins = comments.length > 0
  React.useEffect(() => {
    if (pins) CommentThread.warm()
  }, [pins])
  // Where the board is looking, only while there is something to place on
  // it: pins, an open thread, a draft, or a click to place a new one.
  const view = useBoardView(api, comments.length > 0 || commentMode || !!openId || !!draft)
  const overlayRef = React.useRef<HTMLDivElement | null>(null)

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
      if (commenter)
        return ask({ action: "add", x: sceneX, y: sceneY, text: body, mentioned }).then((taken) => {
          if (taken?.id) setOpenId(taken.id)
          return taken
        })
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
      syncComment(c, mentioned)
    },
    [commenter, ask, user.id, user.name, writeComment, syncComment],
  )

  const addReply = React.useCallback(
    (commentId: string, body: string, mentioned: MentionedUser[]) => {
      if (commenter) return ask({ action: "reply", id: commentId, text: body, mentioned })
      const cur = yComments.get(commentId) as unknown as BoardComment | undefined
      if (!cur) return
      const next: BoardComment = {
        ...cur,
        messages: [...(cur.messages || []), { id: uid(), authorId: user.id, authorName: user.name, body, createdAt: Date.now() }],
      }
      writeComment(next)
      syncComment(next, mentioned)
    },
    [commenter, ask, yComments, user.id, user.name, writeComment, syncComment],
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
      deleteCommentMirror(commentId)
      setOpenId((cur) => (cur === commentId ? null : cur))
    },
    [yDoc, yComments, deleteCommentMirror],
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
    if (!commentMode || !view) return
    const scene = clientToScene(view, e.clientX, e.clientY)
    onCommentModeChange(false)
    // Open a draft pin composer at this location.
    setDraft({ x: scene.x, y: scene.y })
  }

  // Escape exits comment-placement mode / closes an open thread or draft, so
  // the user is never stuck in comment mode.
  React.useEffect(() => {
    if (!commentMode && !openId && !draft) return
    return onEscape("overlay", () => {
      if (commentMode) onCommentModeChange(false)
      setDraft(null)
      setOpenId(null)
    })
  }, [commentMode, openId, draft, onCommentModeChange])

  // Compute a pin's position within the overlay container.
  const pinPos = React.useCallback(
    (sceneX: number, sceneY: number): { left: number; top: number } | null => {
      if (!view) return null
      return sceneToLocal(view, sceneX, sceneY)
    },
    [view],
  )

  const open = comments.find((c) => c.id === openId) || null
  // A phone (useSheetMode, which alone decides): the thread and a new comment are the app's sheets, from the
  // bottom edge, what they hold in the sheet's one scroller and the reply or Comment pinned at its foot (miro-40
  // H1). A computer keeps the cards at the pin.
  const sheet = useSheetMode()
  React.useEffect(() => {
    if (sheet && (pins || commentMode)) CommentSheet.warm()
  }, [sheet, pins, commentMode])

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      // A layer a finger meets over the canvas: it steps behind a phone's style sheet (excalidrawTheme.css).
      data-canvas-layer=""
      className={cn(
        "absolute inset-0 z-10",
        commentMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
      )}
    >
      {/* Existing pins: a teardrop holding the author's face, pointing at
          the spot (its bottom-left corner). Resolved ones fade, wear a moss
          check, and hide unless "Show resolved" is on. */}
      {comments.map((c) => {
        if (c.resolved && !showResolved && c.id !== openId) return null
        const pos = pinPos(c.x, c.y)
        if (!pos) return null
        return (
          <button
            key={c.id}
            type="button"
            data-board-pin=""
            onClick={(e) => {
              e.stopPropagation()
              setOpenId((cur) => (cur === c.id ? null : c.id))
            }}
            style={{ left: pos.left, top: pos.top - 28 }}
            className={cn(
              "pointer-events-auto absolute flex size-7 items-center justify-center rounded-[14px] rounded-bl-[4px] bg-pop shadow-e2 outline-none transition-transform duration-[140ms] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand",
              c.resolved && "opacity-60",
              openId === c.id && "ring-2 ring-brand",
            )}
            aria-label={`${c.resolved ? "Resolved comment" : "Comment"} by ${c.authorName}`}
            title={c.resolved ? "Resolved comment" : c.authorName}
          >
            <CommentFace name={c.authorName} className="size-[22px] rounded-[11px]" />
            {c.resolved ? (
              <span className="absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-[7px] bg-camp-moss text-white ring-2 ring-pop">
                <Check className="size-2.5" />
              </span>
            ) : null}
          </button>
        )
      })}

      {/* Open thread popover */}
      {open && <React.Suspense>{(() => {
        const thread = (
          <CommentThread
            sheet={sheet}
            comment={open}
            editable={editable}
            currentUserId={user.id}
            onReply={editable || commenter ? (body, mentioned) => addReply(open.id, body, mentioned) : undefined}
            onDeleteMessage={commenter ? (message) => ask({ action: "delete", id: open.id, message }) : undefined}
            onResolve={() => toggleResolved(open.id)}
            onDelete={() => deleteComment(open.id)}
            onToggleReaction={(messageId, emoji) => toggleReaction(open.id, messageId, emoji)}
            onClose={() => setOpenId(null)}
            Mention={Mention}
            useWhen={useRelativeTime}
            useAsking={useAsking}
            Sheet={CommentSheet}
          />
        )
        if (sheet) return thread
        const pos = pinPos(open.x, open.y)
        if (!pos) return null
        const cw = overlayRef.current?.clientWidth ?? 0
        const ch = overlayRef.current?.clientHeight ?? 0
        const PANEL_W = 320
        const left = Math.min(Math.max(pos.left + 16, 8), Math.max(8, cw - PANEL_W - 8))
        const top = Math.min(Math.max(pos.top - 8, 8), Math.max(8, ch - 200))
        return (
          <div
            className="content-float pointer-events-auto absolute w-80 rounded-xl bg-pop text-ink shadow-e3"
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            {thread}
          </div>
        )
      })()}</React.Suspense>}

      {/* New-comment draft composer */}
      {draft && (() => {
        const composer = (
          <NewCommentComposer
            sheet={sheet}
            Mention={Mention}
            onSubmit={(body, mentioned) => addComment(draft.x, draft.y, body, mentioned)}
            onClose={() => setDraft((d) => (d === draft ? null : d))}
          />
        )
        if (sheet) return composer
        const pos = pinPos(draft.x, draft.y)
        if (!pos) return null
        const cw = overlayRef.current?.clientWidth ?? 0
        const PANEL_W = 320
        const left = Math.min(Math.max(pos.left + 16, 8), Math.max(8, cw - PANEL_W - 8))
        const top = Math.max(pos.top - 8, 8)
        return (
          <div
            className="content-float pointer-events-auto absolute w-80 rounded-xl bg-pop p-3 text-ink shadow-e3"
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            {composer}
          </div>
        )
      })()}
    </div>
  )
}

/**
 * What a comment's ask hands back (miro-32): nothing for an editor's, the board's at once; a commenter's waits on the
 * server: its answer, or nothing once it wasn't taken.
 */
export type Asked = void | Promise<{ id?: string } | undefined>

/**
 * A box or button whose ask may wait on the server (miro-32): busy until the answer, a second press asking nothing;
 * `done` once it's taken; refused or not sent, the words stay and the focus goes back to `field`.
 */
export function useAsking(field?: React.RefObject<HTMLTextAreaElement | null>) {
  const [busy, setBusy] = React.useState(false)
  const send = (asked: Asked, done?: () => void) => {
    if (busy) return
    if (!asked) return done?.()
    setBusy(true)
    void asked.then((taken) => {
      setBusy(false)
      if (taken) done?.()
      else field?.current?.focus()
    })
  }
  return { busy, send }
}

function NewCommentComposer({
  sheet = false,
  Mention = BoardMentionInput,
  onSubmit,
  onClose,
}: {
  Mention?: typeof BoardMentionInput
  /** The app's sheet (a phone): the words in its one scroller, Cancel and Comment pinned at its foot. */
  sheet?: boolean
  onSubmit: (body: string, mentioned: MentionedUser[]) => Asked
  /** Cancel, or the comment taken. */
  onClose: () => void
}) {
  const [body, setBody] = React.useState("")
  const [mentions, setMentions] = React.useState<MentionedUser[]>([])
  const field = React.useRef<HTMLTextAreaElement>(null)
  const { busy, send } = useAsking(field)

  const submit = () => {
    const text = body.trim()
    if (text) send(onSubmit(text, mentions), onClose)
  }

  const words = (
    <Mention
      value={body}
      onChange={setBody}
      onMentionedUsersChange={setMentions}
      onSubmit={submit}
      onCancel={onClose}
      inputRef={field}
      autoFocus
      placeholder="Add a comment…"
      className="min-h-[60px] resize-none text-sm"
    />
  )
  const actions = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Cancel
      </Button>
      <Button size="sm" disabled={!body.trim()} busy={busy} onClick={submit}>
        Comment
      </Button>
    </>
  )

  if (sheet) {
    return (
      <React.Suspense fallback={null}>
        <CommentSheet
          data-board-comment=""
          title={<p className="text-heading text-ink">New comment</p>}
          footer={<div className={SHEET_FOOTER_ROW}>{actions}</div>}
          onClose={onClose}
        >
          <div className="px-4 pb-2 pt-1">{words}</div>
        </CommentSheet>
      </React.Suspense>
    )
  }

  return (
    <div role="group" aria-label="New comment">
      {words}
      <div className="mt-2 flex justify-end gap-2">{actions}</div>
    </div>
  )
}

export default BoardComments
