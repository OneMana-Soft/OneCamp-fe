"use client"

/**
 * A comment or edit link's guest's comments on a shared board (miro-33): the
 * board's own pins (components/board/boardComments), as someone who comments
 * through the server with their link (its live token says who they are, as
 * "Guest: <name>"), mentioning no one, and a Comment button to place one. An
 * edit link's guest writes their pins on the board as an editor does. A view
 * link never loads this piece: it has no comment box.
 */

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import BoardComments from "@/components/board/boardComments"
import { ChromeCluster, ClusterButton } from "@/components/board/chromeCluster"
import type { CommentAsk } from "@/lib/board/commentServer"
import { MessageSquare } from "@/lib/icons"

export default function GuestBoardComments({ provider, api, user, editable, ask }: {
  provider: HocuspocusProvider
  api: ExcalidrawImperativeAPI
  user: { id: string; name: string }
  editable: boolean
  ask: (c: CommentAsk) => Promise<{ id?: string } | undefined>
}) {
  const [placing, setPlacing] = React.useState(false)
  // The link's ask, and nothing of a member's: no mirror, no people to mention (miro-33).
  const writes = React.useMemo(() => ({ ask }), [ask])
  return (
    <>
      <ChromeCluster label="Comments" className="absolute bottom-3 left-3 z-30">
        <ClusterButton label={placing ? "Stop placing a comment" : "Comment"} active={placing} onClick={() => setPlacing((on) => !on)}>
          <MessageSquare className="size-4" aria-hidden="true" />
        </ClusterButton>
      </ChromeCluster>
      <BoardComments
        provider={provider}
        api={api}
        user={user}
        editable={editable}
        commenter={!editable}
        commentMode={placing}
        onCommentModeChange={setPlacing}
        writes={writes}
      />
    </>
  )
}
