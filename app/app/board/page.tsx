"use client";

// The boards list (content.md B01 and B02). A 1040 px page: the title, a count,
// a search pill and the one primary; then cards on a dot grid that read as
// boards even before they have a picture. With no boards yet, the page offers
// the five templates as illustrated cards, drawn from their real layouts, so a
// first board starts with a move instead of a blank canvas.

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { usePost } from "@/hooks/usePost";
import { useFetch } from "@/hooks/useFetch";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { useDebounce } from "@/hooks/useDebounce";
import { PostEndpointUrl } from "@/services/endPoints";
import { BoardsGet } from "@/services/endpoints/boards";
import { BoardInfoInterface, BoardListResponse } from "@/types/board";
import { addUserBoard } from "@/store/slice/userSlice";
import { app_board_path } from "@/types/paths";
import { Button } from "@/components/ui/button";
import { busyWith } from "@/lib/ui/busyWith";
import { SearchInput } from "@/components/ui/search-input";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, Lock, Users } from "@/lib/icons";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotSearch } from "@/components/ui/graphics/spots";
import { NotesFallback } from "@/components/board/notesFallback";
import dynamic from "next/dynamic";

// The first visit's templates: loaded only for a workspace with no boards.
const BoardsWelcome = dynamic(() => import("@/components/board/boardsWelcome"), { ssr: false });

/** What a new board may start from: one of the templates, by id and name. */
type StartFrom = { id: string; name: string };

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-4";

function BoardsPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { makeRequest, isSubmitting } = usePost();
  const [creating, setCreating] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 350);

  const listUrl = `${BoardsGet.GetBoardList}?pageSize=60&pageIndex=0${
    debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
  }`;
  // The page shows a failed load itself, with Try again: no second, toast-borne copy.
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(listUrl, undefined, undefined, OWN_ERRORS);
  const boards = data?.data?.boards || [];
  const count = data?.data?.count || boards.length;

  // A new board, blank or from a template. The template is laid on the canvas
  // once the board opens (the board page reads ?template=).
  const createBoard = React.useCallback(
    (template?: StartFrom) => {
      if (isSubmitting || creating) return;
      setCreating(template?.id ?? "blank");
      makeRequest<{ board_title: string; board_private: boolean }, BoardInfoInterface>({
        payload: { board_title: template ? template.name : "Untitled board", board_private: true },
        apiEndpoint: PostEndpointUrl.CreateBoard,
      })
        .then((res) => {
          if (res?.board_uuid) {
            dispatch(addUserBoard({ board: { board_uuid: res.board_uuid, board_title: res.board_title || "Untitled board" } }));
            router.push(`${app_board_path}/${res.board_uuid}${template ? `?template=${template.id}` : ""}`);
          } else setCreating(null);
        })
        .catch(() => setCreating(null));
    },
    [makeRequest, isSubmitting, creating, dispatch, router],
  );

  // B makes a board, as the button's hint says, when nothing else has focus.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      createBoard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createBoard]);

  const showEmpty = !isLoading && !isError && boards.length === 0;
  const firstRun = showEmpty && !debouncedSearch;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-10 pt-5 sm:px-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center gap-3 sm:min-h-14">
          <div className="min-w-0 flex-1">
            <h1 className="text-title-1 text-ink">Boards</h1>
            {!isLoading && !isError && boards.length > 0 ? (
              <p className="mt-0.5 text-ui text-ink-2">
                {count} {count === 1 ? "board" : "boards"}
              </p>
            ) : null}
          </div>
          {!firstRun ? (
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search boards" aria-label="Search boards" className="sm:w-60" />
          ) : null}
          <Button size="sm" onClick={() => createBoard()} {...busyWith(creating, "blank")} className="shrink-0 gap-1.5 max-sm:hidden">
            <Plus className="size-3.5" />
            New board
            <span className="kbd" aria-hidden="true">
              B
            </span>
          </Button>
        </div>

        {isLoading ? (
          <div role="status" aria-label="Loading boards" className={GRID}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-[188px] flex-col overflow-hidden rounded-xl bg-raised shadow-e1 sm:h-[212px]">
                <div className="dot-ground h-[124px] sm:h-[148px]" />
                <div className="flex flex-1 flex-col justify-center gap-2 px-3.5">
                  <span className="h-3 w-2/3 animate-shimmer rounded-[4px] bg-press" />
                  <span className="h-2.5 w-1/3 animate-shimmer rounded-[4px] bg-press" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState subject="your boards" onRetry={() => void mutate()} />
        ) : showEmpty ? (
          debouncedSearch ? (
            <EmptyState illustration={<SpotSearch />} title={`No boards match “${debouncedSearch}”.`} />
          ) : (
            <BoardsWelcome onPick={createBoard} creating={creating} />
          )
        ) : (
          <div className={GRID}>
            {boards.map((b, i) => (
              <BoardCard
                key={b.board_uuid}
                index={i}
                uuid={b.board_uuid}
                title={b.board_title}
                isPrivate={b.board_private}
                thumbnailKey={b.board_thumbnail_key}
                updatedAt={b.board_updated_at}
                href={`${app_board_path}/${b.board_uuid}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCard({
  uuid,
  title,
  isPrivate,
  thumbnailKey,
  updatedAt,
  href,
  index,
}: {
  uuid: string;
  title: string;
  isPrivate?: boolean;
  thumbnailKey?: string;
  updatedAt?: string;
  href: string;
  index: number;
}) {
  const relative = useRelativeTime(updatedAt || null);
  const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
  const thumbUrl = thumbnailKey ? `${baseUrl}${BoardsGet.GetBoardAttachment}/${uuid}/${thumbnailKey}` : "";
  const [thumbFailed, setThumbFailed] = React.useState(false);
  const picture = !!thumbUrl && !thumbFailed;
  return (
    // A link, so a board opens from the keyboard and in a new tab, and is
    // fetched ahead.
    <Link
      href={href}
      data-board-uuid={uuid}
      aria-label={`${title}${relative ? `, edited ${relative}` : ""}`}
      className="content-rise group/card hover-lift flex h-[188px] flex-col overflow-hidden rounded-xl bg-raised text-left shadow-e1 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet sm:h-[212px]"
      style={{ ["--i" as string]: index }}
    >
      <div className="dot-ground relative h-[124px] shrink-0 overflow-hidden sm:h-[148px]">
        <div className="absolute inset-0 transition-transform duration-[240ms] ease-[var(--ease-out)] group-hover/card:scale-[1.03] motion-reduce:group-hover/card:scale-100">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt=""
              width={480}
              height={270}
              className="size-full object-contain p-3 mix-blend-multiply dark:mix-blend-normal"
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <NotesFallback seed={uuid} />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3.5">
        <span className="truncate text-ui font-medium text-ink">{title}</span>
        <span className="flex items-center gap-1.5 text-meta text-ink-3">
          <span className="min-w-0 flex-1 truncate">{relative ? `Edited ${relative}` : isPrivate ? "Private" : "Shared"}</span>
          {isPrivate ? <Lock className="size-3.5 shrink-0" aria-label="Private" /> : <Users className="size-3.5 shrink-0" aria-label="Shared" />}
        </span>
      </div>
    </Link>
  );
}

export default BoardsPage;
