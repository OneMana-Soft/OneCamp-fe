"use client"

/**
 * Pick a board, for what it is picked for (PURPOSES), most recently edited
 * first, with a search. A dialog on a computer, the shared sheet on a phone
 * (ResponsiveDialog). Loaded when first opened.
 * - "present" (calls package B): the boards you may edit, and New board. The
 *   server presents only a board its presenter may edit (board_not_editable),
 *   so the list asks for those alone (GET /board/getBoardList?editable=1). New
 *   board asks the call for one (new_board): the server makes it, shares it
 *   with the call's conversation and puts it on the stage.
 * - "show" (a doc's "/whiteboard", miro-34): every board you can open, since
 *   the doc shows it read-only, to whoever else can open it too.
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

export type BoardPurpose = "present" | "show"

const PURPOSES: Record<BoardPurpose, { title: string; description: string; editable: boolean; search: string; none: string; noneMatch: string; noneHint: string }> = {
  present: {
    title: "Present a board",
    description: "Everyone in the call sees it on the stage.",
    editable: true,
    search: "Search boards you can edit",
    none: "No boards you can edit yet",
    noneMatch: "No boards you can edit match",
    noneHint: "Make a new one to draw on together.",
  },
  show: {
    title: "Show a whiteboard",
    description: "It stays live in the doc, for whoever can open the board.",
    editable: false,
    search: "Search boards",
    none: "No boards yet",
    noneMatch: "No boards match",
    noneHint: "Boards you make or are added to show here.",
  },
}

/** One board to pick: its name, and when it was last changed. */
function BoardRow({ board, onPick }: { board: BoardListItem; onPick: (board: string, title: string) => void }) {
  const edited = useRelativeTime(board.board_updated_at ?? null)
  return (
    <button type="button" onClick={() => onPick(board.board_uuid, board.board_title || "Untitled board")} {...ix("row")} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left">
      <Presentation className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-ui font-medium text-ink">{board.board_title || "Untitled board"}</span>
        {edited ? <span className="text-meta text-ink-3">Edited {edited}</span> : null}
      </span>
    </button>
  )
}

export default function BoardPicker({
  purpose = "present",
  onPick,
  onNew,
  onClose,
}: {
  purpose?: BoardPurpose
  onPick: (board: string, title: string) => void
  /** New board, where the purpose makes one (a call's stage). */
  onNew?: () => void
  onClose: () => void
}) {
  const words = PURPOSES[purpose]
  const [search, setSearch] = React.useState("")
  const term = useDebounce(search, 350)
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(
    `${BoardsGet.GetBoardList}?${words.editable ? "editable=1&" : ""}pageSize=30&pageIndex=0${term ? `&search=${encodeURIComponent(term)}` : ""}`,
    undefined,
    undefined,
    OWN_ERRORS,
  )
  const boards = data?.data?.boards ?? []

  const pick = (board: string, title: string) => {
    onClose()
    onPick(board, title)
  }
  const makeNew = () => {
    onClose()
    onNew?.()
  }
  return (
    <ResponsiveDialog
      title={words.title}
      description={words.description}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {onNew ? (
            <Button onClick={makeNew} className="gap-1.5">
              <Plus aria-hidden />
              New board
            </Button>
          ) : null}
        </>
      }
    >
      <SearchInput value={search} onValueChange={setSearch} aria-label={words.search} placeholder={words.search} />
      <div className="mt-3 flex max-h-[min(50vh,420px)] flex-col gap-0.5 overflow-y-auto">
        {isError ? (
          <ErrorState subject="your boards" onRetry={() => void mutate()} compact />
        ) : isLoading && !data ? (
          <ListSkeleton rows={4} showAvatar={false} />
        ) : boards.length === 0 ? (
          <EmptyState
            title={term ? `${words.noneMatch} “${term}”` : words.none}
            description={words.noneHint}
            headingLevel={3}
          />
        ) : (
          boards.map((b) => <BoardRow key={b.board_uuid} board={b} onPick={pick} />)
        )}
      </div>
    </ResponsiveDialog>
  )
}
