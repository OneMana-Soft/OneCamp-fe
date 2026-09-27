import {CancelTokenSource} from "axios";
import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq, AttachmentType} from "@/types/attachment";

interface ExtendedFileUploaded {
    [key: string]:  AttachmentMediaReq[];
}

interface FilePreview {
    key: string,
    fileName: string,
    progress: number,
    cancelSource: CancelTokenSource
    attachmentType: AttachmentType
    uuid?: string,
}

interface ExtendedFilePreview {
    [key: string]:  FilePreview[];
}
interface AddPreviewFiles {
    fileUploaded: FilePreview
    projectUUID: string
}

interface AddTaskDescription {
    taskDescription: string
}

interface RemoveUploadedFiles {
    key: string,
    projectUUID: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    projectUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    projectUUID: string
}

interface AddTaskName {
    taskName: string
}

interface AddProjectUUID {
    projectUUID: string
}

interface AddUserUUID {
   userUUID: string
}
interface UpdatePreviewFilesUID {
    key: string,
    projectUUID: string
    uuid?: string
}

const initialState = {
    dialogInputState: { taskDescription: '', taskName:'', projectUUID:'', assigneeUUID:'', filesUploaded: {} as ExtendedFileUploaded, filePreview: {} as ExtendedFilePreview}
}

export const createTaskDialogSlice = createSlice({
    name: 'createTaskDialog',
    initialState,
    reducers: {

        updateCreateTaskDialogNameInputText: (state, action: {payload: AddTaskName}) => {
            const { taskName } = action.payload;

            state.dialogInputState.taskName = taskName;
        },

        updateCreateTaskDialogProjectUUIDInputText: (state, action: {payload: AddProjectUUID}) => {
            const {projectUUID } = action.payload;

            state.dialogInputState.projectUUID = projectUUID;
            if(!state.dialogInputState.filePreview[projectUUID]) {
                state.dialogInputState.filePreview[projectUUID] = [] as FilePreview[]
            }
            if (!state.dialogInputState.filesUploaded[projectUUID]) {
                state.dialogInputState.filesUploaded[projectUUID] = [] as AttachmentMediaReq[]
            }
            state.dialogInputState.assigneeUUID = '';

        },

        updateCreateTaskDialogUserUUIDInputText: (state, action: {payload: AddUserUUID}) => {
            const {userUUID } = action.payload;

            state.dialogInputState.assigneeUUID = userUUID;
        },

        updateCreateTaskDialogDescriptionInputText: (state, action: {payload: AddTaskDescription}) => {
            const { taskDescription } = action.payload;

            state.dialogInputState.taskDescription = taskDescription;
        },

        addCreateTaskDialogPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, projectUUID} = action.payload;

            if(!state.dialogInputState.filePreview[projectUUID]) {
                state.dialogInputState.filePreview[projectUUID] = [] as FilePreview[]
            }

            state.dialogInputState.filePreview[projectUUID].push(fileUploaded);
        },

        deleteCreateTaskDialogPreviewFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { key, projectUUID } = action.payload;

            if(!state.dialogInputState.filePreview[projectUUID]) {
                state.dialogInputState.filePreview[projectUUID] = [] as FilePreview[]
            }

            state.dialogInputState.filePreview[projectUUID] = state.dialogInputState.filePreview[projectUUID].filter((media) => {
                if (media.key === key) {
                    if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                        media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                    }
                    return false;
                } else {
                    return true;
                }
            });

        },

        updateCreateTaskDialogPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, projectUUID } = action.payload;
            if(!state.dialogInputState.filePreview[projectUUID]) {
                state.dialogInputState.filePreview[projectUUID] = [] as FilePreview[]
            }
            state.dialogInputState.filePreview[projectUUID] = state.dialogInputState.filePreview[projectUUID].map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },


        addCreateTaskDialogUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, projectUUID } = action.payload;
            if (!state.dialogInputState.filesUploaded[projectUUID]) {
                state.dialogInputState.filesUploaded[projectUUID] = [] as AttachmentMediaReq[]
            }
            state.dialogInputState.filesUploaded[projectUUID].push(filesUploaded);
        },

        removeCreateTaskUploadedFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { key, projectUUID } = action.payload;
            if (!state.dialogInputState.filesUploaded[projectUUID]) {
                state.dialogInputState.filesUploaded[projectUUID] = [] as AttachmentMediaReq[]
            }
            state.dialogInputState.filesUploaded[projectUUID] = state.dialogInputState.filesUploaded[projectUUID].filter((media) => media.attachment_obj_key !== key);
        },

        clearCreateTaskInputState: (state) => {

            state.dialogInputState = { assigneeUUID:'', projectUUID:'', taskName:'', taskDescription: '', filesUploaded: {} as ExtendedFileUploaded, filePreview: {} as ExtendedFilePreview };
        },

        updateCreateTaskDialogPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUID}) => {
            const {  key, uuid, projectUUID } = action.payload;

            state.dialogInputState.filePreview[projectUUID] = state.dialogInputState.filePreview[projectUUID].map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },

    }
});

export const {
    updateCreateTaskDialogNameInputText,
    updateCreateTaskDialogDescriptionInputText,
    addCreateTaskDialogPreviewFiles,
    deleteCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFilesUUID,
    addCreateTaskDialogUploadedFiles,
    removeCreateTaskUploadedFiles,
    updateCreateTaskDialogProjectUUIDInputText,
    updateCreateTaskDialogUserUUIDInputText,
    clearCreateTaskInputState

} =createTaskDialogSlice.actions