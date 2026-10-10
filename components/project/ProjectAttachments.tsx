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
import { ProjectFilesEmpty, ProjectFilesSkeleton } from "@/components/project/projectFiles";
import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { sectionTitle } from "@/lib/ui/fieldRow";
import { useEntityLinks } from "@/services/entityLinkService";
import { EntityLinkPicker } from "@/components/entityLink/EntityLinkPicker";
import { LinkedItemsList } from "@/components/entityLink/LinkedItemsSection";
import { WorkState, workBody, workToolbar } from "@/components/task/workFrame";


interface ProjectAttachmentsProps {
    projectId: string;
    /** A member may link docs and boards; the server checks again. */
    canLink?: boolean;
}

/**
 * A project's Attachments tab on a computer, in the frame every tab of a
 * project draws in (components/task/workFrame): a toolbar row with "Link a
 * doc or board" and "Add files", then its files and its linked docs and
 * boards, each under its own title, starting where every other tab starts.
 * It was the task panel's linked-items section dropped in a p-4 box (16px
 * down and in from the other tabs, with its own spinner and a bare "None
 * linked."), over a files grid with a second inset.
 */
export function ProjectAttachments({projectId, canLink = false}: ProjectAttachmentsProps) {

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





    const files = projectAttachmentList.data?.data.project_attachments || []
    const uploading = projectInputState[projectId]?.filesPreview || []
    const isAdmin = projectAttachmentList.data?.data.project_is_admin || false
    const pickFiles = () => fileInputRef.current?.click()

    const links = useEntityLinks("project", projectId)
    const linked = links.docs.length + links.boards.length
    const mayLink = canLink && !links.forbidden
    const loading = projectAttachmentList.isLoading || (links.isLoading && linked === 0)
    const failed = !!projectAttachmentList.isError && !projectAttachmentList.data
    const empty = !loading && !failed && files.length === 0 && uploading.length === 0 && linked === 0

    return (
        <div className="flex flex-col pb-4">
            <div data-work-toolbar="" className={cn(workToolbar, "justify-end")}>
                {mayLink && (
                    <EntityLinkPicker
                        onPick={(refType, refUUID) => links.addLink(refType, refUUID)}
                        isLinked={links.hasLink}
                        disabled={links.mutating}
                        triggerClassName="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    />
                )}
                {isAdmin && (
                    <Button size="sm" className="h-8" onClick={pickFiles}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add files
                    </Button>
                )}
            </div>
            <div className={workBody}>
                {loading ? (
                    <ProjectFilesSkeleton />
                ) : failed ? (
                    <WorkState>
                        <ErrorState subject="the attachments" onRetry={() => void projectAttachmentList.mutate()} />
                    </WorkState>
                ) : empty ? (
                    <WorkState>
                        <ProjectFilesEmpty canAdd={isAdmin} />
                    </WorkState>
                ) : (
                    <div className="space-y-8">
                        {(files.length > 0 || uploading.length > 0) && (
                            <section aria-label="Files">
                                <h3 className={cn(sectionTitle, "mb-3")}>Files</h3>
                                <div className="flex flex-wrap items-stretch gap-3">
                                    {files.map((file) => (
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
                                </div>
                            </section>
                        )}
                        {linked > 0 && (
                            <section aria-label="Linked docs and boards">
                                <h3 className={cn(sectionTitle, "mb-3")}>Linked docs and boards</h3>
                                <div className="flex max-w-xl flex-col gap-1.5">
                                    <LinkedItemsList docs={links.docs} boards={links.boards} canEdit={mayLink} onRemove={links.removeLink} />
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
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
