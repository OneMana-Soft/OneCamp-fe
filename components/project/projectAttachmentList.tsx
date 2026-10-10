import * as React from "react";
import {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";

import {
    clearProjectAttachmentInputState,
    deleteProjectAttachmentPreviewFiles,
    removeProjectAttachmentUploadedFiles,
} from "@/store/slice/projectAttachmentSlice";
import {useUploadFile} from "@/hooks/useUploadFile";
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
import { ErrorState } from "@/components/ui/error-state";
import { AddFilesTile, ProjectFilesEmpty, ProjectFilesNoMatch, ProjectFilesSkeleton } from "@/components/project/projectFiles";


interface ProjectAttachmentsProps {
    projectId: string;
    searchQuery: string
}
export function ProjectAttachmentList({projectId, searchQuery}: ProjectAttachmentsProps) {

    const dispatch = useDispatch()
    const post = usePost()
    const uploadFile = useUploadFile()
    const fileInputRef = React.useRef<HTMLInputElement>(null)



    const projectAttachmentList = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectAttachments + '/' + projectId)
    const projectInputState = useSelector(
        (state: RootState) => state.projectAttachment.projectAttachmentInputState
    );

    // The files a search shows, worked out as the list renders: it was copied
    // into state by an effect, so for a frame after each keystroke the list
    // showed the last search's files, and a file added during a search never
    // showed in it.
    const allFiles = projectAttachmentList.data?.data.project_attachments
    const shownFiles = React.useMemo(() => {
        const q = searchQuery.toLowerCase().replace(/\s+/g, '')
        if (!q) return allFiles || []
        return (allFiles || []).filter((f) => f.attachment_file_name.toLowerCase().replace(/\s+/g, '').includes(q))
    }, [allFiles, searchQuery])

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

        dispatch(openUI({
            key: 'attachmentLightbox',
            data: {allMedia:  projectAttachmentList.data?.data.project_attachments, media: attachmentMedia, mediaGetUrl: GetEndpointUrl.GetProjectMedia + '/' + projectId}
        }))

    }





    const isAdmin = projectAttachmentList.data?.data.project_is_admin || false
    const uploading = projectInputState[projectId]?.filesPreview || []
    const pickFiles = () => fileInputRef.current?.click()
    const query = searchQuery.trim()
    const noMatch = !!query && shownFiles.length === 0
    const empty = !query && shownFiles.length === 0 && uploading.length === 0

    return (
        <div className="px-4 py-3">
            {projectAttachmentList.isLoading ? (
                <ProjectFilesSkeleton />
            ) : projectAttachmentList.isError ? (
                <ErrorState subject="the attachments" onRetry={() => void projectAttachmentList.mutate()} className="py-10" />
            ) : noMatch ? (
                <ProjectFilesNoMatch query={query} className="min-h-[40vh]" />
            ) : empty ? (
                <ProjectFilesEmpty onAdd={isAdmin ? pickFiles : undefined} className="min-h-[40vh]" />
            ) : (
                <div className="flex flex-wrap items-stretch gap-3">
                    {shownFiles.map((file) => (
                        <ProjectAttachment
                            key={file.attachment_uuid}
                            attachmentInfo={file}
                            isAdmin={isAdmin}
                            handleRemoveAttachment={handleDelete}
                            projectUUID={projectId}
                            handleAttachmentIconCLick={() => { handleAttachmentIconCLick(file) }}
                        />
                    ))}
                    {uploading.map((pfile) => (
                        <UploadingAttachmentIcon
                            fileName={pfile.fileName}
                            progress={pfile.progress}
                            fileKey={pfile.key}
                            removeFile={() => { removeProjectPreviewFile(pfile.key) }}
                            key={pfile.key}
                            getUrl={pfile.uuid ? (GetEndpointUrl.GetProjectMedia + '/' + projectId + '/' + pfile.uuid) : undefined}
                            attachmentOnCLick={() => {}}
                            attachmentType={pfile.attachmentType}
                        />
                    ))}
                    {isAdmin && !query && <AddFilesTile onClick={pickFiles} />}
                </div>
            )}
            {isAdmin && (
                <Input
                    ref={fileInputRef}
                    type="file"
                    key={uploading.length}
                    id="project-file-upload"
                    multiple
                    onChange={handleProjectFileUpload}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                />
            )}
        </div>
    )
}
