import {CancelTokenSource} from "axios";
import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq, AttachmentType} from "@/types/attachment";

interface FilePreview {
    key: string,
    fileName: string,
    progress: number,
    cancelSource: CancelTokenSource
    attachmentType: AttachmentType
    uuid?: string,
}


interface ProjectAttachmentInputState {
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

interface ExtendedProjectAttachmentInputState {
    [key: string]:  ProjectAttachmentInputState;
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    projectUUID: string
}

interface RemoveUploadedFile {
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
    uuid?: string
}
interface UpdatePreviewFilesUID {
    key: string,
    projectUUID: string
    uuid?: string
}

interface ClearTaskComment {
    projectUUID: string
}

const initialState = {
    projectAttachmentInputState: {} as ExtendedProjectAttachmentInputState
}

export const projectAttachmentSlice = createSlice({
    name: 'projectAttachment',
    initialState,
    reducers: {


        addProjectAttachmentPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, projectUUID} = action.payload;

            if(!state.projectAttachmentInputState[projectUUID]) {
                state.projectAttachmentInputState[projectUUID] = {  filesUploaded: [] , filesPreview: [] };
            }

            state.projectAttachmentInputState[projectUUID].filesPreview.push(fileUploaded);
        },

        deleteProjectAttachmentPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, projectUUID } = action.payload;

            if(!state.projectAttachmentInputState[projectUUID]) {
                state.projectAttachmentInputState[projectUUID] = { filesUploaded: [] , filesPreview: [] };
            }

            state.projectAttachmentInputState[projectUUID].filesPreview = state.projectAttachmentInputState[projectUUID].filesPreview.filter((media) => {
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

        updateProjectAttachmentPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUID}) => {
            const {  key, uuid, projectUUID } = action.payload;

            state.projectAttachmentInputState[projectUUID].filesPreview = state.projectAttachmentInputState[projectUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },

        updateProjectAttachmentPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, projectUUID } = action.payload;
            if(!state.projectAttachmentInputState[projectUUID]) {
                state.projectAttachmentInputState[projectUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.projectAttachmentInputState[projectUUID].filesPreview = state.projectAttachmentInputState[projectUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },


        addProjectAttachmentUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, projectUUID } = action.payload;
            if(!state.projectAttachmentInputState[projectUUID]) {
                state.projectAttachmentInputState[projectUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.projectAttachmentInputState[projectUUID].filesUploaded.push(filesUploaded);
        },

        removeProjectAttachmentUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, projectUUID } = action.payload;
            if(!state.projectAttachmentInputState[projectUUID]) {
                state.projectAttachmentInputState[projectUUID] = { filesUploaded: [] , filesPreview: [] };
            }
            state.projectAttachmentInputState[projectUUID].filesUploaded = state.projectAttachmentInputState[projectUUID].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearProjectAttachmentInputState: (state, action :{payload: ClearTaskComment}) => {
            const {projectUUID } = action.payload;

            state.projectAttachmentInputState[projectUUID] = { filesUploaded: [] , filesPreview: [] };


        },

    }
});

export const {
    addProjectAttachmentPreviewFiles,
    deleteProjectAttachmentPreviewFiles,
    updateProjectAttachmentPreviewFiles,
    addProjectAttachmentUploadedFiles,
    removeProjectAttachmentUploadedFiles,
    clearProjectAttachmentInputState,
    updateProjectAttachmentPreviewFilesUUID

} =projectAttachmentSlice.actions