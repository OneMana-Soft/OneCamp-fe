"use client";

import { displayNameOf } from "@/lib/personName"
import * as React from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { PHONE_FOOTER, useExcalidrawParts, useExcalidrawPhoneUI } from "@/components/board/excalidrawPart";
import { cn } from "@/lib/utils/helpers/cn";
import { fromFoot, useRootPlaceOf } from "@/components/livekit/rootPlace";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { BoardsPost } from "@/services/endpoints/boards";
import { UserProfileInterface } from "@/types/user";
import { BoardInfoResponse } from "@/types/board";
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider";
import { warmCollabToken } from "@/lib/collabToken";
import { usePost } from "@/hooks/usePost";
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID";
import { Loader2, Share2, Ellipsis, Trash, MessageCircle, History, Eye, WifiOff, LayoutGrid, Search, HelpCircle, Download, Upload, Library, Layers, Plus, LayoutTemplate, Filter } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { LoadFailureState } from "@/components/ui/load-failure-state";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { ActiveUsersBar } from "@/components/docEditor/ActiveUsersBar";
import { DocBusContext } from "@/components/docEditor/registry/commandBus";
import { boardBusOf } from "@/lib/board/hereNow";
import { saveDotCopy } from "@/components/docEditor/SaveDot";
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
import BoardCanvas from "@/components/board/boardCanvas";
import { useBoardTheme } from "@/components/board/useBoardTheme";
import { BoardTitleCluster, ChromeCluster, ClusterButton, ClusterDivider, boardSaveState, useDrawingFade } from "@/components/board/boardChrome";
import { useBoardGrid, useBoardSnap, useBoardStyle } from "@/components/board/boardStyle";
import type { BoardCommand } from "@/components/board/boardWorkbench";
import type BoardFacilitationPart from "@/components/board/boardFacilitation";
import { lazyPart } from "@/lib/lazy/lazyPart";
import { FacilitationFailed } from "@/components/board/facilitationDock";
import BoardComments from "@/components/board/boardComments";
import { LinkedFromSection } from "@/components/entityLink/LinkedFromSection";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// "board:" namespace prefix shared with the collaboration service so a single
// Hocuspocus server routes board vs doc documents to the right backend.
const BOARD_DOC_PREFIX = "board:";

// The board's tools (templates, the sticky tool, the notes bar, frames), in a
// chunk loaded after the canvas paints: the route's first load stays the
// canvas and its chrome.
const BoardWorkbench = dynamic(() => import("@/components/board/boardWorkbench"), { ssr: false });
// A phone's board draws no save dot: the app's notice says what it would, as a
// doc's does (V-45: V-21's DocSaveNotice), loaded only where it's drawn.
const DocSaveNotice = dynamic(() => import("@/components/docEditor/DocSaveNotice").then((m) => m.DocSaveNotice), { ssr: false });
// Timer, dot voting and follow-the-presenter draw over the canvas, so never before Excalidraw is up: a
// chunk of its own (lib/lazy), fetched as the page opens, and kept out of the route's first load. When it
// can't come, its dock says so (FacilitationFailed: to an editor at once, to a viewer once something is on).
const facilitation = lazyPart<React.ComponentProps<typeof BoardFacilitationPart>>(() => import("@/components/board/boardFacilitation").then((m) => m.default), {
  failed: FacilitationFailed,
});

export default function BoardPage() {
  const params = useParams();
  const boardId = params?.["board-id"] as string;
  const dispatch = useDispatch();
  const router = useRouter();
  const { isMobile } = useMedia();
  const canvasTheme = useBoardTheme();

  const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  // The board's own bus for its presence stack: Here now's Jump to and Follow (components/board/boardHereNow).
  const hereBus = React.useMemo(() => boardBusOf(boardId), [boardId]);
  // Who's here, as the facilitation bar and the notes bar's Vote name them.
  const me = React.useMemo(() => {
    const p = userProfile.data?.data;
    return p ? { id: p.user_uuid, name: displayNameOf(p) || "Someone" } : undefined;
  }, [userProfile.data]);
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
  React.useEffect(() => { void facilitation.warm() }, []);
  const { provider, status: collabStatus, synced, awarenessUsers } =
    useCollaborationProvider(collaborationConfig);

  // Excalidraw imperative API, lifted so the board tools can reach the live
  // scene.
  const [excalApi, setExcalApi] = React.useState<ExcalidrawImperativeAPI | null>(null);
  const [commentMode, setCommentMode] = React.useState(false);
  // The grid is the board's, for everyone (miro-02 1); those who can edit set it.
  const [gridOn, setGrid] = useBoardGrid(excalApi, provider ?? null, synced, hasEditAccess);
  // Snapping to shapes and equal gaps is each person's, on until they turn it off (miro-02 3).
  const [snapOn, setSnap] = useBoardSnap(excalApi);
  const [showResolved, setShowResolved] = React.useState(false);
  // The wrapper as state, not a ref: the page draws its loading state first,
  // so the wrapper comes after the first render, and what watches it (the
  // footer's place, the drawing fade) starts once it's there.
  const [wrap, setWrap] = React.useState<HTMLDivElement | null>(null);
  // On a phone the board's foot is a stack: Excalidraw's footer (undo, redo,
  // the style palette, delete), the board's own buttons, the facilitation bar,
  // and a selection's bar (components/board/phoneDock), each marked
  // data-phone-foot. The highest top among them is published as a composer's is
  // (--mobile-drawer-h, app/phone.css C9), so the save notice, the offline pill
  // and every board toast sit above the stack instead of over its controls.
  const foot = useExcalidrawParts(wrap, `${PHONE_FOOTER}, [data-phone-foot]`, isMobile);
  useRootPlaceOf("--mobile-drawer-h", foot, fromFoot);
  useDrawingFade(wrap, excalApi);
  // Excalidraw draws its phone UI on its own box (under 730 wide, or under 500
  // tall and 1000 wide): a 700 window, a tablet held upright, 960 with the
  // sidebar expanded. Its tool row then runs along the canvas's top, so on a
  // computer the board's two clusters dock in a band above the canvas instead
  // of floating over the row's ends (V-75). A phone has the app's own title
  // bar and the board's cluster low on the right.
  const docked = useExcalidrawPhoneUI(wrap) && !isMobile;

  // A press in the chrome for one of the board's tools (lazy, the workbench).
  const [command, setCommand] = React.useState<BoardCommand | null>(null);
  const run = (kind: BoardCommand["kind"]) => setCommand({ kind, at: Date.now() });
  const [boardStyle, setBoardStyle] = useBoardStyle(provider ?? null, synced);

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
      apiEndpoint: BoardsPost.RecordBoardView,
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
        apiEndpoint: BoardsPost.UpdateBoard,
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
        {/* A computer has these at the top; a phone's cluster has no room. */}
        {isMobile && hasEditAccess && (
          <>
            <DropdownMenuItem onClick={() => run("templates")}>
              <LayoutGrid className="mr-2 size-4" />
              Templates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("frames")}>
              <Layers className="mr-2 size-4" />
              Frames
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {excalApi && (
          <>
            {/* PDF of the frames, the notes as CSV, a board file or a picture (miro-36). */}
            <DropdownMenuItem onClick={() => run("export")}>
              <Download className="mr-2 size-4" />
              Export…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => excalApi.toggleSidebar({ name: "default", tab: "library" })}>
              <Library className="mr-2 size-4" />
              Library
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => excalApi.toggleSidebar({ name: "default", tab: "search" })}>
              <Search className="mr-2 size-4" />
              Find on board
            </DropdownMenuItem>
            {/* Notes without the tags picked fade back, on this screen only (miro-07 5). */}
            <DropdownMenuItem onClick={() => run("tagFilter")}>
              <Filter className="mr-2 size-4" />
              Filter by tag
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={gridOn === true} disabled={!hasEditAccess || gridOn === null} onCheckedChange={setGrid}>
              Show grid
            </DropdownMenuCheckboxItem>
            {hasEditAccess ? (
              <DropdownMenuCheckboxItem checked={snapOn} onCheckedChange={setSnap}>
                Snap to shapes
              </DropdownMenuCheckboxItem>
            ) : null}
            <DropdownMenuCheckboxItem checked={showResolved} onCheckedChange={setShowResolved}>
              Show resolved comments
            </DropdownMenuCheckboxItem>
            {hasEditAccess && boardStyle ? (
              <DropdownMenuCheckboxItem checked={boardStyle === "sketch"} onCheckedChange={(on) => setBoardStyle(on ? "sketch" : "clean")}>
                Hand-drawn style
              </DropdownMenuCheckboxItem>
            ) : null}
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
            {/* For anyone in the workspace to start a board from (miro-19 3). */}
            <DropdownMenuItem onClick={() => run("saveTemplate")} disabled={!excalApi}>
              <LayoutTemplate className="mr-2 size-4" />
              Save as template
            </DropdownMenuItem>
            {/* An .excalidraw file's drawing, laid where you're looking. */}
            <DropdownMenuItem onClick={() => run("openFile")} disabled={!excalApi}>
              <Upload className="mr-2 size-4" />
              Open a board file…
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
    // height, and the board's controls float over it at the top corners;
    // docked, they sit in a band of their own and the canvas starts under it.
    <div ref={setWrap} className="relative h-full overflow-hidden" data-board-page="" data-board-docked={docked ? "" : undefined}>
      {docked && <div aria-hidden className="absolute inset-x-0 top-0 h-16 border-b border-line bg-sheet" />}
      {/* Canvas */}
      <div className={cn("absolute inset-x-0 bottom-0", docked ? "top-16" : "top-0")}>
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
            theme={canvasTheme}
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

        {/* The board's tools: templates, the sticky tool, the notes and frame bars, frames. */}
        {provider && (
          <BoardWorkbench api={excalApi} provider={provider} boardId={boardId} editable={hasEditAccess} synced={synced} quiet={false} command={command} style={boardStyle} title={title} user={me} host={wrap} />
        )}

        {/* Timer, dot voting and follow-the-presenter */}
        {provider && excalApi && me && (
          <facilitation.Part provider={provider} api={excalApi} editable={hasEditAccess} user={me} />
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

      {/* The top row: back, name, save dot and More on the left; who is here,
          templates, comments and Share on the right. The name gives way
          first, so the two never meet on a narrow board. */}
      {!isMobile && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
          <div className={cn("flex min-w-0 gap-2", docked ? "items-center" : "flex-col items-start")}>
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
                className="content-float pointer-events-auto flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-pop px-2.5 text-meta text-ink-2 shadow-e3"
              >
                {collabStatus === "offline" ? (
                  <>
                    <WifiOff className="size-3.5 text-camp-sun-ink" />
                    <span>{saveDotCopy("offline")}</span>
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
          <div className="shrink-0">
            <ChromeCluster label="Board tools">
              {awarenessUsers.length > 0 && (
                <>
                  {/* Here now's Jump to and Follow, for a board (miro-04 4): the workbench answers on this bus. */}
                  <DocBusContext.Provider value={hereBus}>
                    <ActiveUsersBar users={awarenessUsers} maxShown={4} className="px-1" />
                  </DocBusContext.Provider>
                  <ClusterDivider />
                </>
              )}
              {hasEditAccess && (
                <>
                  <ClusterButton label="Templates" onClick={() => run("templates")}>
                    <LayoutGrid />
                  </ClusterButton>
                  <ClusterButton label="Frames" onClick={() => run("frames")}>
                    <Layers />
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
        </div>
      )}

      {/* Phone: changes that wait while offline, said in the app's notice (an editor's). */}
      {isMobile && hasEditAccess && provider && (
        <DocSaveNotice source={{ provider, live: true, collabStatus, synced, everSynced: synced }} thing="board" />
      )}

      {/* Phone: one cluster low on the right, above the canvas's footer (at
          the top it sat on Excalidraw's tool row and covered its last tools). */}
      {isMobile && (
        <div className="pointer-events-none absolute bottom-[5rem] right-3 z-20 flex items-center gap-2" data-board-phone-actions="" data-phone-foot="">
          <ChromeCluster label="Board tools" className="h-11 rounded-[14px] [&_button]:size-9">
            {hasEditAccess && (
              <>
                <ClusterButton label="Add a note" onClick={() => run("note")}>
                  <Plus />
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
