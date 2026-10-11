"use client"

import * as React from "react"

import { ErrorState } from "@/components/ui/error-state"
import { FileRow, UploadingFileCard } from "@/components/project/fileCard"
import { ProjectFilesEmpty, ProjectFilesNoMatch, ProjectFilesSkeleton, shownFiles, useProjectFiles } from "@/components/project/projectFiles"

interface ProjectAttachmentsProps {
    projectId: string
    searchQuery: string
}

/**
 * A project's files on a phone (content.md F01): 56 px rows only, uploads as
 * rows with their ring, and the app bar's + to upload (it opens the picker,
 * the camera among its choices). Same behaviour as the desktop tab.
 */
export function ProjectAttachmentList({ projectId, searchQuery }: ProjectAttachmentsProps) {
    const p = useProjectFiles(projectId)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    // The files a search shows, worked out as the list renders, so a file
    // added during a search shows in it at once.
    const shown = React.useMemo(() => shownFiles(p.files, "all", "newest", searchQuery), [p.files, searchQuery])
    const query = searchQuery.trim()
    const noMatch = !!query && shown.length === 0
    const empty = !query && shown.length === 0 && p.uploading.length === 0
    const pickFiles = () => fileInputRef.current?.click()

    return (
        <div className="px-4 py-3">
            {p.list.isLoading ? (
                <ProjectFilesSkeleton view="list" />
            ) : p.list.isError ? (
                <ErrorState subject="the files" onRetry={() => void p.list.mutate()} className="py-10" />
            ) : noMatch ? (
                <ProjectFilesNoMatch query={query} className="min-h-[40vh]" />
            ) : empty ? (
                <ProjectFilesEmpty onAdd={p.isAdmin ? pickFiles : undefined} className="min-h-[40vh]" />
            ) : (
                <div className="grid">
                    {p.uploading.map((u) => (
                        <UploadingFileCard
                            key={u.key}
                            view="list"
                            name={u.fileName}
                            progress={u.progress}
                            size={u.size}
                            failed={u.failed}
                            onCancel={() => p.cancel(u.key)}
                            onRetry={u.file ? () => p.retry(u.key) : undefined}
                            onRemove={() => p.remove(u.key)}
                        />
                    ))}
                    {shown.map((file) => (
                        <FileRow key={file.attachment_uuid} file={file} mediaPath={p.mediaPath(file.attachment_uuid)} onOpen={() => p.open(file)} canDelete={p.isAdmin} onDelete={() => p.del(file.attachment_uuid)} />
                    ))}
                </div>
            )}
            {p.isAdmin && (
                <input
                    ref={fileInputRef}
                    type="file"
                    id="project-file-upload"
                    multiple
                    onChange={(e) => {
                        if (e.target.files?.length) p.upload(Array.from(e.target.files))
                        e.target.value = ""
                    }}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                />
            )}
        </div>
    )
}
