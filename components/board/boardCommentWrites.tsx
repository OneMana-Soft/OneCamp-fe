"use client"

// The board page's comments (miro-33): BoardComments with a member's writes. An editor's comment is mirrored into
// search and activity (best effort), a commenter's is asked of the server, and "@" finds the workspace's people, all
// through usePost. The board page renders MemberBoardComments; a board link's guest's piece hands BoardComments the
// link's ask instead, so the guest downloads none of this (usePost and the endpoints table stay the members').
// The server's part is a chunk of its own (lib/board/commentServer), fetched once comment mode or a thread opens.

import * as React from "react"
import { usePost } from "@/hooks/usePost"
import { toast } from "@/hooks/use-toast"
import { lazyChunk } from "@/lib/loadChunk"
import { BoardsPost } from "@/services/endpoints/boards"
import type { UserProfileDataInterface } from "@/types/user"
import type { CommentAsk } from "@/lib/board/commentServer"
import BoardComments, { type BoardCommentsProps, type CommentWrites } from "@/components/board/boardComments"

type CommentServer = typeof import("@/lib/board/commentServer")
const server = lazyChunk(() => import("@/lib/board/commentServer"))

/** A member's writes for the board `boardId`: the server's answer, or nothing once it wasn't taken, said here. */
export function useMemberCommentWrites(boardId: string): CommentWrites {
  const { makeRequest } = usePost()
  return React.useMemo(() => {
    const serve = <R,>(said: (cause: unknown) => void, go: (m: CommentServer) => Promise<R> | undefined) =>
      server.use(said).then((m) => (m && boardId ? go(m) : undefined)).catch(() => undefined)
    return {
      syncComment: (c, mentioned) => serve(console.warn, (m) => m.mirrorComment(makeRequest, boardId, c, mentioned)),
      deleteCommentMirror: (id) => serve(console.warn, (m) => m.unmirrorComment(makeRequest, boardId, id)),
      ask: (c: CommentAsk) => {
        const title = c.action === "delete" ? "Your message wasn't deleted" : "Your comment wasn't posted"
        const said = () => toast({ variant: "destructive", title, description: "Check your connection and try again." })
        return serve(said, (m) => m.askComment(makeRequest, boardId, c, title).then((id) => ({ id })))
      },
      findPeople: (searchText) =>
        makeRequest<{ searchText: string }, UserProfileDataInterface[]>({ apiEndpoint: BoardsPost.SearchUserForBoard, payload: { searchText } }),
      warm: () => server.warm(),
    }
  }, [boardId, makeRequest])
}

/** The board page's comments: BoardComments with the member's writes for `boardId` (used to mirror @mentions into activity). */
export function MemberBoardComments({ boardId, ...props }: Omit<BoardCommentsProps, "writes"> & { boardId: string }) {
  return <BoardComments {...props} writes={useMemberCommentWrites(boardId)} />
}
