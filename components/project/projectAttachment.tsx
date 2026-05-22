import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, MoreHorizontal, Trash2 } from "@/lib/icons"
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "../ui/dropdown-menu"

import { downloadFile } from "@/lib/utils/file/downloadFile"
import { GetEndpointUrl } from "@/services/endPoints"
import { AttachmentIcon } from "@/components/attachments/attachmentIcon"
import { AttachmentMediaReq } from "@/types/attachment"
import { useMediaFetch } from "@/hooks/useFetch"
import { GetMediaURLRes } from "@/types/file"
import { cn } from "@/lib/utils/helpers/cn"

interface ProjectAttachmentProps {
    attachmentInfo: AttachmentMediaReq
    isAdmin: boolean
    handleRemoveAttachment: (id: string) => void
    handleAttachmentIconCLick: () => void
    projectUUID: string
}

/**
 * Project attachment chip — a 56px-wide tile that shows a thumbnail/icon
 * and the file name. Click opens the lightbox; the overflow menu (admin
 * only) holds Download and Delete. Designed to flow inside the
 * `flex flex-wrap gap-3` grid of the attachments tab.
 */
export default function ProjectAttachment({
    attachmentInfo,
    handleAttachmentIconCLick,
    projectUUID,
    handleRemoveAttachment,
    isAdmin,
}: ProjectAttachmentProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    const mediaInfo = useMediaFetch<GetMediaURLRes>(
        attachmentInfo.attachment_obj_key
            ? GetEndpointUrl.GetProjectMedia + "/" + projectUUID + "/" + attachmentInfo.attachment_uuid
            : "",
    )

    const handleDownload = () => {
        if (mediaInfo.data?.url) {
            downloadFile(mediaInfo.data.url, attachmentInfo.attachment_file_name)
        }
    }

    return (
        <div
            className={cn(
                "group relative flex items-center gap-2 p-1.5 pr-2 rounded-xl",
                "border border-border bg-card hover:bg-accent/40 transition-colors",
                "max-w-[260px]",
            )}
        >
            <AttachmentIcon
                attachmentType={attachmentInfo.attachment_type}
                attachmentOnCLick={handleAttachmentIconCLick}
                getUrl={GetEndpointUrl.GetProjectMedia + "/" + projectUUID + "/" + attachmentInfo.attachment_uuid}
                fileName={attachmentInfo.attachment_file_name}
            />
            <div className="flex flex-col min-w-0 flex-1">
                <div className="text-xs font-medium truncate text-foreground">
                    {attachmentInfo.attachment_file_name}
                </div>
                <button
                    type="button"
                    onClick={handleDownload}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit transition-colors"
                >
                    <Download className="h-3 w-3" />
                    Download
                </button>
            </div>
            {isAdmin && (
                <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground",
                                "md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                                isDropdownOpen && "md:opacity-100",
                            )}
                            aria-label="Attachment options"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={handleDownload} className="cursor-pointer">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => handleRemoveAttachment(attachmentInfo.attachment_uuid || "")}
                            className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}
