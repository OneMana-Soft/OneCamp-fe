import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq} from "@/types/attachment";
import {FilePreview} from "@/store/slice/channelSlice";

interface createOrUpdateCommentBody {
    body: string
}

interface AddPreviewFiles {
    filesUploaded: FilePreview
}

interface RemoveUploadedFile {
    key: string,
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
}

interface UpdatePreviewFilesUUID {
    key: string,
    uuid: string
}


interface FwdMsgInputState {
    fwdMsgBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[],
    mobileViewSendClicked: boolean
}


const initialState: {fwdMsgInputInputState: FwdMsgInputState} = {
    fwdMsgInputInputState: {
        fwdMsgBody: '',
        filesUploaded: [],
        filesPreview: [],
        mobileViewSendClicked: false
    }
}

const fwdMsgSlice = createSlice({
    name: 'fwdMsg',
    initialState,
    reducers: {

        createOrUpdateFwdMsg: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { body } = action.payload;

            if (!state.fwdMsgInputInputState) {
                state.fwdMsgInputInputState = { fwdMsgBody: '', filesUploaded: [] , filesPreview: [], mobileViewSendClicked: false};
            }


            state.fwdMsgInputInputState.fwdMsgBody = body;
        },


        addFwdMsgPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { filesUploaded } = action.payload;
            state.fwdMsgInputInputState.filesPreview.push(filesUploaded);
        },

        deleteFwdMsgPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key } = action.payload;

            state.fwdMsgInputInputState.filesPreview = state.fwdMsgInputInputState.filesPreview.filter((media) => {
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

        updateFwdMsgPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress } = action.payload;

            state.fwdMsgInputInputState.filesPreview = state.fwdMsgInputInputState.filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateFwdMsgPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const {  key, uuid } = action.payload;

            state.fwdMsgInputInputState.filesPreview = state.fwdMsgInputInputState.filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },


        addFwdMsgUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded } = action.payload;

            state.fwdMsgInputInputState.filesUploaded.push(filesUploaded);
        },

        removeFwdMsgUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key } = action.payload;

            state.fwdMsgInputInputState.filesUploaded = state.fwdMsgInputInputState.filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearFwdMsgInputState: (state) => {

            state.fwdMsgInputInputState = { fwdMsgBody: '', filesUploaded: [] , filesPreview: [], mobileViewSendClicked: false};

        },

        clickedMobileFwdMsgSend: (state) => {
            state.fwdMsgInputInputState.mobileViewSendClicked = true;
        },
    }
})


export const {
    createOrUpdateFwdMsg,
    addFwdMsgPreviewFiles,
    deleteFwdMsgPreviewFiles,
    updateFwdMsgPreviewFiles,
    addFwdMsgUploadedFiles,
    removeFwdMsgUploadedFiles,
    clearFwdMsgInputState,
    updateFwdMsgPreviewFilesUUID,
    clickedMobileFwdMsgSend,
} = fwdMsgSlice.actions

export default fwdMsgSlice;