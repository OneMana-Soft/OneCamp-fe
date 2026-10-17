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
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { BoardInfoInterface, BoardListResponse } from "@/types/board";
import { addUserBoard } from "@/store/slice/userSlice";
import { app_board_path } from "@/types/paths";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, Loader2, Lock, Users, Search } from "@/lib/icons";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Spark, SpotSearch } from "@/components/ui/graphics";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board/templates";
import { NotesFallback, TemplatePreview } from "@/components/board/templatePreview";
import { cn } from "@/lib/utils/helpers/cn";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-4";

function BoardsPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { makeRequest, isSubmitting } = usePost();
  const [creating, setCreating] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 350);

  const listUrl = `${GetEndpointUrl.GetBoardList}?pageSize=60&pageIndex=0${
    debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
  }`;
  // The page shows a failed load itself, with Try again: no second, toast-borne copy.
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(listUrl, undefined, undefined, OWN_ERRORS);
  const boards = data?.data?.boards || [];
  const count = data?.data?.count || boards.length;

  // A new board, blank or from a template. The template is laid on the canvas
  // once the board opens (the board page reads ?template=).
  const createBoard = React.useCallback(
    (template?: BoardTemplate) => {
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
            <label className="relative flex h-8 w-full items-center rounded-lg bg-raised shadow-e1 transition-shadow focus-within:focus-halo sm:w-60">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boards"
                className="h-full w-full bg-transparent pl-8 pr-2.5 text-ui text-ink outline-none placeholder:text-ink-3"
                aria-label="Search boards"
                type="search"
              />
            </label>
          ) : null}
          <Button size="sm" onClick={() => createBoard()} disabled={isSubmitting || !!creating} className="shrink-0 gap-1.5 max-sm:hidden">
            {creating === "blank" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
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

/**
 * The first visit (B02): an illustrated header, a line, and the five
 * templates as cards; "Blank board" under them.
 */
function BoardsWelcome({ onPick, creating }: { onPick: (t?: BoardTemplate) => void; creating: string | null }) {
  return (
    <section aria-labelledby="boards-welcome" className="flex flex-col items-center pt-4 text-center sm:pt-8">
      <WelcomeArt />
      <h2 id="boards-welcome" className="mt-5 text-title-2 text-ink">
        Think it through together
      </h2>
      <p className="mt-1.5 max-w-[440px] text-ui text-ink-2">
        A shared canvas for retros, brainstorms and plans. Start from a template:
      </p>
      <ul
        className="-mx-4 mt-6 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:w-full sm:justify-center sm:overflow-visible sm:px-1 sm:pb-0"
        aria-label="Templates"
      >
        {BOARD_TEMPLATES.map((t, i) => {
          const busy = creating === t.id;
          return (
            <li key={t.id} className="content-rise shrink-0 snap-start" style={{ ["--i" as string]: i }}>
              <button
                type="button"
                onClick={() => onPick(t)}
                disabled={!!creating}
                data-board-template={t.id}
                className={cn(
                  "group/tpl hover-lift relative flex h-[156px] w-[160px] flex-col overflow-hidden rounded-xl bg-raised text-left shadow-e1 outline-none sm:w-[180px]",
                  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
                  creating && !busy && "opacity-60",
                )}
              >
                <TemplatePreview template={t} height={96} />
                {busy ? (
                  <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-lg bg-pop shadow-e1">
                    <Loader2 className="size-3.5 animate-spin text-ink-2" />
                  </span>
                ) : null}
                <span className="flex flex-1 flex-col justify-center px-3">
                  <span className="truncate text-ui-sm font-medium text-ink">{t.name}</span>
                  <span className="line-clamp-2 text-meta text-ink-3">{t.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" size="sm" className="mt-5" onClick={() => onPick()} disabled={!!creating}>
        {creating === "blank" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Blank board
      </Button>
    </section>
  );
}

/** Three tilted stickies on the dot grid, a dashed orbit and one brand spark. */
function WelcomeArt() {
  return (
    <div aria-hidden="true" data-empty-illustration="" className="relative size-[120px]">
      <div className="dot-ground absolute inset-3 rounded-[40px] opacity-90" />
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" fill="none">
        <circle cx="60" cy="60" r="54" stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="1.5 5" strokeLinecap="round" />
        <circle cx="8" cy="48" r="3.5" fill="var(--camp-sky)" />
        <circle cx="110" cy="80" r="3" fill="var(--camp-moss)" />
      </svg>
      <NotesFallback />
      <Spark size={14} className="content-twinkle absolute right-3 top-2 text-brand" />
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
  const thumbUrl = thumbnailKey ? `${baseUrl}${GetEndpointUrl.GetBoardAttachment}/${uuid}/${thumbnailKey}` : "";
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
