import { Plus } from "@/lib/icons";

import * as React from "react";
import {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";

import {
    clearProjectAttachmentInputState,
    deleteProjectAttachmentPreviewFiles,
    removeProjectAttachmentUploadedFiles,
} from "@/store/slice/projectAttachmentSlice";
import {useUploadFile} from "@/hooks/useUploadFile";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {RootState} from "@/store/store";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {
    ProjectAddAttachmentInterface,
    ProjectInfoRawInterface,
    ProjectRemoveAttachmentInterface
} from "@/types/project";
import UploadingAttachmentIcon from "@/components/attachmentIcon/uploadingAttachmentIcon";
import {AttachmentMediaReq} from "@/types/attachment";
import {openUI} from "@/store/slice/uiSlice";
import ProjectAttachment from "@/components/project/projectAttachment";


interface ProjectAttachmentsProps {
    projectId: string;
}
export function ProjectAttachments({projectId}: ProjectAttachmentsProps) {

    const dispatch = useDispatch()
    const post = usePost()
    const uploadFile = useUploadFile()
    const fileInputRef = React.useRef<HTMLInputElement>(null)


    const projectAttachmentList = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectAttachments + '/' + projectId)
    const projectInputState = useSelector(
        (state: RootState) => state.projectAttachment.projectAttachmentInputState
    );

    useEffect(() => {

        if(projectInputState[projectId] && projectInputState[projectId].filesPreview.length == projectInputState[projectId].filesUploaded.length) {
            addAttachmentsToProject()

        }

    }, [projectInputState]);

    const addAttachmentsToProject = async () => {
        // Get the latest state
        const currentProjectAttachmentState = projectInputState[projectId];

        if (!currentProjectAttachmentState || !currentProjectAttachmentState.filesUploaded || currentProjectAttachmentState.filesUploaded.length === 0) {
            return;
        }

        post.makeRequest<ProjectAddAttachmentInterface>({
            apiEndpoint: PostEndpointUrl.AddAttachmentToProject,
            payload: {
                project_uuid: projectId,
                project_attachments: currentProjectAttachmentState.filesUploaded
            }
        }).then(()=>{
            projectAttachmentList.mutate()

        })

        dispatch(clearProjectAttachmentInputState({projectUUID: projectId}));

    };



    const handleProjectFileUpload = React.useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files?.length) return

            await uploadFile.makeRequestToUploadToProject(files, projectId)

            if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Clear the input
            }

        },
        [projectId, uploadFile]
    )

    const removeProjectPreviewFile = (key: string) => {
        dispatch(
            deleteProjectAttachmentPreviewFiles({
                key,
                projectUUID: projectId
            })
        );
        dispatch(
            removeProjectAttachmentUploadedFiles({
                key,
                projectUUID: projectId
            })
        );
    }

    const handleDelete = (id: string) => {

        if(!id) return

        post.makeRequest<ProjectRemoveAttachmentInterface>({
            apiEndpoint: PostEndpointUrl.RemoveAttachmentToProject,
            payload: {
                attachment_obj_key: id
            }
        }).then(()=>{
            projectAttachmentList.mutate()
        })


    }

    const handleAttachmentIconCLick = (attachmentMedia: AttachmentMediaReq) => {

        if(!projectAttachmentList.data?.data.project_attachments) return

        dispatch(openUI({ key: 'attachmentLightbox', data: {allMedia:  projectAttachmentList.data?.data.project_attachments, media: attachmentMedia, mediaGetUrl: GetEndpointUrl.GetProjectMedia + '/' + projectId} }))

    }





    return (
        <div>
            <div className="flex flex-wrap mb-4 items-center">
                {projectAttachmentList.data?.data.project_attachments &&
                    projectAttachmentList.data?.data.project_attachments.map(
                        (file) => {
                            return (
                                <div key={file.attachment_uuid}>

                                    <ProjectAttachment
                                        attachmentInfo={file}
                                        isAdmin={projectAttachmentList.data?.data.project_is_admin || false}
                                        handleRemoveAttachment={handleDelete}
                                        projectUUID={projectId}
                                        handleAttachmentIconCLick={()=>{handleAttachmentIconCLick(file)}}
                                    />
                                </div>
                            );
                        }
                    )}
                {projectInputState[projectId]?.filesPreview &&
                    projectInputState[projectId].filesPreview.map(
                        (pfile) => {

                            return <UploadingAttachmentIcon
                                fileName={pfile.fileName}
                                progress={pfile.progress}
                                fileKey={pfile.key}
                                removeFile={()=>{removeProjectPreviewFile(pfile.key)}}
                                key={pfile.key}
                                getUrl={pfile.uuid?(GetEndpointUrl.GetProjectMedia + '/' + projectId + '/' + pfile.uuid):undefined}
                                attachmentOnCLick={()=>{}}
                                attachmentType={pfile.attachmentType}/>

                        }
                    )}

                {projectAttachmentList.data?.data.project_is_admin && <div>
                    <Label htmlFor="project-file-upload" className="cursor-pointer">
                        <div
                            className="p-7 h-8 w-8 border-dashed bg-background rounded-2xl border-2 text-muted-foreground flex justify-center items-center ">
                            <div>
                                <Plus size='30'/>

                            </div>
                        </div>
                    </Label>

                    <Input
                        ref={fileInputRef}
                        type="file"
                        key={
                            (projectInputState[projectId] &&
                                projectInputState[projectId].filesPreview
                                    .length) ||
                            0
                        }
                        id="project-file-upload"
                        multiple
                        onChange={handleProjectFileUpload}
                        style={{display: "none"}}
                    />
                </div>}
            </div>


        </div>
    )
}
