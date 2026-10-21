"use client"

import * as React from "react"
import { useDispatch, useSelector } from "react-redux"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotPlug, SpotSearch } from "@/components/ui/graphics"
import { Upload } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { accessOf } from "@/lib/work/access"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { usePost } from "@/hooks/usePost"
import { useUploadFile } from "@/hooks/useUploadFile"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { ProjectsGet } from "@/services/endpoints/projects"
import { deleteProjectAttachmentPreviewFiles, removeProjectAttachmentUploadedFiles } from "@/store/slice/projectAttachmentSlice"
import { openUI } from "@/store/slice/uiSlice"
import type { RootState } from "@/store/store"
import type { AttachmentMediaReq, AttachmentType } from "@/types/attachment"
import type { ProjectAddAttachmentInterface, ProjectInfoRawInterface, ProjectRemoveAttachmentInterface } from "@/types/project"

/**
 * What a project's Files tab does, on a computer (ProjectAttachments) and on
 * a phone (ProjectAttachmentList), so the two behave alike: the list, uploads
 * with their progress and failures, Retry, cancel, delete, and the lightbox.
 */
export function useProjectFiles(projectId: string) {
  const dispatch = useDispatch()
  const post = usePost()
  const uploadFile = useUploadFile()
  // Both Files tabs show a failed load themselves, with Try again: no toast on top.
  const list = useFetch<ProjectInfoRawInterface>(ProjectsGet.GetProjectAttachments + "/" + projectId, undefined, undefined, OWN_ERRORS)
  const state = useSelector((s: RootState) => s.projectAttachment.projectAttachmentInputState[projectId])
  const uploading = React.useMemo(() => state?.filesPreview ?? [], [state])

  const remove = React.useCallback(
    (key: string) => {
      dispatch(deleteProjectAttachmentPreviewFiles({ key, projectUUID: projectId }))
      dispatch(removeProjectAttachmentUploadedFiles({ key, projectUUID: projectId }))
    },
    [dispatch, projectId],
  )

  // Once every upload still running has finished, the finished ones join the
  // project in one call. A failed upload waits on its card for Retry or
  // Remove, and no longer holds the others back.
  React.useEffect(() => {
    if (!state) return
    const live = state.filesPreview.filter((f) => !f.failed)
    if (live.length === 0 || state.filesUploaded.length === 0 || live.length !== state.filesUploaded.length) return
    const done = state.filesUploaded
    void post
      .makeRequest<ProjectAddAttachmentInterface>({
        apiEndpoint: PostEndpointUrl.AddAttachmentToProject,
        payload: { project_uuid: projectId, project_attachments: done },
      })
      .then(() => list.mutate())
    for (const f of live) remove(f.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the upload state alone
  }, [state])

  const upload = React.useCallback(
    (files: FileList | File[]) => {
      if (files.length) void uploadFile.makeRequestToUploadToProject(files, projectId)
    },
    [projectId, uploadFile],
  )
  const cancel = (key: string) => {
    uploading.find((f) => f.key === key)?.cancelSource?.cancel()
    remove(key)
  }
  const retry = (key: string) => {
    const f = uploading.find((p) => p.key === key)
    remove(key)
    if (f?.file) upload([f.file])
  }
  const del = (id: string) => {
    if (!id) return
    void post
      .makeRequest<ProjectRemoveAttachmentInterface>({ apiEndpoint: PostEndpointUrl.RemoveAttachmentToProject, payload: { attachment_obj_key: id } })
      .then(() => list.mutate())
  }
  const files = list.data?.data.project_attachments || []
  const open = (media: AttachmentMediaReq) => {
    if (!files.length) return
    dispatch(openUI({ key: "attachmentLightbox", data: { allMedia: files, media, mediaGetUrl: GetEndpointUrl.GetProjectMedia + "/" + projectId } }))
  }

  return {
    list,
    files,
    uploading,
    // Adding files is for the people who work in it, taking them away for its
    // admins, as the server says (Work Access).
    canAdd: accessOf(list.data?.data).add_files,
    isAdmin: accessOf(list.data?.data).manage,
    mediaPath: (uuid: string) => `${GetEndpointUrl.GetProjectMedia}/${projectId}/${uuid}`,
    upload,
    cancel,
    retry,
    remove,
    del,
    open,
  }
}

export type FileTypeFilter = "all" | AttachmentType
export type FileSort = "newest" | "name" | "size"

export const TYPE_FILTERS: { value: FileTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "image", label: "Images" },
  { value: "document", label: "Documents" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
]

export const SORTS: { value: FileSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
]

/** The files a type filter, a sort and a search show. Pure. */
export function shownFiles(files: AttachmentMediaReq[], type: FileTypeFilter, sort: FileSort, query = ""): AttachmentMediaReq[] {
  const q = query.toLowerCase().replace(/\s+/g, "")
  const out = files.filter(
    (f) => (type === "all" || f.attachment_type === type) && (!q || f.attachment_file_name.toLowerCase().replace(/\s+/g, "").includes(q)),
  )
  if (sort === "name") out.sort((a, b) => a.attachment_file_name.localeCompare(b.attachment_file_name))
  else if (sort === "size") out.sort((a, b) => (b.attachment_size || 0) - (a.attachment_size || 0))
  else out.sort((a, b) => (b.attachment_created_at || "").localeCompare(a.attachment_created_at || ""))
  return out
}

/**
 * A project with no files (F01): a dashed region that lights up while files
 * are dragged over the tab, the plug drawing, "Drop files here", what belongs
 * here, and for someone who can add files, Upload.
 */
export function ProjectFilesEmpty({ onAdd, canAdd, className }: { onAdd?: () => void; canAdd?: boolean; className?: string }) {
  const can = !!onAdd || !!canAdd
  return (
    <div
      data-files-empty=""
      className={cn(
        "flex min-h-60 items-center justify-center rounded-[16px] border border-dashed border-line-3 transition-colors group-data-[dragging=true]/files:border-brand group-data-[dragging=true]/files:bg-brand/5",
        className,
      )}
    >
      <EmptyState
        illustration={<SpotPlug />}
        title={can ? "Drop files here" : "No files yet"}
        description={can ? "Briefs, contracts, designs: everything this project runs on." : "Files added to this project show here."}
        action={
          onAdd && (
            <Button variant="secondary" size="sm" onClick={onAdd} className="gap-1.5">
              <Upload className="size-3.5" aria-hidden="true" />
              Upload
            </Button>
          )
        }
      />
    </div>
  )
}

/** A search through a project's files that found nothing. */
export function ProjectFilesNoMatch({ query, className }: { query: string; className?: string }) {
  return <EmptyState illustration={<SpotSearch />} title={`No files match “${query}”`} className={className} />
}

/** A project's files while they load: cards (or rows) the size of the real ones. */
export function ProjectFilesSkeleton({ view = "grid" }: { view?: "grid" | "list" }) {
  return view === "list" ? (
    <div role="status" aria-label="Loading files" className="grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="flex h-14 items-center gap-3 border-b border-line">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  ) : (
    <div role="status" aria-label="Loading files" className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-44 rounded-xl" />
      ))}
    </div>
  )
}
