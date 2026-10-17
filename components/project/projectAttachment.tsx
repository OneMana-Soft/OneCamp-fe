import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, File, FileArchive, FileAudio2, FileImage, FileText, FileVideo, MoreHorizontal, Trash2 } from "@/lib/icons"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { CampHue } from "@/lib/campHue"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { shortDate } from "@/lib/utils/date/shortDate"
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
import { useConfirm } from "@/hooks/useConfirm"

interface ProjectAttachmentProps {
    attachmentInfo: AttachmentMediaReq
    isAdmin: boolean
    handleRemoveAttachment: (id: string) => void
    handleAttachmentIconCLick: () => void
    projectUUID: string
    /** "row": the desktop Files tab's 48 px row (work.md W26); "tile": the phone's chip. */
    variant?: "tile" | "row"
}

/** A file's kind as a hue and an icon: the 32 px tile at the start of its row. */
export function fileKind(a: Pick<AttachmentMediaReq, "attachment_type" | "attachment_file_name">): { hue: CampHue | null; Icon: typeof File; word: string } {
    const ext = (a.attachment_file_name.split(".").pop() || "").toLowerCase()
    if (a.attachment_type === "image") return { hue: "moss", Icon: FileImage, word: "Image" }
    if (a.attachment_type === "video") return { hue: "dusk", Icon: FileVideo, word: "Video" }
    if (a.attachment_type === "audio") return { hue: "sun", Icon: FileAudio2, word: "Audio" }
    if (ext === "pdf") return { hue: "berry", Icon: FileText, word: "PDF" }
    if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return { hue: null, Icon: FileArchive, word: "Archive" }
    if (["doc", "docx", "txt", "md", "rtf", "odt", "pages"].includes(ext)) return { hue: "sky", Icon: FileText, word: "Document" }
    if (["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return { hue: "lake", Icon: FileText, word: "Spreadsheet" }
    return { hue: null, Icon: File, word: ext ? ext.toUpperCase() : "File" }
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
    variant = "tile",
}: ProjectAttachmentProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const confirm = useConfirm()

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

    const menu = (
        isAdmin && (
                <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground",
                                "md:opacity-0 pointer-events-none md:group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 transition-opacity [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
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
                            variant="destructive"
                            // Asked first: it goes for everyone on the project.
                            onClick={() =>
                                confirm({
                                    title: `Delete the file \u201c${attachmentInfo.attachment_file_name}\u201d?`,
                                    description: "It is removed from this project for everyone. This can't be undone.",
                                    confirmText: "Delete file",
                                    destructive: true,
                                    onConfirm: () => handleRemoveAttachment(attachmentInfo.attachment_uuid || ""),
                                })
                            }
                            className="cursor-pointer text-danger-ink"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
        )
    )

    if (variant === "row") {
        const kind = fileKind(attachmentInfo)
        const created = attachmentInfo.attachment_created_at ? new Date(attachmentInfo.attachment_created_at) : null
        const meta = [
            kind.word,
            attachmentInfo.attachment_size ? formatFileSizeForAttachment(attachmentInfo.attachment_size) : "",
            created && !Number.isNaN(created.getTime()) && created.getFullYear() > 1971 ? shortDate(created) : "",
        ].filter(Boolean).join(" · ")
        return (
            <div data-file-row="" className="group relative flex h-12 items-center gap-3 border-b border-line px-2 transition-colors hover:bg-hover">
                <span
                    aria-hidden="true"
                    data-file-tile={kind.hue ?? "neutral"}
                    className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", kind.hue ? cn(HUE_CLASS[kind.hue], "bg-hue-tint text-hue-ink") : "bg-press text-ink-2")}
                >
                    <kind.Icon className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={handleAttachmentIconCLick}
                        title={attachmentInfo.attachment_file_name}
                        className="truncate rounded-sm text-left text-ui font-medium text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                        {attachmentInfo.attachment_file_name}
                    </button>
                    <span className="truncate text-xs text-ink-3">{meta}</span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Download ${attachmentInfo.attachment_file_name}`} onClick={handleDownload} className="opacity-0 pointer-events-none transition-opacity focus-visible:opacity-100 focus-visible:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                    <Download className="size-3.5" />
                </Button>
                {menu}
            </div>
        )
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
                // The name beside it opens the file too, and takes the focus.
                focusable={false}
                attachmentType={attachmentInfo.attachment_type}
                attachmentOnCLick={handleAttachmentIconCLick}
                getUrl={GetEndpointUrl.GetProjectMedia + "/" + projectUUID + "/" + attachmentInfo.attachment_uuid}
                fileName={attachmentInfo.attachment_file_name}
            />
            <div className="flex flex-col min-w-0 flex-1">
                {/* The name opens the file too: the picture beside it is not
                    reachable from the keyboard. */}
                <button
                    type="button"
                    onClick={handleAttachmentIconCLick}
                    title={attachmentInfo.attachment_file_name}
                    className="text-xs font-medium truncate text-left text-foreground rounded-sm hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    {attachmentInfo.attachment_file_name}
                </button>
                <button
                    type="button"
                    onClick={handleDownload}
                    className="text-2xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit transition-colors"
                >
                    <Download className="h-3 w-3" />
                    Download
                </button>
            </div>
            {menu}
        </div>
    )
}
