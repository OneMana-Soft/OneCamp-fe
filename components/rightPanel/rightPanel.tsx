import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {ChannelComments} from "@/components/rightPanel/channelComments";
import {ChatComments} from "@/components/rightPanel/chatComments";
import TaskInfoPanel from "@/components/rightPanel/taskInfoPanel";
import {GroupChatComments} from "@/components/rightPanel/groupChatComments";
import {DocCommentList} from "@/components/rightPanel/docCommentList";
import EventInfoPanel from "@/components/rightPanel/eventInfoPanel";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { DocAiAssistantPanel } from "@/components/ai/DocAiAssistantPanel";

export const RightPanel = () => {

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);


    const renderRightPanel = () => {

        if (rightPanelState.data.aiChatOpen) {
            return <AiChatPanel />
        }

        if (rightPanelState.data.docAiOpen) {
            return (
                <DocAiAssistantPanel 
                    selectedText={rightPanelState.data.docAiData?.selectedText || ""} 
                    docId={rightPanelState.data.docAiData?.docId || ""}
                    surroundingContext={rightPanelState.data.docAiData?.surroundingContext}
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