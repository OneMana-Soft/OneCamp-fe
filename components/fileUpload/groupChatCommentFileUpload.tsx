import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useEffect} from "react";
import {
    closeUI,
    openUI
} from "@/store/slice/uiSlice";
import * as React from "react";
import {useUploadFile} from "@/hooks/useUploadFile";
import UploadingAttachmentIcon from "@/components/attachmentIcon/uploadingAttachmentIcon";
import {GetEndpointUrl} from "@/services/endPoints";
import {AttachmentMediaReq} from "@/types/attachment";
import {deleteChatCommentPreviewFiles, removeChatCommentUploadedFiles} from "@/store/slice/chatCommentSlice";

interface ChatFileUploadProps {
    /** Whose draft the files join: the thread's root message. */
    chatMessageUUID: string;
    /** Where the files are stored: the group's media. */
    grpId: string
}

// Module-level, so a thread with no draft yet reads the same value every time.
const EMPTY_INPUT_STATE = {};

export const GroupChatCommentFileUpload = ({ grpId, chatMessageUUID }:ChatFileUploadProps) => {
    const chatFileUploadOpen = useSelector((state: RootState) => state.ui.groupChatCommentFileUpload);

    // The thread's own files, not the group's: every thread in a group shared them (MC-BUG-1).
    const chatFiles = useSelector((state: RootState) => state.chatComments.chatCommentInputState[chatMessageUUID] || EMPTY_INPUT_STATE);

    const dispatch = useDispatch();
    const uploadFile = useUploadFile()

    const fileInputRef = React.useRef<HTMLInputElement>(null)


    const handleFile = React.useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files?.length) return

            await uploadFile.makeRequestToUploadToGroupChatComment(files, grpId, chatMessageUUID)

            if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Clear the input
            }

        },
        [grpId, chatMessageUUID, uploadFile]
    )

    useEffect(() => {

        if (chatFileUploadOpen.isOpen) {
            fileInputRef.current?.click()
            dispatch(closeUI('groupChatCommentFileUpload'))
        }

    }, [chatFileUploadOpen]);

    const removeProjectPreviewFile = (key: string) => {
        dispatch(
            deleteChatCommentPreviewFiles({
                key,
                threadId: chatMessageUUID
            })
        );
        dispatch(
            removeChatCommentUploadedFiles({
                key,
                threadId: chatMessageUUID
            })
        );
    }


    const handleAttachmentIconCLick = (uploadProgress: number, key: string) => {
        if (uploadProgress != 100) {
            return
        }




        const attachmentMedia = chatFiles.filesUploaded.find((uploadFile)=> uploadFile.attachment_obj_key == key) || {} as AttachmentMediaReq

        dispatch(openUI({
            key: 'attachmentLightbox',
            data: {allMedia:  chatFiles.filesUploaded, media: attachmentMedia, mediaGetUrl: GetEndpointUrl.GetGroupChatMedia + '/' + grpId}
        }))

    }


    return (
        <div className='flex flex-wrap'>
            {
                chatFiles.filesPreview?.map((pfile)=>{
                    return <UploadingAttachmentIcon
                        fileName={pfile.fileName}
                        progress={pfile.progress}
                        fileKey={pfile.key}
                        removeFile={()=>{removeProjectPreviewFile(pfile.key)}}
                        key={pfile.key}
                        getUrl={pfile.uuid?(GetEndpointUrl.GetGroupChatMedia + '/' + grpId + '/' + pfile.uuid):undefined}
                        attachmentOnCLick={()=>{handleAttachmentIconCLick(pfile.progress, pfile.key)}}
                        attachmentType={pfile.attachmentType}/>
                })
            }

            <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFile}/>
        </div>
    )

}