"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { usePost } from "@/hooks/usePost";
import { useFetch } from "@/hooks/useFetch";
import { useDebounce } from "@/hooks/useDebounce";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { BoardInfoInterface, BoardListResponse } from "@/types/board";
import { addUserBoard } from "@/store/slice/userSlice";
import { app_board_path } from "@/types/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayoutDashboard, Plus, Loader2, Lock, Users, Search } from "@/lib/icons";
import { useRelativeTime } from "@/hooks/useRelativeTime";

function BoardsPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { makeRequest, isSubmitting } = usePost();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 350);

  const listUrl = `${GetEndpointUrl.GetBoardList}?pageSize=60&pageIndex=0${
    debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
  }`;
  const { data, isLoading } = useFetch<BoardListResponse>(listUrl);
  const boards = data?.data?.boards || [];

  const createBoard = React.useCallback(() => {
    if (isSubmitting) return;
    makeRequest<{ board_title: string; board_private: boolean }, BoardInfoInterface>({
      payload: { board_title: "Untitled board", board_private: true },
      apiEndpoint: PostEndpointUrl.CreateBoard,
    }).then((res) => {
      if (res?.board_uuid) {
        dispatch(addUserBoard({ board: { board_uuid: res.board_uuid, board_title: res.board_title || "Untitled board" } }));
        router.push(`${app_board_path}/${res.board_uuid}`);
      }
    });
  }, [makeRequest, isSubmitting, dispatch, router]);

  const showEmpty = !isLoading && boards.length === 0;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold sm:text-xl">Boards</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Infinite collaborative canvas for diagrams, roadmaps, and UI design.
          </p>
        </div>
        <Button onClick={createBoard} disabled={isSubmitting} className="shrink-0 gap-1.5">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="hidden sm:inline">New board</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search boards..."
          className="h-9 pl-9"
          aria-label="Search boards"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : showEmpty ? (
        debouncedSearch ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No boards match &ldquo;{debouncedSearch}&rdquo;.
          </div>
        ) : (
          <button
            type="button"
            onClick={createBoard}
            disabled={isSubmitting}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/30 px-6 py-16 text-center transition-colors hover:border-border hover:bg-accent/30"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Create your first board</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Start with a blank canvas and invite your team to draw together.
              </p>
            </div>
          </button>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {boards.map((b) => (
            <BoardCard
              key={b.board_uuid}
              uuid={b.board_uuid}
              title={b.board_title}
              isPrivate={b.board_private}
              thumbnailKey={b.board_thumbnail_key}
              updatedAt={b.board_updated_at}
              onClick={() => router.push(`${app_board_path}/${b.board_uuid}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({
  uuid,
  title,
  isPrivate,
  thumbnailKey,
  updatedAt,
  onClick,
}: {
  uuid: string;
  title: string;
  isPrivate?: boolean;
  thumbnailKey?: string;
  updatedAt?: string;
  onClick: () => void;
}) {
  const relative = useRelativeTime(updatedAt || null);
  const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
  const thumbUrl = thumbnailKey ? `${baseUrl}${GetEndpointUrl.GetBoardAttachment}/${uuid}/${thumbnailKey}` : "";
  const [thumbFailed, setThumbFailed] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-lg border border-border/50 bg-card/30 p-3 text-left transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      data-board-uuid={uuid}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted/60">
        {thumbUrl && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <LayoutDashboard className="h-7 w-7 text-muted-foreground/70 transition-colors group-hover:text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-xs font-medium sm:text-sm">{title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
          {isPrivate ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {relative ? <span>{relative}</span> : <span>{isPrivate ? "Private" : "Shared"}</span>}
        </span>
      </div>
    </button>
  );
}

export default BoardsPage;
