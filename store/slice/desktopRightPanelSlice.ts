import {createSlice} from "@reduxjs/toolkit";

interface rightPanelProps {
    chatUUID: string;
    channelUUID: string;
    postUUID: string;
    chatMessageUUID: string;
    taskUUID: string;
    groupUUID: string;
    docUUID: string;
    eventUUID: string;
    aiChatOpen: boolean;
    docAiOpen: boolean;
    // Optional surface hint set by the quick-invoke shortcut so the assistant
    // can open with context-aware starter prompts (e.g. "Summarize this doc").
    aiContextType?: string;
    docAiData?: {
        selectedText: string;
        docId: string;
        surroundingContext?: string;
        initialAction?: string;
        /** What was typed with it ("Ask AI to write …"). */
        initialPrompt?: string;
        /** The person's level on the doc: the panel offers what it allows. */
        level?: string;
    };
    viewStartDate?: string;
    viewEndDate?: string;
    /**
     * A panel a package registered for a doc (components/docEditor/registry:
     * registerPanel), shown by its kind: the doc's own, not one more flag.
     */
    docPanel?: { kind: string; docId: string };
}
const initialState = {
    rightPanelState: { 
        isOpen: false,  
        data: {
            chatUUID: "",
            channelUUID: "",
            postUUID: "",
            chatMessageUUID: "",
            taskUUID: "",
            groupUUID: "",
            docUUID: "",
            eventUUID: "",
            aiChatOpen: false,
            docAiOpen: false,
        } as rightPanelProps 
    },
};

const rightPanelSlice = createSlice({
    name: "rightPanel",
    initialState,
    reducers: {
        openRightPanel:  (
            state,
            action: { payload: Partial<rightPanelProps> }
        ) => {
            state.rightPanelState = {
                isOpen: true,
                data: {
                    ...initialState.rightPanelState.data,
                    ...action.payload,
                },
            };
        },

        closeRightPanel: (state) => {
            state.rightPanelState.isOpen = false
        },

    }
});

export const {
    openRightPanel,
    closeRightPanel
} = rightPanelSlice.actions

export default rightPanelSlice;
