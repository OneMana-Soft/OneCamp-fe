import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useEffect} from "react";
import {closeUI} from "@/store/slice/uiSlice";
import * as React from "react";
import {useUploadFile} from "@/hooks/useUploadFile";
import UploadingAttachmentIcon from "@/components/attachmentIcon/uploadingAttachmentIcon";
import {openUI} from "@/store/slice/uiSlice";
import {GetEndpointUrl} from "@/services/endPoints";
import {AttachmentMediaReq} from "@/types/attachment";
import {deleteTaskCommentPreviewFiles, removeTaskCommentUploadedFiles} from "@/store/slice/createTaskCommentSlice";

interface ProjectFileUploadProps {
    projectUUID: string;
    taskUUID: string
}

export const TaskCommentFileUpload = ({projectUUID, taskUUID}:ProjectFileUploadProps) => {
    const taskCommentFileUploadOpen = useSelector((state: RootState) => state.ui.taskCommentFileUpload);

    const taskCommentFiles = useSelector((state: RootState) => state.createTaskComment.taskCommentInputState[taskUUID] || {});

    const dispatch = useDispatch();
    const uploadFile = useUploadFile()

    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleFile = React.useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files?.length) return

            await uploadFile.makeRequestToUploadToTaskComment(files, projectUUID, taskUUID)

            if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Clear the input
            }

        },
        [taskUUID, uploadFile]
    )

    useEffect(() => {

        if (taskCommentFileUploadOpen.isOpen) {
            fileInputRef.current?.click()
            dispatch(closeUI('taskCommentFileUpload'))
        }

    }, [taskCommentFileUploadOpen]);

    const removeProjectPreviewFile = (key: string) => {
        dispatch(deleteTaskCommentPreviewFiles({ key, taskUUID }))
        dispatch(removeTaskCommentUploadedFiles({ key, taskUUID }))
    }


    const handleAttachmentIconCLick = (uploadProgress: number, key: string) => {
        if (uploadProgress != 100) {
            return
        }




        const attachmentMedia = taskCommentFiles.filesUploaded.find((uploadFile)=> uploadFile.attachment_obj_key == key) || {} as AttachmentMediaReq

        dispatch(openUI({
            key: 'attachmentLightbox',
            data: {allMedia:  taskCommentFiles.filesUploaded, media: attachmentMedia, mediaGetUrl: GetEndpointUrl.GetProjectMedia + '/' + projectUUID}
        }))

    }


    return (
        <div className='flex flex-wrap'>
            {
                taskCommentFiles.filesPreview?.map((pfile)=>{
                    return <UploadingAttachmentIcon
                        fileName={pfile.fileName}
                        progress={pfile.progress}
                        fileKey={pfile.key}
                        removeFile={()=>{removeProjectPreviewFile(pfile.key)}}
                        key={pfile.key}
                        getUrl={pfile.uuid?(GetEndpointUrl.GetProjectMedia + '/' + projectUUID + '/' + pfile.uuid):undefined}
                        attachmentOnCLick={()=>{handleAttachmentIconCLick(pfile.progress, pfile.key)}}
                        attachmentType={pfile.attachmentType}/>
                })
            }

            <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFile}/>
        </div>
    )

}