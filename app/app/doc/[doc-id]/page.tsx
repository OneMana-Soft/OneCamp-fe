"use client";

import {useMedia} from "@/context/MediaQueryContext";
import {DocTopBarBreadcrumb} from "@/components/doc/docTopBarBreadcrumb";
import DocOptionsDesktopTopBar from "@/components/doc/docOptionsDesktopTopBar";
import MinimalTiptapDocInput from "@/components/docEditor/docInput";
import {ActiveUsersBar} from "@/components/docEditor/ActiveUsersBar";
import {cn} from "@/lib/utils/helpers/cn";
import { useParams } from "next/navigation";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { getCookie, checkAuthCookieExists } from "@/lib/utils/helpers/getCookie";
import * as React from 'react';
import {generateColorFromUUID} from "@/lib/utils/generateColorFromUUID";
import {DocInfoResponse} from "@/types/doc";
import { MessageCircle, Loader2, Download, Keyboard, Maximize, Minimize } from "@/lib/icons";
import { WifiOff } from "lucide-react";
import {Button} from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {useDispatch, useSelector} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {updateDocCommentCount} from "@/store/slice/createDocCommentSlice";
import {useMqttTopic} from "@/hooks/useMqttTopic";
import { DocPageSkeleton } from "@/components/doc/DocPageSkeleton";
import { useDocMessageHandlers } from "@/hooks/useDocMessageHandlers";
import { usePost } from "@/hooks/usePost";
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider";
import { useDocAutoSave } from "@/hooks/useDocAutoSave";
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
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">{k}</kbd>
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
export default function Page() {
    const params = useParams();
    const docId = params?.['doc-id'] as string;
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

    const [token, setToken] = React.useState<string>(() => {
        if (typeof window !== 'undefined') {
            return getCookie("Authorization") || '';
        }
        return '';
    });
    const { isMobile, isDesktop } = useMedia();
    const { makeRequest: updateDoc } = usePost();

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

    // Collaboration configuration
    const collaborationConfig = React.useMemo(() => {
        if (!hasEditAccess || !docId || !token || !userProfile.data?.data) return undefined;
        const cleanedToken = token.startsWith('Bearer ') ? token.slice(7) : token;
        return {
            enabled: true,
            documentId: docId,
            token: cleanedToken,
            username: userProfile.data.data.user_full_name || userProfile.data.data.user_name || 'Anonymous',
            userId: userProfile.data.data.user_uuid,
            color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "default"),
            profileKey: userProfile.data.data.user_profile_object_key,
        };
    }, [docId, token, userProfile.data?.data, hasEditAccess]);

    // Collaboration provider
    const { provider, status: collabStatus, synced: collabSynced, activeUsers, awarenessUsers } = useCollaborationProvider(collaborationConfig);

    // HTTP fallback auto-save
    const { saveStatus, lastSavedAt, scheduleSave } = useDocAutoSave({
        docId,
        enabled: hasEditAccess,
        initialBody: docInfo?.doc_body || '',
        collaborationEnabled: collaborationConfig?.enabled,
        providerSynced: collabSynced,
        debounceMs: 4000,
    });

    // Focus mode
    const [focusMode, setFocusMode] = React.useState(false);

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
        updateDoc({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: {
                doc_uuid: docId,
                doc_title: newTitle.trim() || "Untitled",
            }
        });
    }, [docId, docInfo, updateDoc]);

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

    // Handle document body changes
    const handleBodyChange = React.useCallback((content: Content) => {
        if (typeof content === 'string') {
            scheduleSave(content)
        }
    }, [scheduleSave]);

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

    if (isDocLoading || userProfile.isLoading || (!token && checkAuthCookieExists())) {
        return <DocPageSkeleton />;
    }

    if (!docInfo) {
         return <div className="flex items-center justify-center h-full">Document not found or access denied.</div>;
    }

    const editorCollaborationProp = collaborationConfig
        ? { ...collaborationConfig, activeUsers }
        : undefined;

    return (
        <div className={cn('flex flex-col h-full transition-all duration-300', focusMode && 'bg-background')}>
            {/* Desktop top bar — hidden in focus mode */}
            {!focusMode && isDesktop && (
                <div className='h-14 items-center flex justify-between p-2 pl-4 pr-4 border-b shrink-0 bg-background/80 backdrop-blur-sm z-10'>
                    <DocTopBarBreadcrumb doc={displayDocInfo!} canEdit={hasEditAccess} />
                    <div className='flex items-center gap-2'>
                        {/* Active users avatars */}
                        <ActiveUsersBar users={awarenessUsers} maxShown={4} />

                        {/* Export */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleExportMarkdown}
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            title="Export as Markdown"
                        >
                            <Download className='h-4 w-4'/>
                        </Button>

                        {/* Shortcuts help */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowShortcuts(true)}
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            title="Keyboard shortcuts (? )"
                        >
                            <Keyboard className='h-4 w-4'/>
                        </Button>

                        {/* Focus mode */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFocusMode(!focusMode)}
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            title={focusMode ? 'Exit focus mode' : 'Focus mode'}
                        >
                            {focusMode ? <Minimize className='h-4 w-4'/> : <Maximize className='h-4 w-4'/>}
                        </Button>

                        <Button variant='ghost' size="sm" onClick={handleCommentClick} className="gap-1.5">
                            <MessageCircle className='h-4 w-4'/>
                            <span className="text-sm">{docCommentCount || 0}</span>
                        </Button>
                        <DocOptionsDesktopTopBar/>
                    </div>
                </div>
            )}

            {/* Mobile header */}
            {!focusMode && isMobile && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background/80 backdrop-blur-sm">
                    <DocTopBarBreadcrumb doc={displayDocInfo!} canEdit={hasEditAccess} />
                    <div className="flex items-center gap-1">
                        <ActiveUsersBar users={awarenessUsers} maxShown={3} />
                        <Button variant='ghost' size="sm" onClick={handleCommentClick} className="gap-1 px-2">
                            <MessageCircle className='h-4 w-4'/>
                            <span className="text-sm">{docCommentCount || 0}</span>
                        </Button>
                        <DocOptionsDesktopTopBar/>
                    </div>
                </div>
            )}

            {/* Connection status banner */}
            {!focusMode && collaborationConfig?.enabled && (collabStatus === 'disconnected' || collabStatus === 'offline') && (
                <div className={cn(
                    "shrink-0 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2",
                    collabStatus === 'offline'
                        ? "bg-amber-500/10 text-amber-600 border-b border-amber-500/20"
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
                            <span>Reconnecting to collaboration server...</span>
                        </>
                    )}
                </div>
            )}

            {/* Focus mode exit hint */}
            {focusMode && (
                <div className="fixed top-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setFocusMode(false)}
                        className="shadow-lg"
                    >
                        <Minimize className="h-4 w-4 mr-1.5" />
                        Exit focus mode
                    </Button>
                </div>
            )}

            {/* Document content area */}
            <div className="flex-1 w-full flex flex-col overflow-hidden relative">
                <MinimalTiptapDocInput
                    throttleDelay={3000}
                    className='w-full h-full'
                    editorContentClassName="pb-8"
                    output="html"
                    onChange={handleBodyChange}
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
            </div>

            <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </div>
    );
}
