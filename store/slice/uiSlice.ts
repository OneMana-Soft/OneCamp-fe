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
  createCalendarEvent: SingleUIState;
  boardVersionHistory: SingleUIState<{ boardId: string }>;
  boardShare: SingleUIState<{ boardId: string }>;
  boardViewers: SingleUIState<{ boardId: string }>;
  docVersionHistory: SingleUIState<{ docId: string }>;
  docViewers: SingleUIState<{ docId: string }>;
  
  // Admin card dialogs
  webhookCreate: SingleUIState;
  webhookEdit: SingleUIState<{ id: string; name: string; description?: string; type: "incoming" | "outgoing"; target_url?: string; bot_name: string; events?: string; is_active: boolean }>;
  webhookDelete: SingleUIState<{ id: string; name: string; type: "incoming" | "outgoing" }>;
  githubDisconnect: SingleUIState;
  githubUnlink: SingleUIState<{ id: string; repo_owner: string; repo_name: string }>;
  archiveEditPolicy: SingleUIState<{ id: string; entity_type: string; retention_days: number; auto_archive: boolean; archive_completed_tasks: boolean; archive_inactive_channels_days: number; compress_attachments: boolean }>;
  archiveRunJob: SingleUIState<{ entityLabel: string; entityType: string }>;
  archiveRestore: SingleUIState;
  githubLinkTask: SingleUIState<{ taskId: string }>;
  githubBulkLinkTask: SingleUIState<{ taskIds: string[] }>;
  createBranch: SingleUIState<{ taskId: string; taskName: string }>;
  
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
  calendarOptionsDrawer: SingleUIState;

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
  forwardMessage: { isOpen: false, data: { chatUUID: "", chatMessageID: "", groupChatMsgID: "", channelUUID: "", postUUID: "" } },
  attachmentLightbox: { isOpen: false, data: { allMedia: [] as AttachmentMediaReq[], mediaGetUrl: "", media: {} as AttachmentMediaReq, analyzeContext: undefined as undefined | { srcKey: string; srcRef: string } } },
  confirmAlert: { isOpen: false, data: { title: "", description: "", confirmText: "Confirm", onConfirm: () => {} } },
  recordingPlayer: { isOpen: false, data: null as RecordingPlayerInterface | null },
  userStatusUpdate: { isOpen: false, data: { userUUID: "" } },
  otherUserProfile: { isOpen: false, data: { userUUID: "" } },
  selfUserProfile: { isOpen: false, data: null },
  teamMembers: { isOpen: false, data: { teamUUID: "", teamName: "" } },
  addInvitation: { isOpen: false, data: null },
  createCalendarEvent: { isOpen: false, data: null },
  boardVersionHistory: { isOpen: false, data: { boardId: "" } },
  boardShare: { isOpen: false, data: { boardId: "" } },
  boardViewers: { isOpen: false, data: { boardId: "" } },
  docVersionHistory: { isOpen: false, data: { docId: "" } },
  docViewers: { isOpen: false, data: { docId: "" } },

  // Admin card dialogs
  webhookCreate: { isOpen: false, data: null },
  webhookEdit: { isOpen: false, data: { id: "", name: "", description: "", type: "incoming" as const, target_url: "", bot_name: "Webhook Bot", events: "[]", is_active: true } },
  webhookDelete: { isOpen: false, data: { id: "", name: "", type: "incoming" as const } },
  githubDisconnect: { isOpen: false, data: null },
  githubUnlink: { isOpen: false, data: { id: "", repo_owner: "", repo_name: "" } },
  archiveEditPolicy: { isOpen: false, data: { id: "", entity_type: "", retention_days: 365, auto_archive: false, archive_completed_tasks: true, archive_inactive_channels_days: 90, compress_attachments: false } },
  archiveRunJob: { isOpen: false, data: { entityLabel: "", entityType: "" } },
  archiveRestore: { isOpen: false, data: null },
  githubLinkTask: { isOpen: false, data: { taskId: "" } },
  githubBulkLinkTask: { isOpen: false, data: { taskIds: [] as string[] } },
  createBranch: { isOpen: false, data: { taskId: "", taskName: "" } },
  
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
  calendarOptionsDrawer: { isOpen: false, data: null },

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
