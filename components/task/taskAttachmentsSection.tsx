"use client"

import { Plus, X } from "@/lib/icons";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  return (
    <div className="mb-4">
      <div className="mb-2">
        <Label className="inline">Attachments</Label>
      </div>

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <div className="flex justify-between items-center">
            <Label htmlFor="project-file-task-upload" className="cursor-pointer">
              <div className="p-2 h-14 w-14 border-dashed bg-background rounded-2xl border-2 text-muted-foreground flex justify-center items-center hover:border-primary hover:text-primary transition-colors">
                <Plus size={30} />
              </div>
            </Label>
            <Input
              type="file"
              id="project-file-task-upload"
              multiple
              ref={fileInputRef}
              onChange={onFileSelect}
              className="hidden"
            />
          </div>
        )}
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
