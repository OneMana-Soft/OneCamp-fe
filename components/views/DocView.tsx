"use client";

import { displayNameOf } from "@/lib/personName"
import {useMedia} from "@/context/MediaQueryContext";
import MinimalTiptapDocInput from "@/components/docEditor/docInput";
import {ActiveUsersBar} from "@/components/docEditor/ActiveUsersBar";
import { DocHeader, DocShortcutsDialog } from "@/components/docEditor/DocHeader";
import { ConnectionPill } from "@/components/docEditor/ConnectionPill";
import { docSaveState, useSlowSave } from "@/components/docEditor/docSaveState";
import type { Editor } from "@tiptap/react";
import {LinkedFromSection} from "@/components/entityLink/LinkedFromSection";
import {cn} from "@/lib/utils/helpers/cn";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import * as React from 'react';
import {generateColorFromUUID} from "@/lib/utils/generateColorFromUUID";
import {DocInfoResponse} from "@/types/doc";
import { Minimize2 } from "@/lib/icons";
import {Button} from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotError } from "@/components/ui/graphics";
import Link from "next/link";
import {useDispatch, useSelector} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {openUI} from "@/store/slice/uiSlice";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {updateDocCommentCount} from "@/store/slice/createDocCommentSlice";
import {updateUserDocTitle} from "@/store/slice/userSlice";
import {useMqttTopic} from "@/hooks/useMqttTopic";
import { DocBodySkeleton, DocPageSkeleton } from "@/components/doc/DocPageSkeleton";
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
// Main page
// ---------------------------------------------------------------------------
export function DocView({ docId }: { docId: string }) {
    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const { toast } = useToast();

    const dispatch = useDispatch();
    const { handleDocCommentMessage, handleDocCommentReactionMessage } = useDocMessageHandlers({ userUuid: userProfile.data?.data?.user_uuid });

    // Fetch document info
    // A doc that's gone answers with an error: the page says so itself below,
    // so the server's words ("Failed to dgraph doc info from dgraph") don't
    // also pop up as a toast.
    const { data: docInfoHelper, isLoading: isDocLoading, mutate: refreshDocInfo } = useFetch<DocInfoResponse>(
        docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '',
        undefined,
        undefined,
        { suppressErrorToast: true } as never,
    );
    const docInfo = docInfoHelper?.data;

    // A doc never edited since it was made has no update time: its creation stands in.
    const editedAt = docInfo?.doc_updated_at && !docInfo.doc_updated_at.startsWith("0001") ? docInfo.doc_updated_at : docInfo?.doc_created_at;
    const lastEditedRelative = useRelativeTime(editedAt || null);

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

    // A connection lost, not one being made: on opening, the saved text shows
    // while the socket connects, and the save dot says "connecting" (a ring),
    // never a banner. The pill (D13) is for a connection that was live.
    const [everSynced, setEverSynced] = React.useState(false);
    React.useEffect(() => {
        setEverSynced(false);
    }, [docId]);
    React.useEffect(() => {
        if (collabSynced) setEverSynced(true);
    }, [collabSynced]);

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
    // Full width (the More menu's toggle): the page at 1,040 px.
    const [fullWidth, setFullWidth] = React.useState(false);
    // The editor, for what the header shows from it (the word count in More).
    const [editor, setEditor] = React.useState<Editor | null>(null);
    // The header's hairline shows once the body has scrolled.
    const [scrolled, setScrolled] = React.useState(false);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const onScroll = (e: Event) => {
            const t = e.target as HTMLElement;
            if (t?.classList?.contains("doc-scroll")) setScrolled(t.scrollTop > 4);
        };
        el.addEventListener("scroll", onScroll, true);
        return () => el.removeEventListener("scroll", onScroll, true);
    });
    // In focus mode the exit shows while the pointer moves, and fades after 2 s.
    const [focusChrome, setFocusChrome] = React.useState(true);
    React.useEffect(() => {
        if (!focusMode) return;
        let t: ReturnType<typeof setTimeout>;
        const wake = () => {
            setFocusChrome(true);
            clearTimeout(t);
            t = setTimeout(() => setFocusChrome(false), 2000);
        };
        wake();
        window.addEventListener("pointermove", wake);
        return () => {
            clearTimeout(t);
            window.removeEventListener("pointermove", wake);
        };
    }, [focusMode]);

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
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            if (e.key === '?') setShowShortcuts((prev) => !prev);
            else if (e.key === 'F' && e.shiftKey) setFocusMode((f) => !f);
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

    // The save dot's state (D12): live docs from the socket, others from their autosave.
    const slowSave = useSlowSave(collaborationConfig?.enabled ? provider : null);
    const saveState = docSaveState({
        live: !!collaborationConfig?.enabled,
        collabStatus,
        synced: collabSynced,
        everSynced,
        slowSave,
        saveStatus,
    });
    const connectionProblem = !collaborationConfig?.enabled
        ? null
        : collabStatus === 'offline'
        ? 'offline' as const
        : collabStatus === 'disconnected' && everSynced
        ? 'reconnecting' as const
        : null;

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
                illustration={<SpotError />}
                title="This doc isn't available"
                description="It may have been deleted, or it hasn't been shared with you. Ask whoever sent the link to share it."
                headingLevel={2}
                // As a table that isn't there reads: near the top, with its drawing.
                className="py-20"
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
        <div className={cn('flex flex-col h-full bg-sheet', focusMode && 'doc-focus')}>
            {/* The header (D05): hidden in focus mode and on phones, where
                the app bar names the doc. */}
            {!focusMode && isDesktop && (
                <DocHeader
                    doc={docInfo}
                    title={docTitle}
                    canEdit={hasEditAccess}
                    canShare={hasEditAccess}
                    scrolled={scrolled}
                    saveState={saveState}
                    savedAt={lastSavedAt}
                    live={!!collaborationConfig?.enabled}
                    users={awarenessUsers}
                    commentCount={docCommentCount || 0}
                    onComments={handleCommentClick}
                    onRename={(t) => { setDocTitle(t); saveTitle(t); }}
                    onShare={() => dispatch(openUI({ key: 'docShare', data: docInfo.doc_uuid }))}
                    focusMode={focusMode}
                    onFocusMode={() => setFocusMode((f) => !f)}
                    fullWidth={fullWidth}
                    onFullWidth={() => setFullWidth((w) => !w)}
                    onExport={handleExportMarkdown}
                    onShortcuts={() => setShowShortcuts(true)}
                    onViewers={() => dispatch(openUI({ key: "docViewers", data: { docId } }))}
                    onHistory={() => dispatch(openUI({ key: "docVersionHistory", data: { docId } }))}
                    editor={editor}
                />
            )}

            {/* On a phone the app bar names the doc and its menu has Share, so
                this row only shows who else is here, and only when someone is. */}
            {!focusMode && isMobile && awarenessUsers.length > 1 && (
                <div className="shrink-0 flex items-center justify-end px-3 py-1.5" data-doc-presence-row="">
                    <ActiveUsersBar users={awarenessUsers} maxShown={3} />
                </div>
            )}

            {/* Focus mode exit (D26): a 28 px ghost that shows while the
                pointer moves and fades after 2 s; Esc exits too. */}
            {focusMode && (
                <div className={cn("fixed top-4 right-4 z-50 transition-opacity duration-[240ms]", focusChrome ? "opacity-100" : "opacity-0")}>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setFocusMode(false)}
                        className="bg-pop shadow-e3"
                        aria-label="Exit focus mode"
                        title="Exit focus mode (Esc)"
                    >
                        <Minimize2 className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Document content area */}
            <div ref={bodyRef} className="flex-1 w-full flex flex-col overflow-hidden relative">
                {!focusMode && <ConnectionPill problem={connectionProblem} />}
                {!focusMode && (
                    <LinkedFromSection refType="doc" refUUID={docId} className="shrink-0 px-5 py-2" />
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
                        lastEditedRelative={lastEditedRelative}
                        focusMode={focusMode}
                        fullWidth={fullWidth}
                        authorName={displayNameOf(docInfo.doc_created_by) || undefined}
                        onEditor={setEditor}
                        onComment={handleCommentClick}
                    />
                ) : (
                    <DocBodySkeleton />
                )}
            </div>

            <DocShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </div>
    );
}
