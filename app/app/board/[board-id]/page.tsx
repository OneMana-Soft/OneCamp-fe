"use client";

import { displayNameOf } from "@/lib/personName"
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { BoardInfoResponse } from "@/types/board";
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider";
import { warmCollabToken } from "@/lib/collabToken";
import { usePost } from "@/hooks/usePost";
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID";
import { Loader2, Share2, Ellipsis, Trash, MessageCircle, History, Eye, WifiOff, Sparkles, LayoutGrid, Search, HelpCircle, ImageIcon, Library } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { LoadFailureState } from "@/components/ui/load-failure-state";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { ActiveUsersBar } from "@/components/docEditor/ActiveUsersBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useDispatch } from "react-redux";
import { updateUserBoardTitle, removeUserBoard } from "@/store/slice/userSlice";
import { openUI } from "@/store/slice/uiSlice";
import { app_board_path } from "@/types/paths";
import { useTheme } from "next-themes";
import BoardCanvas from "@/components/board/boardCanvas";
import BoardAIPanel from "@/components/board/boardAIPanel";
import BoardTools, { TemplatesButton, insertBoardTemplate } from "@/components/board/boardTools";
import { BoardTitleCluster, ChromeCluster, ClusterButton, ClusterDivider, boardSaveState, useDrawingFade } from "@/components/board/boardChrome";
import { BOARD_TEMPLATES } from "@/lib/board/templates";
import BoardFacilitation from "@/components/board/boardFacilitation"
import BoardComments from "@/components/board/boardComments";
import { LinkedFromSection } from "@/components/entityLink/LinkedFromSection";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// "board:" namespace prefix shared with the collaboration service so a single
// Hocuspocus server routes board vs doc documents to the right backend.
const BOARD_DOC_PREFIX = "board:";

// Ask AI wears the agent's colour, open or not: brand is for actions.
const AI_BUTTON = (open: boolean) =>
  open ? "bg-agent-muted text-agent-ink hover:bg-agent-muted hover:text-agent-ink" : "text-agent hover:text-agent";

export default function BoardPage() {
  const params = useParams();
  const boardId = params?.["board-id"] as string;
  const dispatch = useDispatch();
  const router = useRouter();
  const { isMobile } = useMedia();
  const { resolvedTheme } = useTheme();

  const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  // The page says what went wrong itself (gone, or Try again), so no toast.
  const { data: boardInfoHelper, isLoading: isBoardLoading, isError: boardError, mutate: reloadBoard } = useFetch<BoardInfoResponse>(
    boardId ? `${GetEndpointUrl.GetBoardInfo}/${boardId}` : "",
    undefined,
    undefined,
    OWN_ERRORS,
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
        displayNameOf(userProfile.data.data) || "Anonymous",
      userId: userProfile.data.data.user_uuid,
      color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "default"),
      profileKey: userProfile.data.data.user_profile_object_key,
    };
  }, [boardId, userProfile.data?.data]);

  // Ask for the collaboration token while the board's details load, so the
  // websocket finds it ready instead of waiting another round trip.
  React.useEffect(() => { warmCollabToken() }, []);
  const { provider, status: collabStatus, synced, awarenessUsers } =
    useCollaborationProvider(collaborationConfig);

  // Excalidraw imperative API, lifted so the AI panel can append generated
  // elements to the live scene.
  const [excalApi, setExcalApi] = React.useState<ExcalidrawImperativeAPI | null>(null);
  const [commentMode, setCommentMode] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [gridOn, setGridOn] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  useDrawingFade(wrapRef);

  // A board made from a template on the boards list (?template=retro): lay
  // the template on once the empty board has synced, then drop the query so
  // a reload doesn't lay it again.
  const templateLaid = React.useRef(false);
  React.useEffect(() => {
    if (!excalApi || !synced || templateLaid.current) return;
    const id = new URLSearchParams(window.location.search).get("template");
    if (!id) return;
    templateLaid.current = true;
    const t = BOARD_TEMPLATES.find((x) => x.id === id);
    if (t && !excalApi.getSceneElements().some((e) => !e.isDeleted)) void insertBoardTemplate(excalApi, t);
    router.replace(`${app_board_path}/${boardId}`);
  }, [excalApi, synced, router, boardId]);

  // The board's name, renamed in place in the top-left cluster.
  const [title, setTitle] = React.useState("");
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
          title: "Delete this board?",
          description: "It's removed for everyone, with everything drawn on it. This can't be undone.",
          confirmText: "Delete board",
          destructive: true,
          onConfirm: performDelete,
        },
      }),
    );
  }, [dispatch, performDelete]);

  if (!boardId) return null;

  // Opening (content.md B11): the dot-grid canvas with a quiet line, the
  // same ground the board then draws on, not a lone spinner.
  if (isBoardLoading || userProfile.isLoading) {
    return (
      <div className="dot-ground flex h-full w-full items-center justify-center" data-board-opening="">
        <div className="flex items-center gap-2 text-ui-sm text-ink-3" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>Opening the board…</span>
        </div>
      </div>
    );
  }

  // Not yours, gone, or not loaded, said as every screen says it
  // (LoadFailureState): a way back, and Try again only for a failed load.
  if (!boardInfo) {
    return (
      <LoadFailureState
        error={boardError}
        noun="board"
        onRetry={() => void reloadBoard()}
        back={{ label: "Back to boards", href: app_board_path }}
        className="pt-20"
      />
    );
  }

  const offline = collabStatus === "disconnected" || collabStatus === "offline";
  const saveState = boardSaveState(collabStatus, synced);

  // The board's "More" menu: Excalidraw's own menu items, reached from the
  // board's cluster (Excalidraw's hamburger and Library button are hidden),
  // then the board's: who viewed it, its history, linked tasks, delete.
  const menu = (trigger: React.ReactElement, align: "start" | "end" = "start") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={8} className="w-60">
        {excalApi && (
          <>
            <DropdownMenuItem onClick={() => excalApi.updateScene({ appState: { openDialog: { name: "imageExport" } } as never })}>
              <ImageIcon className="mr-2 size-4" />
              Export image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => excalApi.toggleSidebar({ name: "default", tab: "library" })}>
              <Library className="mr-2 size-4" />
              Library
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => excalApi.toggleSidebar({ name: "default", tab: "search" })}>
              <Search className="mr-2 size-4" />
              Find on board
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={gridOn}
              onCheckedChange={(on) => {
                setGridOn(on);
                excalApi.updateScene({ appState: { gridModeEnabled: on } as never });
              }}
            >
              Show grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showResolved} onCheckedChange={setShowResolved}>
              Show resolved comments
            </DropdownMenuCheckboxItem>
            {/* A phone has no keys to learn. */}
            {!isMobile ? (
              <DropdownMenuItem onClick={() => excalApi.updateScene({ appState: { openDialog: { name: "help" } } as never })}>
                <HelpCircle className="mr-2 size-4" />
                Keyboard shortcuts
              </DropdownMenuItem>
            ) : null}
          </>
        )}
        {hasEditAccess && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardViewers", data: { boardId } }))}>
              <Eye className="mr-2 size-4" />
              Viewed by
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch(openUI({ key: "boardVersionHistory", data: { boardId } }))}>
              <History className="mr-2 size-4" />
              Version history
            </DropdownMenuItem>
          </>
        )}
        {/* Tasks and projects that link this board; nothing when none. */}
        <LinkedFromSection refType="board" refUUID={boardId} className="mt-1 border-t border-line px-2 pb-1 pt-2" />
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={confirmDelete} className="text-danger-ink focus:text-danger-ink">
              <Trash className="mr-2 size-4" />
              Delete board
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    // No top bar row (content.md B03): the canvas runs the sheet's full
    // height, and the board's controls float over it at the top corners.
    <div ref={wrapRef} className="relative h-full overflow-hidden" data-board-page="">
      {/* Canvas */}
      <div className="absolute inset-0">
        {provider ? (
          <BoardCanvas
            provider={provider}
            boardId={boardId}
            synced={synced}
            editable={hasEditAccess}
            user={{
              id: userProfile.data!.data!.user_uuid,
              name:
                displayNameOf(userProfile.data!.data!) || "Anonymous",
              profileKey: userProfile.data!.data!.user_profile_object_key,
            }}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            onApiReady={setExcalApi}
          />
        ) : (
          <div className="dot-ground flex h-full w-full items-center justify-center">
            <div className="flex items-center gap-2 text-ui-sm text-ink-3">
              <Loader2 className="size-4 animate-spin" />
              <span>Joining the board…</span>
            </div>
          </div>
        )}

        {/* AI generation (edit access only), opened from the cluster. */}
        <BoardAIPanel boardId={boardId} api={excalApi} disabled={!hasEditAccess} open={aiOpen} onOpenChange={setAiOpen} />

        {/* The empty-canvas templates, and sticky notes into tasks. */}
        <BoardTools api={excalApi} editable={hasEditAccess} boardId={boardId} synced={synced} quiet={aiOpen} />

        {/* Timer, dot voting and follow-the-presenter */}
        {provider && excalApi && userProfile.data?.data && (
          <BoardFacilitation
            provider={provider}
            api={excalApi}
            editable={hasEditAccess}
            user={{
              id: userProfile.data.data.user_uuid,
              name: displayNameOf(userProfile.data.data) || "Someone",
            }}
          />
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
            showResolved={showResolved}
            user={{
              id: userProfile.data!.data!.user_uuid,
              name:
                displayNameOf(userProfile.data!.data!) || "Anonymous",
            }}
          />
        )}
      </div>

      {/* Top left: back, name, save dot, More. */}
      {!isMobile && (
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-col items-start gap-2">
          <BoardTitleCluster
            backHref={app_board_path}
            title={title}
            editable={hasEditAccess}
            onRename={(t) => {
              setTitle(t);
              saveTitle(t);
            }}
            saveState={saveState}
            menu={(trigger) => menu(trigger, "start")}
          />
          {offline && (
            <div
              role="status"
              className="content-float pointer-events-auto flex h-8 items-center gap-2 rounded-lg bg-pop px-2.5 text-meta text-ink-2 shadow-e3"
            >
              {collabStatus === "offline" ? (
                <>
                  <WifiOff className="size-3.5 text-camp-sun-ink" />
                  <span>Working offline. Changes sync when you reconnect.</span>
                </>
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Reconnecting…</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top right: who is here, templates, AI, comments, share. */}
      {!isMobile && (
        <div className="pointer-events-none absolute right-3 top-3 z-30">
          <ChromeCluster label="Board tools">
            {awarenessUsers.length > 0 && (
              <>
                <ActiveUsersBar users={awarenessUsers} maxShown={4} className="px-1" />
                <ClusterDivider />
              </>
            )}
            {hasEditAccess && (
              <>
                <TemplatesButton
                  api={excalApi}
                  trigger={
                    <ClusterButton label="Templates">
                      <LayoutGrid />
                    </ClusterButton>
                  }
                />
                <ClusterButton label="Ask AI" active={aiOpen} onClick={() => setAiOpen((o) => !o)} className={AI_BUTTON(aiOpen)}>
                  <Sparkles />
                </ClusterButton>
                <ClusterButton
                  label={commentMode ? "Click the board to place a comment" : "Comment"}
                  active={commentMode}
                  onClick={() => setCommentMode((m) => !m)}
                >
                  <MessageCircle />
                </ClusterButton>
                <ClusterDivider />
                <Button size="sm" className="h-8 gap-1.5 px-3" onClick={() => dispatch(openUI({ key: "boardShare", data: { boardId } }))}>
                  <Share2 className="size-3.5" />
                  Share
                </Button>
              </>
            )}
          </ChromeCluster>
        </div>
      )}

      {/* Phone: one cluster low on the right, above the canvas's footer (at
          the top it sat on Excalidraw's tool row and covered its last tools). */}
      {isMobile && (
        <div className="pointer-events-none absolute bottom-[5rem] right-3 z-20 flex items-center gap-2" data-board-phone-actions="">
          <ChromeCluster label="Board tools" className="h-11 rounded-[14px] [&_button]:size-9">
            {hasEditAccess && (
              <>
                <ClusterButton label="Ask AI" active={aiOpen} onClick={() => setAiOpen((o) => !o)} className={AI_BUTTON(aiOpen)}>
                  <Sparkles />
                </ClusterButton>
                <ClusterButton label="Add a comment" active={commentMode} onClick={() => setCommentMode((m) => !m)}>
                  <MessageCircle />
                </ClusterButton>
                <ClusterButton label="Share board" onClick={() => dispatch(openUI({ key: "boardShare", data: { boardId } }))}>
                  <Share2 />
                </ClusterButton>
              </>
            )}
            {menu(
              <ClusterButton label="Board options">
                <Ellipsis />
              </ClusterButton>,
              "end",
            )}
          </ChromeCluster>
        </div>
      )}
    </div>
  );
}
