import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useEffect} from "react";
import {closeUI, openUI} from "@/store/slice/uiSlice";
import * as React from "react";
import {useUploadFile} from "@/hooks/useUploadFile";
import UploadingAttachmentIcon from "@/components/attachmentIcon/uploadingAttachmentIcon";
import {GetEndpointUrl} from "@/services/endPoints";
import {AttachmentMediaReq} from "@/types/attachment";
import {deleteDocCommentPreviewFiles, removeDocCommentUploadedFiles} from "@/store/slice/createDocCommentSlice";
import {selectDocCommentInputState} from "@/store/selectors/createDocCommentSelectors";

interface DocFileUploadProps {
    docUUID: string
}

export const DocCommentFileUpload = ({docUUID}:DocFileUploadProps) => {
    const docCommentFileUploadOpen = useSelector((state: RootState) => state.ui.docCommentFileUpload);

    const docCommentFiles = useSelector((state: RootState) =>
        selectDocCommentInputState(state, docUUID),
    );

    const dispatch = useDispatch();
    const uploadFile = useUploadFile()

    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleFile = React.useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files?.length) return

            await uploadFile.makeRequestToUploadToDocComment(files, docUUID)

            if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Clear the input
            }

        },
        [docUUID, uploadFile]
    )

    useEffect(() => {

        if (docCommentFileUploadOpen.isOpen) {
            fileInputRef.current?.click()
            dispatch(closeUI('docCommentFileUpload'))
        }

    }, [docCommentFileUploadOpen]);

    const removeProjectPreviewFile = (key: string) => {
        dispatch(deleteDocCommentPreviewFiles({ key, docUUID }))
        dispatch(removeDocCommentUploadedFiles({ key, docUUID }))
    }


    const handleAttachmentIconCLick = (uploadProgress: number, key: string) => {
        if (uploadProgress != 100) {
            return
        }




        const attachmentMedia = docCommentFiles.filesUploaded.find((uploadFile)=> uploadFile.attachment_obj_key == key) || {} as AttachmentMediaReq

        dispatch(openUI({
            key: 'attachmentLightbox',
            data: {allMedia:  docCommentFiles.filesUploaded, media: attachmentMedia, mediaGetUrl: GetEndpointUrl.GetDocMedia + '/' + docUUID}
        }))

    }


    return (
        <div className='flex flex-wrap'>
            {
                docCommentFiles.filesPreview?.map((pfile)=>{
                    return <UploadingAttachmentIcon
                        fileName={pfile.fileName}
                        progress={pfile.progress}
                        fileKey={pfile.key}
                        removeFile={()=>{removeProjectPreviewFile(pfile.key)}}
                        key={pfile.key}
                        getUrl={pfile.uuid?(GetEndpointUrl.GetDocMedia + '/' + docUUID + '/' + pfile.uuid):undefined}
                        attachmentOnCLick={()=>{handleAttachmentIconCLick(pfile.progress, pfile.key)}}
                        attachmentType={pfile.attachmentType}/>
                })
            }

            <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFile}/>
        </div>
    )

}