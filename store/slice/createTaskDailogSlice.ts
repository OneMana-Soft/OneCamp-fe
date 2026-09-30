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

interface UpdatePreviewFilesUID {
    key: string,
    projectUUID: string
    uuid?: string
}

const initialState = {
    dialogInputState: { filesUploaded: {} as ExtendedFileUploaded, filePreview: {} as ExtendedFilePreview }
}

export const createTaskDialogSlice = createSlice({
    name: 'createTaskDialog',
    initialState,
    reducers: {

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

            state.dialogInputState = { filesUploaded: {} as ExtendedFileUploaded, filePreview: {} as ExtendedFilePreview };
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
    addCreateTaskDialogPreviewFiles,
    deleteCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFiles,
    updateCreateTaskDialogPreviewFilesUUID,
    addCreateTaskDialogUploadedFiles,
    removeCreateTaskUploadedFiles,
    clearCreateTaskInputState

} =createTaskDialogSlice.actions