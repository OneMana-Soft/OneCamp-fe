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
    chatMessageUUID: string;
    grpId: string
}

export const GroupChatCommentFileUpload = ({ grpId}:ChatFileUploadProps) => {
    const chatFileUploadOpen = useSelector((state: RootState) => state.ui.groupChatCommentFileUpload);

    const chatFiles = useSelector((state: RootState) => state.chatComments.chatCommentInputState[grpId] || {});

    const dispatch = useDispatch();
    const uploadFile = useUploadFile()

    const fileInputRef = React.useRef<HTMLInputElement>(null)


    const handleFile = React.useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files?.length) return

            await uploadFile.makeRequestToUploadToGroupChatComment(files, grpId)

            if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Clear the input
            }

        },
        [grpId, uploadFile]
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
                chatUUID: grpId
            })
        );
        dispatch(
            removeChatCommentUploadedFiles({
                key,
                chatUUID: grpId
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