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
import { SkeletonCards } from "@/components/ui/skeletonCards"
import { ErrorState } from "@/components/ui/error-state"
import { LayoutDashboard, Plus, Loader2, Lock, Users, Search } from "@/lib/icons";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import Link from "next/link";
import { PageHeader } from "@/components/ui/pageHeader";
import { hueFor } from "@/lib/campHue";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { cn } from "@/lib/utils/helpers/cn";

function BoardsPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { makeRequest, isSubmitting } = usePost();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 350);

  const listUrl = `${GetEndpointUrl.GetBoardList}?pageSize=60&pageIndex=0${
    debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
  }`;
  const { data, isLoading, isError, mutate } = useFetch<BoardListResponse>(listUrl);
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

  const showEmpty = !isLoading && !isError && boards.length === 0;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      {/* The page's title and its one action. The line under the title was
          marketing ("Infinite collaborative canvas for diagrams, roadmaps,
          and UI design") in a place that is read every day. */}
      <PageHeader
        title="Boards"
        className="mb-5"
        actions={
          <Button onClick={createBoard} disabled={isSubmitting} className="shrink-0 gap-1.5">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New board
          </Button>
        }
      />

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search boards…"
          className="h-9 pl-9"
          aria-label="Search boards"
          type="search"
        />
      </div>

      {isLoading ? (
        // Same grid as the boards below, so the page does not reflow on arrival.
        <div role="status" aria-label="Loading boards">
          <SkeletonCards cards={8} gridClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" />
        </div>
      ) : isError ? (
        <ErrorState subject="your boards" onRetry={() => void mutate()} />
      ) : showEmpty ? (
        debouncedSearch ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No boards match &ldquo;{debouncedSearch}&rdquo;.
          </div>
        ) : (
          // One sentence and one action. The dashed drop-zone box with an icon
          // in a circle was a second "New board" button dressed as a picture.
          <div className="rounded-lg border border-border/60 px-6 py-12">
            <p className="text-sm font-medium text-foreground">No boards yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
              A board is a blank canvas for sketches, flows and screens your team draws on together.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={createBoard} disabled={isSubmitting}>
              Create a board
            </Button>
          </div>
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
              href={`${app_board_path}/${b.board_uuid}`}
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
  href,
}: {
  uuid: string;
  title: string;
  isPrivate?: boolean;
  thumbnailKey?: string;
  updatedAt?: string;
  href: string;
}) {
  const relative = useRelativeTime(updatedAt || null);
  const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
  const thumbUrl = thumbnailKey ? `${baseUrl}${GetEndpointUrl.GetBoardAttachment}/${uuid}/${thumbnailKey}` : "";
  const [thumbFailed, setThumbFailed] = React.useState(false);
  return (
    // A link, so a board opens from the keyboard and in a new tab, and is
    // fetched ahead. A board with no picture yet shows its own hue, the one
    // it has in the sidebar, instead of a grey box.
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 text-left hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      data-board-uuid={uuid}
    >
      <div className={cn("flex aspect-video items-center justify-center overflow-hidden rounded-md", thumbUrl && !thumbFailed ? "bg-muted/60" : cn(HUE_CLASS[hueFor(uuid)], "bg-hue-tint"))}>
        {thumbUrl && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            width={480}
            height={270}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <LayoutDashboard className="h-7 w-7 text-hue" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          {isPrivate ? <Lock className="h-3 w-3" aria-label="Private" /> : <Users className="h-3 w-3" aria-label="Shared" />}
          {relative ? <span>{relative}</span> : <span>{isPrivate ? "Private" : "Shared"}</span>}
        </span>
      </div>
    </Link>
  );
}

export default BoardsPage;
