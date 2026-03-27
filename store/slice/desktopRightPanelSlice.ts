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
    viewStartDate?: string;
    viewEndDate?: string;
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
        } as rightPanelProps 
    },
};

export const rightPanelSlice = createSlice({
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
