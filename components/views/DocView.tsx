"use client";

import { displayNameOf } from "@/lib/personName"
import { OWN_ERRORS } from "@/lib/axiosInstance";
import {useMedia} from "@/context/MediaQueryContext";
import MinimalTiptapDocInput from "@/components/docEditor/docInput";
import {ActiveUsersBar} from "@/components/docEditor/ActiveUsersBar";
import { DocHeader, DocShortcutsDialog } from "@/components/docEditor/DocHeader";
import { ConnectionPill } from "@/components/docEditor/ConnectionPill";
import { RecoveredEditsBanner } from "@/components/docEditor/RecoveredEditsBanner";
import type { DocSaveSource } from "@/components/docEditor/docSaveState";
import { useLeaveGuard } from "@/components/docEditor/leaveGuard";
import { hasPendingImageUploads } from "@/components/minimal-tiptap/extensions/image/uploads";
import type { Editor } from "@tiptap/react";
import {cn} from "@/lib/utils/helpers/cn";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { ProjectsPost } from "@/services/endpoints/projects";
import { UserProfileInterface } from "@/types/user";
import * as React from 'react';
import {generateColorFromUUID} from "@/lib/utils/generateColorFromUUID";
import {DocInfoResponse} from "@/types/doc";
import { Minimize2, RefreshCw } from "@/lib/icons";
import { canRestoreDeleted, docLoadFailure, hostedPlace } from "@/components/docEditor/docLoadFailure";
import { LoadFailureState } from "@/components/ui/load-failure-state";
import {Button} from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotError } from "@/components/ui/graphics";
import {useDispatch, useSelector} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {openUI} from "@/store/slice/uiSlice";
import {injectSlice, type RootState} from "@/store/store";
import {useEffect} from "react";
import {createDocCommentSlice, updateDocCommentCount} from "@/store/slice/createDocCommentSlice";
import { useDocFullWidth } from "@/components/docEditor/docFullWidth";
import { useRouter } from "next/navigation";
import { docRenamed } from "@/lib/docCache";
import { identityHue } from "@/lib/identityHue";
import { createTitleStore } from "@/components/docEditor/docTitleStore";
import {useMqttTopic} from "@/hooks/useMqttTopic";
import { DocBodySkeleton, DocPageSkeleton } from "@/components/doc/DocPageSkeleton";
import { usePost } from "@/hooks/usePost";
import { useDocSession, type DocAccessLevel } from "@/hooks/useDocSession";
import { useDocAbilities } from "@/hooks/useDocAbilities";
import { DocAccessNote } from "@/components/docEditor/DocAccessNote";
import { DocAccessRequests } from "@/components/docEditor/DocAccessRequests";
import { warmCollabToken } from "@/lib/collabToken";
import { onEscape } from "@/lib/keys/onEscape";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { useLaterActions, useSavedEntry } from "@/hooks/useLater";
import "@/components/docEditor/registry";
import { DocBusContext, provideActionContext, providePaletteEntries, useDocCommand, useDocCommandBus } from "@/components/docEditor/registry/commandBus";
import { paletteEntriesFor } from "@/components/docEditor/registry/readers";
import { MORE_GROUPS } from "@/components/docEditor/actions/doc";
import { useEditionGate } from "@/components/docEditor/registry/gate";
import { useActionKeys } from "@/components/docEditor/registry/actionKeys";
import { DialogOutlet, rootClassesFor, SlotOutlet, useRegistryVersion } from "@/components/docEditor/registry/slots";
import { dialogFor, panelFor } from "@/components/docEditor/registry/registry";
import type { ActionContext } from "@/components/docEditor/registry/types";

// B6's pages for a doc that can't open: they load when one is shown.
const NoAccessPage = React.lazy(() => import("@/components/docEditor/NoAccessPage"));
const TrashedBanner = React.lazy(() => import("@/components/docEditor/TrashedBanner"));

// A doc's comments join the store with the doc's page (store/lazySlices.ts).
injectSlice(createDocCommentSlice);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function DocView({ docId }: { docId: string }) {
    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const gate = useEditionGate();

    const dispatch = useDispatch();

    // Fetch document info
    // A doc that's gone answers with an error: the page says so itself below,
    // so the server's words ("Failed to dgraph doc info from dgraph") don't
    // also pop up as a toast.
    const { data: docInfoHelper, isLoading: isDocLoading, isError: docLoadError, mutate: refreshDocInfo } = useFetch<DocInfoResponse>(
        docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '',
        undefined,
        undefined,
        OWN_ERRORS,
    );
    const docInfo = docInfoHelper?.data;

    // A doc never edited since it was made has no update time: its creation stands in.
    const editedAt = docInfo?.doc_updated_at && !docInfo.doc_updated_at.startsWith("0001") ? docInfo.doc_updated_at : docInfo?.doc_created_at;
    const lastEditedRelative = useRelativeTime(editedAt || null);

    // The doc's live topic: subscribing brings its comment events in, and
    // the global router handles each one, once (useMqttMessageHandler). This
    // page handled every one again, so the comment count moved by two, and
    // fed comment events to the reaction handler and the other way round.
    useMqttTopic({ topic: docInfo?.doc_mqtt_topic || "" });

    const docCommentCount = useSelector((state: RootState) => state.createDocComment?.docCommentCount[docId]);
    const router = useRouter();
    // A table row's page opened as a doc (docs D-18): the server says which
    // row it belongs to, and the page goes there.
    const hosted = docInfoHelper ? null : hostedPlace(docLoadError);
    const hostedPath = hosted?.path;
    useEffect(() => {
        if (hostedPath) router.replace(hostedPath);
    }, [hostedPath, router]);

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
            apiEndpoint: ProjectsPost.RecordDocView,
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

    // What this person may do, as the server decided it (lib/docs/abilities):
    // every surface below asks it, never the counts or the sharing lists.
    const abilities = useDocAbilities(docInfo);
    const hasEditAccess = !!docInfo && abilities.edit;

    // Its owner: whoever it was handed to last, or its maker.
    const isOwner = React.useMemo(() => {
        if (!docInfo || !userProfile.data?.data) return false;
        const owner = docInfo.doc_owner?.user_uuid || docInfo.doc_created_by?.user_uuid;
        return owner === userProfile.data.data.user_uuid;
    }, [docInfo, userProfile.data?.data]);

    // Collaboration configuration. The provider hook fetches and manages its
    // own auth token internally (the Authorization cookie is HttpOnly), so the
    // page does not need to fetch or pass a token here.
    // What the editor holds, for the edits a tab keeps aside when its copy of
    // the doc is replaced (useCollaborationProvider "ONE COPY").
    const editorRef = React.useRef<Editor | null>(null);
    const handleEditor = React.useCallback((ed: Editor | null) => {
        editorRef.current = ed;
        setEditor(ed);
    }, []);
    const keepEdits = React.useCallback(() => {
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) return null;
        return { html: ed.getHTML(), text: ed.getText() };
    }, []);
    // The doc's live session (hooks/useDocSession; A2 builds it out): it
    // connects from the doc's id at once, before its details or the profile
    // arrive, and says what the server decided. The level the details give is
    // only for an older server.
    const docLevel: DocAccessLevel = !docInfo ? 'none' : abilities.level;
    const sessionUser = React.useMemo(() => {
        const me = userProfile.data?.data;
        return me ? { id: me.user_uuid, name: displayNameOf(me) || 'Anonymous', color: generateColorFromUUID(me.user_uuid || "default"), profileKey: me.user_profile_object_key } : undefined;
    }, [userProfile.data?.data]);
    const session = useDocSession({ docId, user: sessionUser, level: docLevel, keepEdits });
    const { provider, status: collabStatus, synced: collabSynced, activeUsers, awarenessUsers, recovered, dismissRecovered, retry: retryCollab } = session;

    // The editor's side of the live doc, for everyone the session connects (a
    // reader too, once the session joins readers live): who this person is to
    // everyone else, in their identity hue (lib/identityHue), the colour of
    // their avatar, and what the tab keeps aside if its copy is replaced.
    const live = hasEditAccess || !!provider;
    const collaborationConfig = React.useMemo(() => {
        if (!live || !docId || !userProfile.data?.data) return undefined;
        return {
            enabled: true,
            documentId: docId,
            username: displayNameOf(userProfile.data.data) || 'Anonymous',
            userId: userProfile.data.data.user_uuid,
            color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "default"),
            // The hue every tab draws this person's caret and face in: their
            // avatar's (lib/identityHue).
            hue: identityHue({ name: displayNameOf(userProfile.data.data), id: userProfile.data.data.user_uuid }),
            profileKey: userProfile.data.data.user_profile_object_key,
            keepEdits,
        };
    }, [live, docId, userProfile.data?.data, keepEdits]);

    // Ask for the collaboration token while the doc's details load, so the
    // websocket finds it ready instead of waiting another round trip.
    useEffect(() => { warmCollabToken() }, []);

    const collabReadOnly = hasEditAccess && !session.access.canEdit;
    const editorCollaborationProp = React.useMemo(
        () => (collaborationConfig ? { ...collaborationConfig, activeUsers } : undefined),
        [collaborationConfig, activeUsers],
    );

    // ---------------------------------------------------------------------------
    // EDITOR MOUNT GATE
    // When the user has edit access the TipTap editor is created exactly once,
    // already bound to the Yjs provider, rather than mounting non-collaborative
    // and being rebuilt when the socket connects (the visible flash). The
    // session makes its provider at once (a refused or failed load is said by
    // the session, never shown as an empty doc), so the gate waits on nothing
    // else.
    const needsCollabBeforeMount = hasEditAccess;
    const editorReady = !needsCollabBeforeMount || !!provider;

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

    // Focus mode
    const [focusMode, setFocusMode] = React.useState(false);
    // Full width (the More menu's toggle): the page at 1,040 px, kept per doc.
    const [fullWidth, toggleFullWidth] = useDocFullWidth(docId, docInfo?.doc_full_width);
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
    // first and closes, and a second Escape exits. Exiting uses the key, so
    // it doesn't also close a panel open beside the doc.
    React.useEffect(() => (focusMode ? onEscape('overlay', () => setFocusMode(false)) : undefined), [focusMode]);

    // Keyboard shortcuts modal
    const [showShortcuts, setShowShortcuts] = React.useState(false);

    const rootRef = React.useRef<HTMLDivElement>(null);

    // Save for later (L, and More's item): the doc in the member's Later list.
    const saved = useSavedEntry("doc", docId);
    const { save: saveLater, remove: removeLater } = useLaterActions();

    // Stable, like every prop the editor gets: it's memoised, so the page's
    // own changes (presence, scrolling, the save dot) don't render it again.
    // The doc's comments: beside it, or on a phone their page. Comment on a
    // selection starts an anchored thread instead (B7's CommentsOverlay claims
    // the bus's 'comment'); this opens the comments as they are.
    const handleCommentClick = React.useCallback(() => {
        if (!isDesktop) {
            // The phone and the tablet have no side panel: the comments page.
            router.push(`/app/doc/${docId}/comment`);
            return;
        }
        dispatch(openRightPanel({
            docUUID: docId,
            taskUUID: "",
            chatMessageUUID: "",
            chatUUID: "",
            channelUUID: "",
            postUUID: "",
            groupUUID: ""
        }))
    }, [isDesktop, dispatch, docId, router])

    // The title while it's typed: in a store only the title field and the
    // breadcrumb subscribe to, so a key typed in it doesn't render this page
    // and the editor again (docTitleStore.ts). A doc with no title starts
    // empty: "Untitled" is only the placeholder (D-6).
    const [titleStore] = React.useState(() => createTitleStore(docInfo?.doc_title ?? ""));
    const titleSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        if (docInfo?.doc_title) {
            titleStore.set(docInfo.doc_title);
        }
    }, [docInfo?.doc_title, titleStore]);

    // The title the server last has. Compared with the one the doc was
    // opened with, a title typed, saved and then typed back was never saved
    // again, and every blur sent the same title once more.
    const savedTitleRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        savedTitleRef.current = docInfo?.doc_title ?? null;
    }, [docInfo?.doc_title]);

    const docLoaded = !!docInfo;
    const saveTitle = React.useCallback((newTitle: string) => {
        if (!docId || !docLoaded) return;
        // A blank title is never saved, so "Untitled" is never stored (D-6).
        const finalTitle = newTitle.trim();
        if (!finalTitle || finalTitle === savedTitleRef.current) return;
        const before = savedTitleRef.current;
        savedTitleRef.current = finalTitle;
        updateDoc({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: {
                doc_uuid: docId,
                doc_title: finalTitle,
            }
        }).then(() => {
            // The sidebar, the docs lists, the phone's bar and the comment page.
            docRenamed(dispatch, docId, finalTitle);
        }).catch(() => {
            savedTitleRef.current = before;
        });
    }, [docId, docLoaded, updateDoc, dispatch]);

    const handleTitleChange = React.useCallback((val: string) => {
        titleStore.set(val);
        if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
        titleSaveTimeoutRef.current = setTimeout(() => saveTitle(val), 800);
    }, [saveTitle, titleStore]);

    const handleTitleBlur = React.useCallback(() => {
        if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
        saveTitle(titleStore.get());
    }, [saveTitle, titleStore]);

    // What the save dot (D12) follows: a live doc's socket; a reader's copy
    // has nothing to save. The dot reads where this tab's edits stand itself
    // (DocHeader's DocSaveDot): that changes with every key, and when this page
    // read it, the page and all it draws rendered again two to four times a key.
    const savesLive = !!collaborationConfig?.enabled;
    const saveSource = React.useMemo<DocSaveSource>(
        () => ({ provider: savesLive ? provider : null, live: savesLive, collabStatus, synced: collabSynced, everSynced }),
        [savesLive, provider, collabStatus, collabSynced, everSynced],
    );
    const connectionProblem = !collaborationConfig?.enabled
        ? null
        : collabStatus === 'offline'
        ? 'offline' as const
        : collabStatus === 'disconnected' && everSynced
        ? 'reconnecting' as const
        : null;

    // Ask before the tab closes on work that would be lost: edits the
    // collaboration server hasn't confirmed (typed offline, or while it is
    // slow: a live doc keeps no local copy), an image still uploading (only
    // this tab has the file), or an HTTP save still going. It used to watch
    // the HTTP save alone, which a live doc never uses.
    useLeaveGuard({
        provider: collaborationConfig?.enabled ? provider : null,
        pending: () => hasPendingImageUploads(editor),
    });

    // ---------------------------------------------------------------------------
    // THE DOC'S SHELL: its command bus and what it answers (PROGRAM.md §4 #3).
    // Every action (More, the phone's sheet, the bars, the page's keys, the
    // palette) asks through the bus; the page keeps the state they show.
    const bus = useDocCommandBus(docId, editor);
    const toggleSaved = React.useCallback(() => {
        if (saved) void removeLater(saved.id).catch(() => {});
        else void saveLater({ item_type: "doc", item_id: docId, link: `/app/doc/${docId}`, title: titleStore.get() || "Untitled doc", remind_at: null }).catch(() => {});
    }, [saved, removeLater, saveLater, docId, titleStore]);
    // Who may open Share: the header's button and the phone's sheet ask this
    // one rule (QA DSA-14: the sheet offered it to readers). B6: an editor
    // opens Share too, to invite up to Can edit; full access changes
    // everything else.
    const canShare = abilities.edit;
    const actionContext = React.useCallback((): ActionContext => ({
        docId,
        editor: editorRef.current,
        canEdit: hasEditAccess && !collabReadOnly,
        abilities,
        bus,
        gate,
        state: { focusMode, fullWidth, saved: !!saved, desktop: isDesktop, owner: isOwner, canShare, title: titleStore.get() },
    }), [docId, hasEditAccess, collabReadOnly, abilities, bus, gate, focusMode, fullWidth, saved, isDesktop, isOwner, canShare, titleStore]);
    useActionKeys(rootRef, actionContext, gate);
    // The palette offers this doc's actions while it is the one open (or used last).
    React.useEffect(() => providePaletteEntries(bus, () => paletteEntriesFor(actionContext(), MORE_GROUPS)), [bus, actionContext]);
    // And the phone's doc sheet draws them in this page's context, as More does.
    React.useEffect(() => provideActionContext(bus, actionContext), [bus, actionContext]);

    useDocCommand(bus, 'toggle', ({ what }) => {
        if (what === 'focusMode') setFocusMode((f) => !f);
        else if (what === 'fullWidth') toggleFullWidth();
        else if (what === 'saved') toggleSaved();
        else if (what === 'shortcuts') setShowShortcuts((prev) => !prev);
    });
    // Comment on the selection: the doc's comments, with it quoted, unless a
    // listener claimed it as it heard it (A8's anchored threads will).
    useDocCommand(bus, 'comment', (asked) => {
        queueMicrotask(() => {
            if (!asked.claimed) handleCommentClick();
        });
    });
    useDocCommand(bus, 'openPanel', ({ kind }) => {
        if (kind === 'comments') handleCommentClick();
        else if (kind === 'viewers') dispatch(openUI({ key: "docViewers", data: { docId } }));
        else if (panelFor(kind, gate)) dispatch(openRightPanel({ docPanel: { kind, docId } }));
    });
    // A dialog over this doc: the page's own, or one a package registered.
    useRegistryVersion();
    const [dialogId, setDialogId] = React.useState<string | null>(null);
    const openDialog = React.useCallback((id: string) => {
        if (id === 'doc.share') dispatch(openUI({ key: 'docShare', data: docId }));
        else if (id === 'doc.rename') dispatch(openUI({ key: 'docUpdateTitle', data: { docId, title: titleStore.get() } }));
        else if (dialogFor(id, gate)) setDialogId(id);
    }, [dispatch, docId, titleStore, gate]);
    useDocCommand(bus, 'openDialog', ({ id }) => openDialog(id));
    // A package's dialog asked for by a window event naming this doc (A7's
    // import, until it asks on the bus): this page claims it.
    React.useEffect(() => {
        const claim = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; docId?: string }>).detail;
            if (!detail?.id || detail.docId !== docId || !dialogFor(detail.id, gate)) return;
            e.preventDefault();
            setDialogId(detail.id);
        };
        window.addEventListener('doc-open-dialog', claim);
        return () => window.removeEventListener('doc-open-dialog', claim);
    }, [docId, gate]);

    if(!docId) {
        return null;
    }

    if (isDocLoading || userProfile.isLoading) {
        return <DocPageSkeleton />;
    }

    if (!docInfo && docLoadError && docLoadFailure(docLoadError) === "unreachable") {
        // No answer, or the server failed: the doc may be fine, so the page
        // says what's wrong and offers it again (it's also asked for again
        // when the browser is back online).
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        return (
            <EmptyState
                illustration={<SpotError />}
                title={offline ? "You're offline" : "Can't reach the server"}
                description={offline
                    ? "This doc opens when you're back online. Nothing in it has been lost."
                    : "Nothing in this doc has been lost. Try again in a moment."}
                headingLevel={2}
                className="py-20"
                action={
                    <Button variant="outline" size="sm" onClick={() => void refreshDocInfo()} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                    </Button>
                }
            />
        );
    }

    if (!docInfo && docLoadError && docLoadFailure(docLoadError) === "deleted") {
        // In the trash, and it was there for this person (410): say so, with
        // Restore for whoever may. Anyone else is told nothing (404, below).
        return (
            <React.Suspense fallback={<DocPageSkeleton />}>
                <TrashedBanner docId={docId} canRestore={canRestoreDeleted(docLoadError)} onRestored={() => void refreshDocInfo()} />
            </React.Suspense>
        );
    }

    if (!docInfo && hosted) {
        // A table row's page opened as a doc (docs D-18): it lives with its
        // row, so the page goes there, and says so while it does.
        return (
            <EmptyState
                title={hosted.msg}
                headingLevel={2}
                className="py-20"
                action={
                    <Button variant="outline" size="sm" onClick={() => router.replace(hosted.path)}>
                        Open the row
                    </Button>
                }
            />
        );
    }

    if (!docInfo && (docLoadError as { response?: { status?: number } } | undefined)?.response?.status === 403) {
        // There, but not shared with this person (A5): Request access (B6),
        // only when the server says a request would reach someone who can
        // answer it (can_request; docs incident, 14 Oct 2026, QA DSA-03).
        const answer = (docLoadError as { response?: { data?: { can_request?: unknown } } }).response?.data;
        return (
            <React.Suspense fallback={<DocPageSkeleton />}>
                <NoAccessPage docId={docId} canRequest={answer?.can_request === true} admin={!!userProfile.data?.data?.user_is_admin} onGranted={() => void refreshDocInfo()} />
            </React.Suspense>
        );
    }

    if (!docInfo) {
        // Not there, or no longer (PTC-FIX's shared state, as projects and tasks say it).
        return <LoadFailureState kind="gone" noun="doc" back={{ label: "Back to docs", href: "/app/doc" }} className="py-12" />;
    }



    return (
        <DocBusContext.Provider value={bus}>
        <div ref={rootRef} data-doc-view="" className={cn('flex flex-col h-full bg-sheet', focusMode && 'doc-focus', ...rootClassesFor(gate, docId))}>
            {/* The header (D05): hidden in focus mode and on phones, where
                the app bar names the doc. */}
            {!focusMode && isDesktop && (
                <DocHeader
                    doc={docInfo}
                    canEdit={hasEditAccess}
                    canShare={canShare}
                    scrolled={scrolled}
                    save={saveSource}
                    users={awarenessUsers}
                    commentCount={docCommentCount || 0}
                    onComments={handleCommentClick}
                    onShare={() => dispatch(openUI({ key: 'docShare', data: docInfo.doc_uuid }))}
                    actions={actionContext}
                    gate={gate}
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
                {!focusMode && <ConnectionPill problem={connectionProblem} onRetry={retryCollab} />}
                {recovered && <RecoveredEditsBanner recovered={recovered} onDismiss={dismissRecovered} className="shrink-0" />}
                {editorReady ? (
                    <MinimalTiptapDocInput
                        throttleDelay={3000}
                        className='w-full h-full'
                        editorContentClassName="pb-8"
                        output="html"
                        // A live doc is saved through its socket, so the editor
                        // never turns it into HTML here (a reader's never changes).
                        value={docInfo.doc_body}
                        // What the server decided (the session): read-only for a
                        // reader, a lock, or a tab older than the server's schema
                        // (the pill asks to reload).
                        editable={session.access.canEdit}
                        editorClassName="focus:outline-none"
                        collaboration={editorCollaborationProp}
                        provider={provider || undefined}
                        providerSynced={collabSynced}
                        docId={docId}
                        titleStore={titleStore}
                        onTitleChange={handleTitleChange}
                        onTitleBlur={handleTitleBlur}
                        editableTitle={hasEditAccess}
                        lastEditedRelative={lastEditedRelative}
                        focusMode={focusMode}
                        fullWidth={fullWidth}
                        authorName={displayNameOf(docInfo.doc_created_by) || undefined}
                        onEditor={handleEditor}
                        onComment={handleCommentClick}
                        abilities={abilities}
                        belowTitle={abilities.share ? (
                            // Requests for access, for whoever can answer them (QA DSA-03).
                            <DocAccessRequests docId={docId} className="mt-1 mb-2" />
                        ) : !abilities.edit && abilities.view ? (
                            // A doc this person can't change says so, under its
                            // title (docs incident, 14 Oct 2026, D3).
                            <DocAccessNote
                                docId={docId}
                                level={abilities.level}
                                want="edit"
                                admin={!!userProfile.data?.data?.user_is_admin}
                                className="mt-1 mb-2"
                                action={abilities.askRead ? (
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => bus.emit('aiRun', {})}>Ask AI</Button>
                                ) : null}
                            />
                        ) : null}
                    />
                ) : (
                    <DocBodySkeleton />
                )}
            </div>

            <DocShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} gate={gate} />
            {dialogId && <DialogOutlet id={dialogId} docId={docId} gate={gate} onClose={() => setDialogId(null)} />}
            {/* Once per open doc, in every mode: what has no UI of its own
                (A6's live meta events, so a rename, delete or access change
                made elsewhere reaches this tab). */}
            <SlotOutlet slot="session" gate={gate} docId={docId} />
        </div>
        </DocBusContext.Provider>
    );
}
