"use client"

/**
 * Present a board (calls package B): the boards you may edit, most recently
 * edited first, with a search, and New board. The server presents only a
 * board its presenter may edit (board_not_editable), so the list asks for
 * those alone (GET /board/getBoardList?editable=1). New board asks the call
 * for one (new_board): the server makes it, shares it with the call's
 * conversation and puts it on the stage. A dialog on a computer, the shared
 * sheet on a phone (ResponsiveDialog). Loaded when first opened.
 */

import * as React from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SearchInput } from "@/components/ui/search-input"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { useDebounce } from "@/hooks/useDebounce"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ix } from "@/lib/ui/interactive"
import { Plus, Presentation } from "@/lib/icons"
import { BoardsGet } from "@/services/endpoints/boards"
import type { BoardListItem, BoardListResponse } from "@/types/board"

/** One board to present: its name, and when it was last changed. */
function BoardRow({ board, onPick }: { board: BoardListItem; onPick: (board: string) => void }) {
  const edited = useRelativeTime(board.board_updated_at ?? null)
  return (
    <button type="button" onClick={() => onPick(board.board_uuid)} {...ix("row")} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left">
      <Presentation className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-ui font-medium text-ink">{board.board_title || "Untitled board"}</span>
        {edited ? <span className="text-meta text-ink-3">Edited {edited}</span> : null}
      </span>
    </button>
  )
}

export default function BoardPicker({ onPick, onNew, onClose }: { onPick: (board: string) => void; onNew: () => void; onClose: () => void }) {
  const [search, setSearch] = React.useState("")
  const term = useDebounce(search, 350)
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(
    `${BoardsGet.GetBoardList}?editable=1&pageSize=30&pageIndex=0${term ? `&search=${encodeURIComponent(term)}` : ""}`,
    undefined,
    undefined,
    OWN_ERRORS,
  )
  const boards = data?.data?.boards ?? []

  const pick = (board: string) => {
    onClose()
    onPick(board)
  }
  const makeNew = () => {
    onClose()
    onNew()
  }
  return (
    <ResponsiveDialog
      title="Present a board"
      description="Everyone in the call sees it on the stage."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={makeNew} className="gap-1.5">
            <Plus aria-hidden />
            New board
          </Button>
        </>
      }
    >
      <SearchInput value={search} onValueChange={setSearch} aria-label="Search boards you can edit" placeholder="Search boards you can edit" />
      <div className="mt-3 flex max-h-[min(50vh,420px)] flex-col gap-0.5 overflow-y-auto">
        {isError ? (
          <ErrorState subject="your boards" onRetry={() => void mutate()} compact />
        ) : isLoading && !data ? (
          <ListSkeleton rows={4} showAvatar={false} />
        ) : boards.length === 0 ? (
          <EmptyState
            title={term ? `No boards you can edit match “${term}”` : "No boards you can edit yet"}
            description="Make a new one to draw on together."
            headingLevel={3}
          />
        ) : (
          boards.map((b) => <BoardRow key={b.board_uuid} board={b} onPick={pick} />)
        )}
      </div>
    </ResponsiveDialog>
  )
}
