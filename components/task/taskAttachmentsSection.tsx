"use client"

import { Paperclip, X } from "@/lib/icons";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { inlineAdd, sectionTitle } from "@/lib/ui/fieldRow"
import ProjectAttachment from "@/components/project/projectAttachment"
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon"
import type { AttachmentMediaReq } from "@/types/attachment"

interface TaskAttachmentsSectionProps {
  isAdmin: boolean
  attachments: AttachmentMediaReq[]
  previewFiles: Array<{
    key: string
    fileName: string
    attachmentType: string
    progress: number
  }>
  projectUUID: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveAttachment: (key: string) => void
  onAttachmentClick: (media: AttachmentMediaReq) => void
  onRemovePreview: (key: string) => void
}

export function TaskAttachmentsSection({
  isAdmin,
  attachments,
  previewFiles,
  projectUUID,
  fileInputRef,
  onFileSelect,
  onRemoveAttachment,
  onAttachmentClick,
  onRemovePreview,
}: TaskAttachmentsSectionProps) {
  // Nothing to show and nothing to add: no section at all.
  if (!isAdmin && attachments.length === 0 && previewFiles.length === 0) return null
  return (
    <div className="mb-4">
      <h3 className={cn(sectionTitle, "mb-2")}>Attachments</h3>
      {isAdmin && (
        <>
          {/* A button the keyboard reaches: the dashed tile was a label over a
              hidden input, which only a pointer could open. */}
          <Button type="button" variant="ghost" size="sm" className={inlineAdd} onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            Attach a file
          </Button>
          <Input type="file" id="project-file-task-upload" multiple ref={fileInputRef} onChange={onFileSelect} className="hidden" tabIndex={-1} aria-hidden />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {attachments.map((file) => (
          <ProjectAttachment
            key={file.attachment_uuid}
            attachmentInfo={file}
            isAdmin={isAdmin}
            handleRemoveAttachment={onRemoveAttachment}
            handleAttachmentIconCLick={() => onAttachmentClick(file)}
            projectUUID={projectUUID}
          />
        ))}
        {previewFiles.map((file) => (
          <div
            key={file.key}
            className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-border"
          >
            <button
              type="button"
              className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-border border hover:bg-destructive hover:text-destructive-foreground transition-colors"
              onClick={() => onRemovePreview(file.key)}
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <FileTypeIcon name={file.fileName} fileType={file.attachmentType} />
            </div>
            <div className="flex-col">
              <div className="text-ellipsis truncate max-w-40 text-xs">{file.fileName}</div>
              <div className="text-ellipsis truncate max-w-40 text-xs text-muted-foreground">
                Uploading: {file.progress}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
