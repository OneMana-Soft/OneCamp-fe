"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { followHref, refreshEntity, useLiveEntity } from "@/lib/liveEntity"
import { boardAttachmentURL } from "@/lib/board/attachmentURL"
import { ArrowUpRight, Presentation } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { EmbedFrame, embedNote, loadFailedWords, type EmbedWords } from "../task-list-embed/embedFrame"
import type { BoardChipData } from "./boardKind"
import "./boardKind"

// The live canvas (Excalidraw), read-only: loaded once a block has a board to show.
const GuestBoardViewer = lazyPiece(() => import("@/components/guest/GuestBoardViewer").then((m) => ({ default: m.GuestBoardViewer })))

const WORDS: EmbedWords = {
  guest: "A whiteboard shows here for people in the workspace.",
  none: "You can't see this whiteboard. Ask someone on it to add you.",
  gone: "This whiteboard was deleted.",
  failed: loadFailedWords("whiteboard"),
}

/** The canvas's height: shorter on a phone, so the doc around it stays in view. */
const STAGE = "h-[320px] sm:h-[440px]"

/**
 * A whiteboard in a doc (miro-34, "/whiteboard"): the board itself, live, as
 * the reader may see it, read-only (the collaboration server has the last
 * word: a member who can't edit joins read-only). The canvas stays still
 * until the reader asks to look around, so a doc scrolls past it on a wheel
 * or a finger; Escape, or moving on, stills it again. Someone who can't open
 * the board reads that they can't see it, never its name; a guest reads only
 * that a whiteboard shows here.
 */
export function WhiteboardEmbedView({ node, editor, selected }: NodeViewProps) {
  const boardId: string = node.attrs.boardId || ""
  const guest = useGuestReader()
  const board = useLiveEntity<BoardChipData>("board", guest || !boardId ? null : boardId)
  const router = useAppRouter()
  const [looking, setLooking] = React.useState(false)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const ok = board.state === "ok"
  const href = `/app/board/${boardId}`
  // Its pictures come by the reader's own access, as on the board's page.
  const pictureURL = React.useCallback((objectUuid: string) => boardAttachmentURL(boardId, objectUuid), [boardId])

  const head = (
    <>
      <Presentation className="size-4 text-ink-3" aria-hidden="true" />
      <span className="min-w-0 truncate font-[510] text-ink">{guest || !ok ? "Whiteboard" : `${board.data?.title || "Untitled board"} · Whiteboard`}</span>
      <span className="flex-1" />
      {ok ? (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault()
            followHref(href, e, router.push)
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-meta text-ink-2 hover:bg-hover hover:text-ink"
        >
          Open board
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </>
  )

  const skeleton = <div aria-hidden="true" className={cn(STAGE, "animate-pulse bg-sunken motion-reduce:animate-none")} />
  const body =
    embedNote({
      guest,
      missing: !boardId,
      read: { state: board.state, failed: board.state === "error", retry: () => refreshEntity("board", boardId), loading: board.state === "loading", ready: ok },
      words: WORDS,
      skeleton,
    }) ?? (
      <div
        ref={stageRef}
        data-whiteboard-stage=""
        data-looking={String(looking)}
        data-escape-own={looking ? "" : undefined}
        // Takes the focus from Look around, which goes: Escape is heard here, and leaving stills it.
        tabIndex={-1}
        className={cn("relative outline-none", STAGE)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !looking) return
          e.stopPropagation()
          setLooking(false)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLooking(false)
        }}
      >
        {/*
          The canvas's own layers stack inside it (isolate), so what follows is drawn over them: the ring and Look
          around. Still, it is inert too: no pointer, no focus, nothing a screen reader walks into but Look around.
        */}
        <div className={cn("absolute inset-0 isolate", !looking && "pointer-events-none")} inert={!looking}>
          <React.Suspense fallback={skeleton}>
            <GuestBoardViewer documentName={`board:${boardId}`} boardId={boardId} token="" imageURL={pictureURL} quiet />
          </React.Suspense>
        </div>
        {looking ? (
          <div aria-hidden="true" data-whiteboard-ring="" className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-brand" />
        ) : (
          <button
            type="button"
            onClick={() => {
              setLooking(true)
              stageRef.current?.focus({ preventScroll: true })
            }}
            aria-label="Look around the whiteboard"
            className="absolute inset-0 flex items-end justify-center pb-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <span className="rounded-md bg-raised px-3 py-1 text-meta text-ink-2 shadow-e1">Look around</span>
          </button>
        )}
      </div>
    )

  return (
    <NodeViewWrapper data-whiteboard-embed="">
      <EmbedFrame selected={drawnSelected(editor, selected)} head={head}>
        {body}
      </EmbedFrame>
    </NodeViewWrapper>
  )
}
