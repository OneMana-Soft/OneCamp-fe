import {useEffect} from "react";
import dynamic from "next/dynamic";
import {useDispatch, useSelector} from "react-redux";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { useEscapeClosesPanel } from "@/hooks/useEscapeClosesPanel";
import {RootState} from "@/store/store";

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
};
const ChannelComments = dynamic(() => loaders.channel().then((m) => m.ChannelComments));
const ChatComments = dynamic(() => loaders.chat().then((m) => m.ChatComments));
const GroupChatComments = dynamic(() => loaders.group().then((m) => m.GroupChatComments));
const TaskInfoPanel = dynamic(loaders.task);
const DocCommentList = dynamic(() => loaders.doc().then((m) => m.DocCommentList));
const EventInfoPanel = dynamic(loaders.event);

/** Fetches every panel's code once the app has nothing better to do. */
function usePreloadPanels() {
    useEffect(() => {
        const preload = () => Object.values(loaders).forEach((load) => void load().catch(() => {}));
        if (typeof window.requestIdleCallback === "function") {
            const id = window.requestIdleCallback(preload, { timeout: 5000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(preload, 2000);
        return () => window.clearTimeout(id);
    }, []);
}

export const RightPanel = () => {

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
