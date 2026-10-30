import {useEffect} from "react";
import { useAppRouter } from "@/lib/navigation/appRouter";
import { lazyPanel } from "@/lib/lazy/lazyPanel";
import { TaskPanelSkeleton } from "@/components/task/taskPanelSkeleton";
import { app_inbox_path } from "@/types/paths";
import {useDispatch, useSelector} from "react-redux";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { useEscapeClosesPanel } from "@/hooks/useEscapeClosesPanel";
import {RootState} from "@/store/store";
import { PanelOutlet } from "@/components/docEditor/registry/slots";
import { useEditionGate } from "@/components/docEditor/registry/gate";
import { ThreadPanel, preloadThreadPanels } from "@/components/conversation/ThreadPanel";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { getGroupingId } from "@/lib/utils/getGroupingId";
import type { UserProfileInterface } from "@/types/user";

// Each panel's code is its own chunk, fetched ahead by PreloadPanels.
export const panelLoaders = {
    task: () => import("@/components/rightPanel/taskInfoPanel"),
    doc: () => import("@/components/rightPanel/docCommentList"),
    event: () => import("@/components/rightPanel/eventInfoPanel"),
    ai: () => import("@/components/ai/AiChatPanel"),
    docAi: () => import("@/components/ai/DocAiAssistantPanel"),
};
const loaders = panelLoaders;
const TaskInfoPanel = lazyPanel(() => loaders.task().then((m) => m.default), "the task", TaskPanelSkeleton);
const DocCommentList = lazyPanel(() => loaders.doc().then((m) => m.DocCommentList), "the comments");
const EventInfoPanel = lazyPanel(() => loaders.event().then((m) => m.default), "the event");
const AiChatPanel = lazyPanel(() => loaders.ai().then((m) => m.default), "the assistant");
const DocAiAssistantPanel = lazyPanel(() => loaders.docAi().then((m) => m.DocAiAssistantPanel), "the assistant");

export const PRELOAD_AFTER_MS = 5000
// Places whose code came only at the press (inbox 210 KB, Settings 161 KB),
// fetched in full: "auto" stops at the layout, without the page's own code.
// Settings opens on Your profile on a computer (app/app/settings/page): its
// route, not only the index that sends there (fluid-14). Written out, as
// lib/adminSections' PROFILE_HREF would bring that module (panelPreload.test).
export const PRELOAD_ROUTES = [app_inbox_path, "/app/settings", "/app/settings/profile"]
const FULL = { kind: "full" } as never

// Their code and the panels', after the first press or 5 s, once quiet; or only `jobs` (a task's panel with its
// parts, for TaskInPlace: asana-12 (a)).
export function usePreloadPanels(jobs?: (() => unknown)[]) {
    const router = useAppRouter()
    useEffect(() => {
        let live = true
        let started = false
        let cancel = () => {}
        const start = () => {
            if (started) return
            started = true
            stop()
            void import("@/lib/ui/whenQuiet").then(({ runWhenQuiet }) => {
                if (live) cancel = runWhenQuiet(jobs ?? [...PRELOAD_ROUTES.map((href) => () => router.prefetch(href, FULL)), ...Object.values(loaders), preloadThreadPanels])
            }, () => {})
        }
        const events = ["pointerdown", "keydown"] as const
        const stop = () => {
            window.clearTimeout(timer)
            events.forEach((e) => window.removeEventListener(e, start, true))
        }
        const timer = window.setTimeout(start, PRELOAD_AFTER_MS)
        events.forEach((e) => window.addEventListener(e, start, { capture: true, once: true }))
        return () => {
            live = false
            stop()
            cancel()
        }
    }, [router, jobs]);
}

// The shell's, open or not: RightPanel mounts only while open.
export function PreloadPanels() {
    usePreloadPanels();
    return null;
}

export const RightPanel = () => {
    const gate = useEditionGate();

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);
    // A DM's thread is in the conversation of the two of you.
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid;
    const dispatch = useDispatch();
    // Escape closes a thread, task, comments or event panel, once no popup,
    // menu or dialog is open over the page. The AI panels keep Escape for
    // their own input.
    const data = rightPanelState.data;
    const escapeCloses = rightPanelState.isOpen && !data.aiChatOpen && !data.docAiOpen;
    useEscapeClosesPanel(escapeCloses, () => dispatch(closeRightPanel()));


    const renderRightPanel = () => {

        if (rightPanelState.data.aiChatOpen) {
            return <AiChatPanel />
        }

        // A panel a package registered for a doc, by its kind.
        if (rightPanelState.data.docPanel) {
            const { kind, docId } = rightPanelState.data.docPanel
            return <PanelOutlet kind={kind} docId={docId} gate={gate} />
        }

        if (rightPanelState.data.docAiOpen) {
            return (
                <DocAiAssistantPanel 
                    selectedText={rightPanelState.data.docAiData?.selectedText || ""} 
                    docId={rightPanelState.data.docAiData?.docId || ""}
                    surroundingContext={rightPanelState.data.docAiData?.surroundingContext}
                    initialAction={rightPanelState.data.docAiData?.initialAction as any}
                    initialPrompt={rightPanelState.data.docAiData?.initialPrompt}
                    isSidebar={true}
                />
            )
        }


        // A conversation's thread (chat A1's ThreadPanel host).
        if (rightPanelState.data.chatUUID && rightPanelState.data.chatMessageUUID) {
            const other = rightPanelState.data.chatUUID
            return <ThreadPanel thread={{ in: { kind: "dm", id: self ? getGroupingId(self, other) : "", other }, root: rightPanelState.data.chatMessageUUID }}/>
        }

        if(rightPanelState.data.groupUUID && rightPanelState.data.chatMessageUUID) {
            return <ThreadPanel thread={{ in: { kind: "group", id: rightPanelState.data.groupUUID }, root: rightPanelState.data.chatMessageUUID }}/>
        }

        if (rightPanelState.data.channelUUID && rightPanelState.data.postUUID) {
            return <ThreadPanel thread={{ in: { kind: "channel", id: rightPanelState.data.channelUUID }, root: rightPanelState.data.postUUID }}/>
        }

        if(rightPanelState.data.taskUUID) {
            return <TaskInfoPanel key={rightPanelState.data.taskUUID} taskUUID={rightPanelState.data.taskUUID} />
        }

        if(rightPanelState.data.docUUID) {
            return <DocCommentList docId={rightPanelState.data.docUUID}/>
        }

        if(rightPanelState.data.eventUUID) {
            return <EventInfoPanel key={rightPanelState.data.eventUUID} eventUUID={rightPanelState.data.eventUUID} editRequest={rightPanelState.data.eventEditAt} />
        }
    }


    return (<>

        {renderRightPanel()}
    </>)
}