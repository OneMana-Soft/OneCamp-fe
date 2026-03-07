import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AttachmentMediaReq } from "@/types/attachment";
import { UserEmojiStatus } from "@/types/user";

// --- Types for UI Components ---

export type UIType = 'dialog' | 'drawer' | 'sheet' | 'popover';

// Re-using types from fragmented slices
export interface RecordingPlayerInterface {
  egressId: string;
  mediaGetUrl: string;
  transcriptGetUrl: string;
  fileSize: number;
  fileName: string;
  recordedAt: string;
}

export interface SingleUIState<T = any> {
  isOpen: boolean;
  data: T;
}

export interface DocShareUIState {
  isOpen: boolean;
  docId: string;
}

export interface RootUIState {
  // Dialogs
  createChannel: SingleUIState;
  createProject: SingleUIState;
  createTeam: SingleUIState;
  createTask: SingleUIState;
  createDoc: SingleUIState;
  editChannel: SingleUIState;
  editChannelMember: SingleUIState;
  editTeamMember: SingleUIState;
  editDmMember: SingleUIState;
  editProjectMember: SingleUIState;
  editTeamName: SingleUIState;
  editProjectName: SingleUIState;
  docShare: DocShareUIState;
  docUpdateTitle: SingleUIState;
  createChatMessage: SingleUIState;
  forwardMessage: SingleUIState;
  attachmentLightbox: SingleUIState;
  confirmAlert: SingleUIState;
  recordingPlayer: SingleUIState;
  userStatusUpdate: SingleUIState;
  otherUserProfile: SingleUIState;
  selfUserProfile: SingleUIState;
  teamMembers: SingleUIState;
  addInvitation: SingleUIState;
  
  // Drawers/Sheets
  orgProfileDrawer: SingleUIState;
  userProfileDrawer: SingleUIState;
  channelOptionsDrawer: SingleUIState;
  chatOptionsDrawer: SingleUIState;
  groupChatOptionsDrawer: SingleUIState;
  channelInfoSheet: SingleUIState;
  docOptionsDrawer: SingleUIState;
  docFilterOptionsDrawer: SingleUIState;
  reactionPickerDrawer: SingleUIState;
  taskFilterDrawer: SingleUIState;
  projectTaskFilterDrawer: SingleUIState;
  taskOptionsDrawer: SingleUIState;
  myTaskOptionsDrawer: SingleUIState;
  taskOptionDrawer: SingleUIState;
  teamOptionDrawer: SingleUIState;
  projectOptionsDrawer: SingleUIState;

  // Long press drawers (Mobile)
  channelMessageLongPress: SingleUIState;
  chatMessageLongPress: SingleUIState;
  groupChatMessageLongPress: SingleUIState;
  postMessageLongPress: SingleUIState;
  dmChatMessageLongPress: SingleUIState;
  dmGroupChatMessageLongPress: SingleUIState;
  postCommentLongPress: SingleUIState;
  dmChatCommentLongPress: SingleUIState;
  docCommentLongPress: SingleUIState;
  projectLongPress: SingleUIState;

  // File Uploads
  channelFileUpload: SingleUIState;
  channelCommentFileUpload: SingleUIState;
  taskCommentFileUpload: SingleUIState;
  docCommentFileUpload: SingleUIState;
  chatCommentFileUpload: SingleUIState;
  groupChatCommentFileUpload: SingleUIState;
  chatFileUpload: SingleUIState;
  fwdMsgFileUpload: SingleUIState;
  groupChatFileUpload: SingleUIState;

  // Popovers
}

const initialState: RootUIState = {
  // Dialogs
  createChannel: { isOpen: false, data: null },
  createProject: { isOpen: false, data: null },
  createTeam: { isOpen: false, data: null },
  createTask: { isOpen: false, data: null },
  createDoc: { isOpen: false, data: null },
  editChannel: { isOpen: false, data: { channelUUID: "" } },
  editChannelMember: { isOpen: false, data: { channelUUID: "" } },
  editTeamMember: { isOpen: false, data: { teamUUID: "" } },
  editDmMember: { isOpen: false, data: { grpId: "" } },
  editProjectMember: { isOpen: false, data: { projectUUID: "" } },
  editTeamName: { isOpen: false, data: { teamUUID: "" } },
  editProjectName: { isOpen: false, data: { projectUUID: "" } },
  docShare: { isOpen: false, docId: "" },
  docUpdateTitle: { isOpen: false, data: { title: "", docId: "" } },
  createChatMessage: { isOpen: false, data: null },
  forwardMessage: { isOpen: false, data: { chatUUID: "", channelUUID: "", postUUID: "" } },
  attachmentLightbox: { isOpen: false, data: { allMedia: [] as AttachmentMediaReq[], mediaGetUrl: "", media: {} as AttachmentMediaReq } },
  confirmAlert: { isOpen: false, data: { title: "", description: "", confirmText: "Confirm", onConfirm: () => {} } },
  recordingPlayer: { isOpen: false, data: null as RecordingPlayerInterface | null },
  userStatusUpdate: { isOpen: false, data: { userUUID: "" } },
  otherUserProfile: { isOpen: false, data: { userUUID: "" } },
  selfUserProfile: { isOpen: false, data: null },
  teamMembers: { isOpen: false, data: { teamUUID: "", teamName: "" } },
  addInvitation: { isOpen: false, data: null },
  
  // Drawers/Sheets
  orgProfileDrawer: { isOpen: false, data: null },
  userProfileDrawer: { isOpen: false, data: null },
  channelOptionsDrawer: { isOpen: false, data: { channelUUID: "" } },
  chatOptionsDrawer: { isOpen: false, data: { chatUUID: "" } },
  groupChatOptionsDrawer: { isOpen: false, data: { grpId: "" } },
  channelInfoSheet: { isOpen: false, data: { channelUUID: "" } },
  docOptionsDrawer: { isOpen: false, data: { docId: "", isOwner: false, deleteDoc: () => {} } },
  docFilterOptionsDrawer: { isOpen: false, data: null },
  teamOptionDrawer: { isOpen: false, data: {teamId: "", teamName: ""} },
  reactionPickerDrawer: { isOpen: false, data: null },
  taskFilterDrawer: { isOpen: false, data: null },
  projectTaskFilterDrawer: { isOpen: false, data: { projectUUID: "" } },
  taskOptionsDrawer: { isOpen: false, data: null },
  myTaskOptionsDrawer: { isOpen: false, data: null },
  taskOptionDrawer: { isOpen: false, data: { taskId: "" } },
  projectOptionsDrawer: { isOpen: false, data: { projectUUID: "" } },

  // Long press drawers
  channelMessageLongPress: { isOpen: false, data: null },
  chatMessageLongPress: { isOpen: false, data: null },
  groupChatMessageLongPress: { isOpen: false, data: null },
  postMessageLongPress: { isOpen: false, data: null },
  dmChatMessageLongPress: { isOpen: false, data: null },
  dmGroupChatMessageLongPress: { isOpen: false, data: null },
  postCommentLongPress: { isOpen: false, data: null },
  dmChatCommentLongPress: { isOpen: false, data: null },
  docCommentLongPress: { isOpen: false, data: null },
  projectLongPress: { isOpen: false, data: {isAdmin: false, projectId: '', teamId: '', isMember: '', isDeleted: false} } ,

  // File Uploads
  channelFileUpload: { isOpen: false, data: null },
  channelCommentFileUpload: { isOpen: false, data: null },
  taskCommentFileUpload: { isOpen: false, data: null },
  docCommentFileUpload: { isOpen: false, data: null },
  chatCommentFileUpload: { isOpen: false, data: null },
  groupChatCommentFileUpload: { isOpen: false, data: null },
  chatFileUpload: { isOpen: false, data: null },
  fwdMsgFileUpload: { isOpen: false, data: null },
  groupChatFileUpload: { isOpen: false, data: null },

  // Popovers
};

export type GlobalUIType = keyof RootUIState;

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    openUI: (state, action: PayloadAction<{ key: GlobalUIType; data?: any }>) => {
      const { key, data } = action.payload;
      const target = state[key] as any;
      if (target) {
        target.isOpen = true;
        if (data !== undefined) {
           if (key === 'docShare') {
              target.docId = data;
           } else {
              target.data = data;
           }
        }
      }
    },
    closeUI: (state, action: PayloadAction<GlobalUIType>) => {
      const key = action.payload;
      const target = state[key] as any;
      if (target) {
        target.isOpen = false;
        const initialTarget = (initialState as any)[key];
        if (key === 'docShare') {
           target.docId = initialTarget.docId;
        } else {
           target.data = initialTarget.data;
        }
      }
    },
    toggleUI: (state, action: PayloadAction<GlobalUIType>) => {
      const key = action.payload;
      if (state[key]) {
        state[key].isOpen = !state[key].isOpen;
      }
    },
    // Batch close for navigation or global resets
    closeAllUI: (state) => {
      Object.keys(state).forEach((key) => {
        (state as any)[key].isOpen = false;
      });
    },
  },
});

export const { openUI, closeUI, toggleUI, closeAllUI } = uiSlice.actions;

export default uiSlice;
