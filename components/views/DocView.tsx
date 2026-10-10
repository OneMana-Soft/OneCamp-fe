"use client";

import { displayNameOf } from "@/lib/personName"
import {useMedia} from "@/context/MediaQueryContext";
import {DocTopBarBreadcrumb} from "@/components/doc/docTopBarBreadcrumb";
import MinimalTiptapDocInput from "@/components/docEditor/docInput";
import {ActiveUsersBar} from "@/components/docEditor/ActiveUsersBar";
import { SaveForLaterButton } from "@/components/later/SaveForLater";
import {LinkedFromSection} from "@/components/entityLink/LinkedFromSection";
import {cn} from "@/lib/utils/helpers/cn";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import * as React from 'react';
import {generateColorFromUUID} from "@/lib/utils/generateColorFromUUID";
import {DocInfoResponse} from "@/types/doc";
import { MessageCircle, Loader2, Download, Keyboard, Maximize, Minimize, Ellipsis, History, Eye } from "@/lib/icons";
import { WifiOff } from "lucide-react";
import {Button} from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {useDispatch, useSelector} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {openUI} from "@/store/slice/uiSlice";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {updateDocCommentCount} from "@/store/slice/createDocCommentSlice";
import {updateUserDocTitle} from "@/store/slice/userSlice";
import {useMqttTopic} from "@/hooks/useMqttTopic";
import { DocPageSkeleton } from "@/components/doc/DocPageSkeleton";
import { useDocMessageHandlers } from "@/hooks/useDocMessageHandlers";
import { usePost } from "@/hooks/usePost";
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider";
import { warmCollabToken } from "@/lib/collabToken";
import { useDocAutoSave } from "@/hooks/useDocAutoSave";
import { escapeBelongsToLayer } from "@/hooks/useEscapeClosesPanel";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { htmlToMarkdown, downloadMarkdown } from "@/lib/utils/exportToMarkdown";
import { useToast } from "@/hooks/use-toast";
import type { Content } from '@tiptap/react'

// ---------------------------------------------------------------------------
// Keyboard shortcuts help panel
// ---------------------------------------------------------------------------
const SHORTCUTS = [
  { keys: ['Ctrl/Cmd', 'B'], action: 'Bold' },
  { keys: ['Ctrl/Cmd', 'I'], action: 'Italic' },
  { keys: ['Ctrl/Cmd', 'U'], action: 'Underline' },
  { keys: ['Ctrl/Cmd', 'K'], action: 'Add link' },
  { keys: ['Ctrl/Cmd', 'Z'], action: 'Undo' },
  { keys: ['Ctrl/Cmd', 'Shift', 'Z'], action: 'Redo' },
  { keys: ['Shift', 'Enter'], action: 'Hard break' },
  { keys: ['/'], action: 'Slash commands' },
]

function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Editor keyboard shortcuts reference. Press Escape or click outside to close.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.action}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <React.Fragment key={k}>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border text-2xs font-mono">{k}</kbd>
                    {i < s.keys.length - 1 && <span className="text-muted-foreground">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function DocView({ docId }: { docId: string }) {
    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const { toast } = useToast();

    const dispatch = useDispatch();
    const { handleDocCommentMessage, handleDocCommentReactionMessage } = useDocMessageHandlers({ userUuid: userProfile.data?.data?.user_uuid });

    // Fetch document info
    const { data: docInfoHelper, isLoading: isDocLoading, mutate: refreshDocInfo } = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    const docInfo = docInfoHelper?.data;

    const lastEditedRelative = useRelativeTime(docInfo?.doc_updated_at || null);

    // Subscribe to document MQTT topic for real-time updates
    useMqttTopic({
        topic: docInfo?.doc_mqtt_topic || "",
        onMessage: (message, topic) => {
            const messageStr = message.toString();
            handleDocCommentMessage(messageStr);
            handleDocCommentReactionMessage(messageStr);
        }
    });

    const docCommentCount = useSelector((state: RootState) => state.createDocComment.docCommentCount[docId]);

    const { isMobile, isDesktop } = useMedia();
    const { makeRequest: updateDoc } = usePost();
    const { makeRequest: recordDocView } = usePost();

    // Record a view once per doc open, after access is confirmed (docInfo only
    // loads if the caller can access it). Backend dedupes/throttles; the ref
    // guards against double-firing within a single mount.
    const viewRecordedRef = React.useRef<string | null>(null);
    useEffect(() => {
        if (!docId || !docInfo) return;
        if (viewRecordedRef.current === docId) return;
        viewRecordedRef.current = docId;
        recordDocView({
            apiEndpoint: PostEndpointUrl.RecordDocView,
            payload: { doc_uuid: docId },
            showErrorToast: false,
        }).catch(() => {
            // View tracking is best-effort; never surface an error.
        });
    }, [docId, docInfo, recordDocView]);

    useEffect(() => {
        if(docInfo) {
            dispatch(updateDocCommentCount({docId: docId, newCount: docInfo?.doc_comment_count||0}))
        }
    }, [docInfo, docId, dispatch])

    // Determine edit access
    const hasEditAccess = React.useMemo(() => {
        if (!docInfo || !userProfile.data?.data) return false;
        const userId = userProfile.data.data.user_uuid;
        const isCreator = docInfo.doc_created_by?.user_uuid === userId;
        return isCreator || (docInfo.doc_edit_access > 0);
    }, [docInfo, userProfile.data?.data]);

    const isOwner = React.useMemo(() => {
        if (!docInfo || !userProfile.data?.data) return false;
        return docInfo.doc_created_by?.user_uuid === userProfile.data.data.user_uuid;
    }, [docInfo, userProfile.data?.data]);

    // Collaboration configuration. The provider hook fetches and manages its
    // own auth token internally (the Authorization cookie is HttpOnly), so the
    // page does not need to fetch or pass a token here.
    const collaborationConfig = React.useMemo(() => {
        if (!hasEditAccess || !docId || !userProfile.data?.data) return undefined;
        return {
            enabled: true,
            documentId: docId,
            username: displayNameOf(userProfile.data.data) || 'Anonymous',
            userId: userProfile.data.data.user_uuid,
            color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "default"),
            profileKey: userProfile.data.data.user_profile_object_key,
        };
    }, [docId, userProfile.data?.data, hasEditAccess]);

    // Ask for the collaboration token while the doc's details load, so the
    // websocket finds it ready instead of waiting another round trip.
    useEffect(() => { warmCollabToken() }, []);

    // Collaboration provider
    const { provider, status: collabStatus, synced: collabSynced, activeUsers, awarenessUsers } = useCollaborationProvider(collaborationConfig);

    // ---------------------------------------------------------------------------
    // EDITOR MOUNT GATE
    // When the user has edit access we want the TipTap editor to be created
    // exactly once — already bound to the Yjs provider — rather than mounting in
    // non-collaborative mode and being torn down/rebuilt a few seconds later when
    // the WebSocket connects (the visible "re-render" flash). So we hold the
    // editor behind a skeleton until the provider object exists.
    //
    // Resilience: if the collab server is unreachable, `provider` may never
    // arrive. A fallback timer releases the gate after a short grace period so
    // the editor still mounts (non-collaborative) instead of hanging on the
    // skeleton forever.
    const needsCollabBeforeMount = !!collaborationConfig?.enabled;
    const [collabGraceElapsed, setCollabGraceElapsed] = React.useState(false);
    React.useEffect(() => {
        if (!needsCollabBeforeMount || provider) return;
        setCollabGraceElapsed(false);
        const t = setTimeout(() => setCollabGraceElapsed(true), 6000);
        return () => clearTimeout(t);
    }, [needsCollabBeforeMount, provider, docId]);

    const editorReady = !needsCollabBeforeMount || !!provider || collabGraceElapsed;

    // The banner is for a connection lost, not one being made: on opening, the
    // saved text shows while the socket connects, and "Reconnecting…" there
    // read as a fault and moved the page when it went. A first connection
    // that's slow still says so, after five seconds.
    const [everSynced, setEverSynced] = React.useState(false);
    const [slowStart, setSlowStart] = React.useState(false);
    React.useEffect(() => {
        setEverSynced(false);
        setSlowStart(false);
    }, [docId]);
    React.useEffect(() => {
        if (collabSynced) setEverSynced(true);
    }, [collabSynced]);
    React.useEffect(() => {
        if (everSynced || !collaborationConfig?.enabled) return;
        const t = setTimeout(() => setSlowStart(true), 5000);
        return () => clearTimeout(t);
    }, [everSynced, collaborationConfig?.enabled, docId]);

    // HTTP fallback auto-save. Only active when collaboration is NOT enabled
    // (read-only viewers, or environments without the collab server). When
    // collaboration is on, the Hocuspocus server is the single source of truth
    // for the body and persists it server-side, so HTTP body writes would be
    // redundant and could clobber concurrent Yjs state.
    const httpAutoSaveEnabled = hasEditAccess && !collaborationConfig?.enabled;
    const { saveStatus, lastSavedAt, scheduleSave } = useDocAutoSave({
        docId,
        enabled: httpAutoSaveEnabled,
        initialBody: docInfo?.doc_body || '',
        collaborationEnabled: collaborationConfig?.enabled,
        providerSynced: collabSynced,
        debounceMs: 4000,
    });

    // Focus mode
    const [focusMode, setFocusMode] = React.useState(false);

    // Exit focus mode on Escape so it's never a trap. Only active in focus
    // mode. An open editor menu (slash, mention, link) or popup has the key
    // first and closes, and a second Escape exits. Exiting marks the key
    // handled, so it doesn't also close a panel open beside the doc.
    React.useEffect(() => {
        if (!focusMode) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.isComposing || escapeBelongsToLayer(e)) return;
            e.preventDefault();
            setFocusMode(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [focusMode]);

    // Keyboard shortcuts modal
    const [showShortcuts, setShowShortcuts] = React.useState(false);

    // Keyboard shortcut listener
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                setShowShortcuts((prev) => !prev);
            }
        }
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleCommentClick = () => {
        if(isDesktop) {
            dispatch(openRightPanel({
                docUUID: docId,
                taskUUID: "",
                chatMessageUUID: "",
                chatUUID: "",
                channelUUID: "",
                postUUID: "",
                groupUUID: ""
            }))
        }
    }

    // Notion-like title editing
    const [docTitle, setDocTitle] = React.useState(docInfo?.doc_title || "Untitled");
    const docTitleRef = React.useRef(docTitle);
    const titleSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        docTitleRef.current = docTitle;
    }, [docTitle]);

    React.useEffect(() => {
        if (docInfo?.doc_title) {
            setDocTitle(docInfo.doc_title);
        }
    }, [docInfo?.doc_title]);

    const saveTitle = React.useCallback((newTitle: string) => {
        if (!docId || !docInfo || newTitle.trim() === docInfo.doc_title) return;
        const finalTitle = newTitle.trim() || "Untitled";
        updateDoc({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: {
                doc_uuid: docId,
                doc_title: finalTitle,
            }
        });
        // Keep the sidebar recent-docs label in sync with the rename.
        dispatch(updateUserDocTitle({ doc_uuid: docId, doc_title: finalTitle }));
    }, [docId, docInfo, updateDoc, dispatch]);

    const handleTitleChange = React.useCallback((val: string) => {
        setDocTitle(val);
        if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
        titleSaveTimeoutRef.current = setTimeout(() => saveTitle(val), 800);
    }, [saveTitle]);

    const handleTitleBlur = React.useCallback(() => {
        if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
        saveTitle(docTitleRef.current);
    }, [saveTitle]);

    const displayDocInfo = React.useMemo(() => {
        if (!docInfo) return null;
        return { ...docInfo, doc_title: docTitle };
    }, [docInfo, docTitle]);

    // Handle document body changes. In collaboration mode the Yjs provider
    // streams and persists changes, so we skip the HTTP scheduleSave to avoid
    // double-writes. The autosave path is the fallback for non-collab editing.
    const handleBodyChange = React.useCallback((content: Content) => {
        if (collaborationConfig?.enabled) return;
        if (typeof content === 'string') {
            scheduleSave(content)
        }
    }, [scheduleSave, collaborationConfig?.enabled]);

    // Export to markdown
    const handleExportMarkdown = React.useCallback(() => {
        const html = docInfo?.doc_body || '';
        if (!html.trim()) {
            toast({ title: 'Nothing to export', description: 'Document is empty.' });
            return;
        }
        const markdown = htmlToMarkdown(html);
        downloadMarkdown(docTitle || 'document', markdown);
        toast({ title: 'Exported', description: 'Document downloaded as Markdown.' });
    }, [docInfo?.doc_body, docTitle, toast]);

    // Warn before leaving if there are pending saves
    React.useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (saveStatus === 'saving' || saveStatus === 'error') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveStatus]);

    if(!docId) {
        return null;
    }

    if (isDocLoading || userProfile.isLoading) {
        return <DocPageSkeleton />;
    }

    if (!docInfo) {
        // A doc that was deleted, or one this person can't open, is the same
        // dead end from where they stand; it needs a way back, not a sentence
        // floating in the middle of an empty page.
        return (
            <EmptyState
                title="This doc isn't available"
                description="It may have been deleted, or it hasn't been shared with you. Ask whoever sent the link to share it."
                headingLevel={2}
                className="h-full"
                action={
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/app/doc">Back to docs</Link>
                    </Button>
                }
            />
        );
    }

    const editorCollaborationProp = collaborationConfig
        ? { ...collaborationConfig, activeUsers }
        : undefined;

    return (
        <div className={cn('flex flex-col h-full', focusMode && 'bg-background')}>
            {/* Desktop top bar — hidden in focus mode */}
            {!focusMode && isDesktop && (
                <div className='h-14 items-center flex justify-between p-2 pl-4 pr-4 border-b shrink-0 bg-background z-10'>
                    <DocTopBarBreadcrumb doc={displayDocInfo!} canEdit={hasEditAccess} />
                    <div className='flex items-center gap-2'>
                        {/* Active users avatars */}
                        <ActiveUsersBar users={awarenessUsers} maxShown={4} />

                        <SaveForLaterButton
                            target={{
                                itemType: "doc",
                                itemId: docId,
                                link: `/app/doc/${docId}`,
                                title: displayDocInfo?.doc_title || "Untitled doc",
                            }}
                        />

                        {/* Focus mode */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFocusMode(!focusMode)}
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            aria-label={focusMode ? 'Exit focus mode' : 'Focus mode'}
                            title={focusMode ? 'Exit focus mode' : 'Focus mode'}
                        >
                            {focusMode ? <Minimize className='h-4 w-4'/> : <Maximize className='h-4 w-4'/>}
                        </Button>

                        <Button
                            variant='ghost'
                            size="sm"
                            onClick={handleCommentClick}
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            aria-label={`Comments, ${docCommentCount || 0}`}
                            title="Comments"
                        >
                            <MessageCircle className='h-4 w-4' aria-hidden="true"/>
                            <span className="text-sm tabular-nums">{docCommentCount || 0}</span>
                        </Button>

                        {/* Export and shortcuts are occasional, so they live here
                            rather than as two more icons beside the title. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" aria-label="More doc actions" title="More">
                                    <Ellipsis className='h-4 w-4'/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportMarkdown}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export as Markdown
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowShortcuts(true)}>
                                    <Keyboard className="mr-2 h-4 w-4" />
                                    Keyboard shortcuts
                                </DropdownMenuItem>
                                {hasEditAccess && (
                                    <>
                                        <DropdownMenuItem onClick={() => dispatch(openUI({ key: "docViewers", data: { docId } }))}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            Viewed by
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => dispatch(openUI({ key: "docVersionHistory", data: { docId } }))}>
                                            <History className="mr-2 h-4 w-4" />
                                            Version history
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )}

            {/* Mobile header */}
            {!focusMode && isMobile && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background">
                    <DocTopBarBreadcrumb doc={displayDocInfo!} canEdit={hasEditAccess} />
                    {/* Comments and the document menu live in the phone's top bar
                        (mobileTopNavigationBarThirdDoc and its drawer); repeating
                        them here put two of each on screen. */}
                    <ActiveUsersBar users={awarenessUsers} maxShown={3} />
                </div>
            )}

            {/* Connection status banner */}
            {!focusMode && collaborationConfig?.enabled && (collabStatus === 'offline' || (collabStatus === 'disconnected' && (everSynced || slowStart))) && (
                <div className={cn(
                    "shrink-0 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2",
                    collabStatus === 'offline'
                        ? "bg-warning/10 text-warning-ink border-b border-warning/20"
                        : "bg-muted/50 text-muted-foreground border-b"
                )}>
                    {collabStatus === 'offline' ? (
                        <>
                            <WifiOff className="h-3 w-3" />
                            <span>Working offline. Changes will sync when you reconnect.</span>
                        </>
                    ) : (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>{everSynced ? "Reconnecting to the live editor…" : "Connecting to the live editor… You're reading the saved copy."}</span>
                        </>
                    )}
                </div>
            )}

            {/* Focus mode exit — always visible so it's never a trap; also exits on Esc. */}
            {focusMode && (
                <div className="fixed top-4 right-4 z-50">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setFocusMode(false)}
                        className="border shadow-overlay"
                        title="Exit focus mode (Esc)"
                    >
                        <Minimize className="h-4 w-4 mr-1.5" />
                        Exit focus mode
                    </Button>
                </div>
            )}

            {/* Document content area */}
            <div className="flex-1 w-full flex flex-col overflow-hidden relative">
                {!focusMode && (
                    <LinkedFromSection refType="doc" refUUID={docId} className="shrink-0 border-b bg-background/40 px-4 py-2.5" />
                )}
                {editorReady ? (
                    <MinimalTiptapDocInput
                        throttleDelay={3000}
                        className='w-full h-full'
                        editorContentClassName="pb-8"
                        output="html"
                        // A collaborative doc is saved through its socket, so
                        // the editor need not turn it into HTML at all.
                        onChange={collaborationConfig?.enabled ? undefined : handleBodyChange}
                        value={docInfo.doc_body}
                        editable={hasEditAccess}
                        editorClassName="focus:outline-none"
                        collaboration={editorCollaborationProp}
                        provider={provider || undefined}
                        providerSynced={collabSynced}
                        docId={docId}
                        title={docTitle}
                        onTitleChange={handleTitleChange}
                        onTitleBlur={handleTitleBlur}
                        editableTitle={hasEditAccess}
                        saveStatus={saveStatus}
                        lastSavedAt={lastSavedAt}
                        lastEditedAt={docInfo.doc_updated_at}
                        lastEditedRelative={lastEditedRelative}
                        focusMode={focusMode}
                    />
                ) : (
                    <div className="flex-1 w-full flex items-center justify-center">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Connecting to live editor…</span>
                        </div>
                    </div>
                )}
            </div>

            <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </div>
    );
}
