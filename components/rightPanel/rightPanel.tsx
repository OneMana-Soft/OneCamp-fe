import {useEffect} from "react";
import dynamic from "next/dynamic";
import {useDispatch, useSelector} from "react-redux";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { useEscapeClosesPanel } from "@/hooks/useEscapeClosesPanel";
import {RootState} from "@/store/store";
import { PanelOutlet } from "@/components/docEditor/registry/slots";
import { useEditionGate } from "@/components/docEditor/registry/gate";

// What the panel shows loads the first time it's opened, not with every
// page: a thread's reply box brings the whole editor (ProseMirror, code
// highlighting, Yjs), several hundred KB the first screen doesn't need. Once
// the app is idle they're fetched anyway (below), so opening one rarely waits.
const loaders = {
    channel: () => import("@/components/rightPanel/channelComments"),
    chat: () => import("@/components/rightPanel/chatComments"),
    group: () => import("@/components/rightPanel/groupChatComments"),
    task: () => import("@/components/rightPanel/taskInfoPanel"),
    doc: () => import("@/components/rightPanel/docCommentList"),
    event: () => import("@/components/rightPanel/eventInfoPanel"),
    ai: () => import("@/components/ai/AiChatPanel"),
    docAi: () => import("@/components/ai/DocAiAssistantPanel"),
};
const ChannelComments = dynamic(() => loaders.channel().then((m) => m.ChannelComments));
const ChatComments = dynamic(() => loaders.chat().then((m) => m.ChatComments));
const GroupChatComments = dynamic(() => loaders.group().then((m) => m.GroupChatComments));
const TaskInfoPanel = dynamic(loaders.task);
const DocCommentList = dynamic(() => loaders.doc().then((m) => m.DocCommentList));
const EventInfoPanel = dynamic(loaders.event);
const AiChatPanel = dynamic(loaders.ai);
const DocAiAssistantPanel = dynamic(() => loaders.docAi().then((m) => m.DocAiAssistantPanel));

/** How long the panels wait for a first touch or key before fetching anyway. */
const PRELOAD_AFTER_MS = 5000

/**
 * Fetches every panel's code once the app has nothing better to do: after the
 * first touch, click or key (the page has painted and is being used), or 5 s,
 * whichever comes first, and then at the next idle moment. It used to start
 * at the first idle moment, which on a doc's first load was still part of the
 * load (perf 2.4).
 */
function usePreloadPanels() {
    useEffect(() => {
        let idle = 0
        let started = false
        const preload = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
        const start = () => {
            if (started) return
            started = true
            stop()
            if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(preload, { timeout: 5000 })
            else idle = window.setTimeout(preload, 0)
        }
        const events = ["pointerdown", "keydown"] as const
        const stop = () => {
            window.clearTimeout(timer)
            events.forEach((e) => window.removeEventListener(e, start, true))
        }
        const timer = window.setTimeout(start, PRELOAD_AFTER_MS)
        events.forEach((e) => window.addEventListener(e, start, { capture: true, once: true }))
        return () => {
            stop()
            if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle)
            window.clearTimeout(idle)
        }
    }, []);
}

export const RightPanel = () => {
    const gate = useEditionGate();

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);
    usePreloadPanels();
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


        if (rightPanelState.data.chatUUID && rightPanelState.data.chatMessageUUID) {
            return <ChatComments/>
        }

        if(rightPanelState.data.groupUUID && rightPanelState.data.chatMessageUUID) {
            return <GroupChatComments/>
        }

        if (rightPanelState.data.channelUUID && rightPanelState.data.postUUID) {
            return <ChannelComments/>
        }

        if(rightPanelState.data.taskUUID) {
            return <TaskInfoPanel key={rightPanelState.data.taskUUID} taskUUID={rightPanelState.data.taskUUID} />
        }

        if(rightPanelState.data.docUUID) {
            return <DocCommentList docId={rightPanelState.data.docUUID}/>
        }

        if(rightPanelState.data.eventUUID) {
            return <EventInfoPanel key={rightPanelState.data.eventUUID} eventUUID={rightPanelState.data.eventUUID} />
        }
    }


    return (<>

        {renderRightPanel()}
    </>)
}