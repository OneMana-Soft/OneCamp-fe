"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { BoardInfoResponse } from "@/types/board";
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider";
import { usePost } from "@/hooks/usePost";
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID";
import { cn } from "@/lib/utils/helpers/cn";
import { Loader2, Share2, Ellipsis, Trash, MessageCircle, History, Eye } from "@/lib/icons";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActiveUsersBar } from "@/components/docEditor/ActiveUsersBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDispatch } from "react-redux";
import { updateUserBoardTitle, removeUserBoard } from "@/store/slice/userSlice";
import { openUI } from "@/store/slice/uiSlice";
import { app_board_path } from "@/types/paths";
import { useTheme } from "next-themes";
import BoardCanvas from "@/components/board/boardCanvas";
import BoardComments from "@/components/board/boardComments";
import { LinkedFromSection } from "@/components/entityLink/LinkedFromSection";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// "board:" namespace prefix shared with the collaboration service so a single
// Hocuspocus server routes board vs doc documents to the right backend.
const BOARD_DOC_PREFIX = "board:";

export default function BoardPage() {
  const params = useParams();
  const boardId = params?.["board-id"] as string;
  const dispatch = useDispatch();
  const router = useRouter();
  const { isMobile } = useMedia();
  const { resolvedTheme } = useTheme();

  const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  const { data: boardInfoHelper, isLoading: isBoardLoading } = useFetch<BoardInfoResponse>(
    boardId ? `${GetEndpointUrl.GetBoardInfo}/${boardId}` : "",
  );
  const boardInfo = boardInfoHelper?.data;
  const { makeRequest: updateBoard } = usePost();
  const { makeRequest: deleteBoardRequest } = usePost();
  const { makeRequest: recordBoardView } = usePost();

  const isOwner = React.useMemo(() => {
    if (!boardInfo || !userProfile.data?.data) return false;
    return boardInfo.board_created_by?.user_uuid === userProfile.data.data.user_uuid;
  }, [boardInfo, userProfile.data?.data]);

  const hasEditAccess = React.useMemo(() => {
    if (!boardInfo || !userProfile.data?.data) return false;
    return isOwner || boardInfo.board_edit_access > 0;
  }, [boardInfo, userProfile.data?.data, isOwner]);

  // Anyone who can open the board joins the live session; viewers are read-only.
  const collaborationConfig = React.useMemo(() => {
    if (!boardId || !userProfile.data?.data) return undefined;
    return {
      enabled: true,
      documentId: `${BOARD_DOC_PREFIX}${boardId}`,
      username:
        userProfile.data.data.user_full_name || userProfile.data.data.user_name || "Anonymous",
      userId: userProfile.data.data.user_uuid,
      color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "default"),
      profileKey: userProfile.data.data.user_profile_object_key,
    };
  }, [boardId, userProfile.data?.data]);

  const { provider, status: collabStatus, synced, awarenessUsers } =
    useCollaborationProvider(collaborationConfig);

  // Excalidraw imperative API, lifted so the AI panel can append generated
  // elements to the live scene.
  const [excalApi, setExcalApi] = React.useState<ExcalidrawImperativeAPI | null>(null);
  const [commentMode, setCommentMode] = React.useState(false);

  // Notion-like inline title editing (owner / editors only).
  const [title, setTitle] = React.useState("");
  const titleSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  React.useEffect(() => {
    if (boardInfo?.board_title) setTitle(boardInfo.board_title);
  }, [boardInfo?.board_title]);

  // Record a view once per board open, after access is confirmed. The backend
  // dedupes/throttles, so this is safe even if the effect re-runs; the ref
  // guards against double-firing within a single mount.
  const viewRecordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!boardId || !boardInfo) return;
    if (viewRecordedRef.current === boardId) return;
    viewRecordedRef.current = boardId;
    recordBoardView({
      apiEndpoint: PostEndpointUrl.RecordBoardView,
      payload: { board_uuid: boardId },
      showErrorToast: false,
    }).catch(() => {
      // View tracking is best-effort; never surface an error.
    });
  }, [boardId, boardInfo, recordBoardView]);

  const saveTitle = React.useCallback(
    (newTitle: string) => {
      const finalTitle = newTitle.trim() || "Untitled board";
      if (!boardId || !boardInfo || finalTitle === boardInfo.board_title) return;
      updateBoard({
        apiEndpoint: PostEndpointUrl.UpdateBoard,
        payload: { board_uuid: boardId, board_title: finalTitle },
      });
      dispatch(updateUserBoardTitle({ board_uuid: boardId, board_title: finalTitle }));
    },
    [boardId, boardInfo, updateBoard, dispatch],
  );

  const handleTitleChange = React.useCallback(
    (val: string) => {
      setTitle(val);
      if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
      titleSaveTimeoutRef.current = setTimeout(() => saveTitle(val), 800);
    },
    [saveTitle],
  );

  const performDelete = React.useCallback(() => {
    if (!boardId) return;
    deleteBoardRequest({
      apiEndpoint: PostEndpointUrl.DeleteBoard,
      payload: { board_uuid: boardId },
      showToast: true,
    }).then(() => {
      dispatch(removeUserBoard({ board_uuid: boardId }));
      router.push(app_board_path);
    });
  }, [boardId, deleteBoardRequest, dispatch, router]);

  const confirmDelete = React.useCallback(() => {
    dispatch(
      openUI({
        key: "confirmAlert",
        data: {
          title: "Delete board",
          description: "This will permanently remove the board for everyone. This cannot be undone.",
          confirmText: "Delete board",
          onConfirm: performDelete,
        },
      }),
    );
  }, [dispatch, performDelete]);

  if (!boardId) return null;

  if (isBoardLoading || userProfile.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!boardInfo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Board not found or access denied.
      </div>
    );
  }

  const offline = collabStatus === "disconnected" || collabStatus === "offline";

  return (
    <div className="flex h-full flex-col">
      {/* Top bar (desktop only). On mobile the global mobile top nav provides
          back + title; the canvas uses the full height. */}
      {!isMobile && (
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-2 backdrop-blur-sm sm:h-14 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={() => saveTitle(title)}
            disabled={!hasEditAccess}
            placeholder="Untitled board"
            className="h-8 min-w-0 flex-1 border-none bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0 disabled:cursor-default disabled:opacity-100 sm:text-base"
            aria-label="Board title"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ActiveUsersBar users={awarenessUsers} maxShown={isMobile ? 3 : 4} />
          {hasEditAccess && (
            <Button
              variant={commentMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setCommentMode((m) => !m)}
              className={cn("gap-1.5", !commentMode && "text-muted-foreground hover:text-foreground")}
              title="Add a comment"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{commentMode ? "Click to place" : "Comment"}</span>
            </Button>
          )}
          {hasEditAccess && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch(openUI({ key: "boardShare", data: { boardId } }))}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              title="Share board"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}
          {(hasEditAccess || isOwner) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Board options">
                  <Ellipsis className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hasEditAccess && (
                  <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardViewers", data: { boardId } }))}>
                    <Eye className="mr-2 h-4 w-4" />
                    Viewed by
                  </DropdownMenuItem>
                )}
                {hasEditAccess && (
                  <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardVersionHistory", data: { boardId } }))}>
                    <History className="mr-2 h-4 w-4" />
                    Version history
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem onClick={confirmDelete} className="text-destructive focus:text-destructive">
                    <Trash className="mr-2 h-4 w-4" />
                    Delete board
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      )}

      {/* Tasks/projects that link this board (desktop only; renders nothing when none). */}
      {!isMobile && (
        <LinkedFromSection refType="board" refUUID={boardId} className="shrink-0 border-b bg-background/40 px-4 py-2.5" />
      )}

      {/* Offline / reconnecting banner */}
      {offline && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium",
            collabStatus === "offline"
              ? "border-b border-amber-500/20 bg-amber-500/10 text-amber-600"
              : "border-b bg-muted/50 text-muted-foreground",
          )}
        >
          {collabStatus === "offline" ? (
            <>
              <WifiOff className="h-3 w-3" />
              <span>Working offline. Changes will sync when you reconnect.</span>
            </>
          ) : (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Reconnecting to collaboration server...</span>
            </>
          )}
        </div>
      )}

      {/* Canvas */}
      <div className="relative min-h-0 flex-1">
        {provider ? (
          <BoardCanvas
            provider={provider}
            boardId={boardId}
            synced={synced}
            editable={hasEditAccess}
            user={{
              id: userProfile.data!.data!.user_uuid,
              name:
                userProfile.data!.data!.user_full_name ||
                userProfile.data!.data!.user_name ||
                "Anonymous",
              profileKey: userProfile.data!.data!.user_profile_object_key,
            }}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            onApiReady={setExcalApi}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting to live canvas...</span>
            </div>
          </div>
        )}



        {/* Pinned comments (everyone with access sees them; editors can add) */}
        {provider && excalApi && (
          <BoardComments
            provider={provider}
            api={excalApi}
            boardId={boardId}
            editable={hasEditAccess}
            commentMode={commentMode}
            onCommentModeChange={setCommentMode}
            user={{
              id: userProfile.data!.data!.user_uuid,
              name:
                userProfile.data!.data!.user_full_name ||
                userProfile.data!.data!.user_name ||
                "Anonymous",
            }}
          />
        )}

        {/* Mobile share + options affordance (desktop uses the header). */}
        {isMobile && (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {hasEditAccess && (
              <Button
                variant={commentMode ? "default" : "secondary"}
                size="icon"
                onClick={() => setCommentMode((m) => !m)}
                className="h-9 w-9 rounded-full border shadow-md"
                aria-label="Add a comment"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            {hasEditAccess && (
              <Button
                variant="secondary"
                size="icon"
                onClick={() => dispatch(openUI({ key: "boardShare", data: { boardId } }))}
                className="h-9 w-9 rounded-full border shadow-md"
                aria-label="Share board"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {(hasEditAccess || isOwner) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full border shadow-md" aria-label="Board options">
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hasEditAccess && (
                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardViewers", data: { boardId } }))}>
                      <Eye className="mr-2 h-4 w-4" />
                      Viewed by
                    </DropdownMenuItem>
                  )}
                  {hasEditAccess && (
                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardVersionHistory", data: { boardId } }))}>
                      <History className="mr-2 h-4 w-4" />
                      Version history
                    </DropdownMenuItem>
                  )}
                  {isOwner && (
                    <DropdownMenuItem onClick={confirmDelete} className="text-destructive focus:text-destructive">
                      <Trash className="mr-2 h-4 w-4" />
                      Delete board
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
