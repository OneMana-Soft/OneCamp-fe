"use client";

// The boards list (content.md B01 and B02). A 1040 px page: the title, a count,
// a search pill and the one primary; then cards on a dot grid that read as
// boards even before they have a picture. With no boards yet, the page offers
// the five templates as illustrated cards, drawn from their real layouts, so a
// first board starts with a move instead of a blank canvas.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
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
import { Plus, Lock, Users, ChevronDown, FolderKanban, LayoutGrid, X } from "@/lib/icons";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotSearch } from "@/components/ui/graphics/spots";
import { NotesFallback } from "@/components/board/notesFallback";
import WithAddWorkReads from "@/components/board/addWorkReads";
import { loadFailure } from "@/lib/http/loadFailure";
import { boardFilterParams, boardsHref, emptyCopy, isFiltered, readBoardFilter, unavailableLine, type BoardFilter, type BoardOwner } from "@/lib/board/boardListFilter";
import { ix } from "@/lib/ui/interactive";
import { cn } from "@/lib/utils/helpers/cn";
import type { RootState } from "@/store/store";
import dynamic from "next/dynamic";

// The first visit's templates: loaded only for a workspace with no boards.
const BoardsWelcome = dynamic(() => import("@/components/board/boardsWelcome"), { ssr: false });
// The Project picker, with its popover and sheet: loaded when it is first wanted (warmed on the button's hover or focus).
const loadPicker = () => import("@/components/board/boardPlacePicker");
const BoardPlacePicker = dynamic(loadPicker, { ssr: false });

const OWNERS: [BoardOwner | null, string][] = [[null, "All"], ["mine", "Mine"], ["shared", "Shared"]];
// The filter row's controls: 32 px with a mouse, a finger's 44 px through data-touch-target (app/phone.css F3).
const CHIP = "inline-flex h-8 min-w-11 items-center justify-center gap-1.5 rounded-sm px-3 text-ui-sm font-medium text-ink-2 transition-colors hover:text-ink";

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

  // The filters live in the address (lib/board/boardListFilter): a filtered list is a link, and Back steps back.
  const address = useSearchParams().toString();
  const filter = React.useMemo(() => readBoardFilter(new URLSearchParams(address)), [address]);
  const filtered = isFiltered(filter);
  const [notice, setNotice] = React.useState("");
  const setFilter = (next: BoardFilter) => {
    setNotice("");
    router.push(boardsHref(next, address), { scroll: false });
  };
  // A filter's place by name: the sidebar holds the viewer's projects and teams.
  const sidebar = useSelector((s: RootState) => s.users.userSidebar);
  const placeName = filter.project
    ? sidebar.userProjects?.find((p) => p?.project_uuid === filter.project)?.project_name || "A project"
    : filter.team
      ? sidebar.userTeams?.find((t) => t?.team_uuid === filter.team)?.team_name || "A team"
      : "";
  const [picking, setPicking] = React.useState(false);
  const [pickerWanted, setPickerWanted] = React.useState(false);
  const placeButton = React.useRef<HTMLButtonElement>(null);
  const warmPicker = () => void loadPicker();

  const own = boardFilterParams(filter);
  const listUrl = `${BoardsGet.GetBoardList}?pageSize=60&pageIndex=0${
    debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
  }${own ? `&${own}` : ""}`;
  // The page shows a failed load itself, with Try again: no second, toast-borne copy.
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(listUrl, undefined, undefined, OWN_ERRORS);
  const boards = data?.data?.boards || [];
  const count = data?.data?.count || boards.length;

  // A project or team the server won't show (gone, or not the viewer's: it says 404 for both) lets its filter go,
  // with a line saying so, in place of the list's error.
  const placeGone = !!(filter.project || filter.team) && !!isError && loadFailure(isError) === "gone";
  React.useEffect(() => {
    if (!placeGone) return;
    setNotice(unavailableLine(filter));
    router.replace(boardsHref({ ...filter, project: null, team: null }, address), { scroll: false });
  }, [placeGone, filter, address, router]);

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
  const firstRun = showEmpty && !debouncedSearch && !filtered;
  const empty = emptyCopy(filter, placeName);

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

        {!firstRun ? (
          <div role="group" aria-label="Filter boards" data-board-filters="" data-touch-group="32" className="mb-5 flex flex-wrap items-center gap-2">
            {OWNERS.map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={filter.owner === value}
                onClick={() => setFilter({ ...filter, owner: value })}
                data-touch-target=""
                {...ix("toggle", { tone: "neutral" })}
                className={cn(CHIP, filter.owner === value && "bg-press text-ink")}
              >
                {label}
              </button>
            ))}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            {/* The place and its Clear are one item of the row: a phone's row wraps them together, never the × alone. */}
            <span data-touch-group="32" className="flex min-w-0 max-w-full items-center gap-1">
              <button
                ref={placeButton}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={picking}
                onPointerEnter={warmPicker}
                onFocus={warmPicker}
                onClick={() => {
                  setPickerWanted(true);
                  setPicking((o) => !o);
                }}
                data-touch-target=""
                {...ix("toggle", { tone: "neutral" })}
                className={cn(CHIP, "max-w-full", placeName && "bg-press text-ink")}
              >
                <FolderKanban className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{placeName || "All projects"}</span>
                <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              </button>
              {placeName ? (
                <Button variant="ghost" size="icon" aria-label={`Clear ${placeName}`} onClick={() => setFilter({ ...filter, project: null, team: null })}>
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </span>
          </div>
        ) : null}
        {pickerWanted ? (
          // The viewer's projects with their teams are read while the picker is in the page (components/board/addWorkReads).
          <WithAddWorkReads>
            {(reads) => (
              <BoardPlacePicker
                open={picking}
                onOpenChange={setPicking}
                anchor={placeButton}
                reads={reads}
                teams={sidebar.userTeams ?? []}
                place={filter}
                onPick={(p) => setFilter({ ...filter, ...p })}
              />
            )}
          </WithAddWorkReads>
        ) : null}
        {notice ? (
          <p role="status" data-board-filter-notice="" className="mb-4 text-ui-sm text-ink-2">
            {notice}
          </p>
        ) : null}

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
          placeGone ? null : <ErrorState subject="your boards" onRetry={() => void mutate()} />
        ) : showEmpty ? (
          debouncedSearch ? (
            <EmptyState illustration={<SpotSearch />} title={`No boards match “${debouncedSearch}”.`} />
          ) : filtered ? (
            <EmptyState
              icon={filter.project || filter.team ? FolderKanban : filter.owner === "shared" ? Users : LayoutGrid}
              hue={filter.project || filter.team ? "moss" : filter.owner === "shared" ? "sky" : "sun"}
              title={empty.title}
              description={empty.description}
            />
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
