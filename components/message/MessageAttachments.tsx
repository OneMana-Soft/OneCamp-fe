import {ATTACHMENT_MAX_IMAGE_GRID_SIZE, AttachmentMediaReq} from "@/types/attachment";
import {useMemo, useState} from "react";
import {isRenderable} from "@/lib/utils/validation/isRenderable";
import {cn} from "@/lib/utils/helpers/cn";
import {MessageAttachmentCard} from "@/components/message/MessageAttachmentCard";
import {FileTypeIcon} from "@/components/fileIcon/fileTypeIcon";
import {useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {downloadFile} from "@/lib/utils/file/downloadFile";

import {getFriendlyFileExtension} from "@/lib/utils/format/getFriendlyFileExtension";
import {formatFileSizeForAttachment} from "@/lib/utils/format/formatFileSizeForAttachment";
import { Download } from "@/lib/icons";
import { LinkCardBody, NEUTRAL_TILE, hueTileClass, linkCardClass } from "@/components/message/LinkCard";
import { fileKind, fileTypeHue, splitForMiddle } from "@/lib/utils/file/fileTypeHue";
import { VoiceClipCard, isVoiceClip } from "@/components/clips/VoiceClipCard";
import { viewableDocumentType } from "@/lib/utils/file/getAttachmentType";
import { useMedia } from "@/context/MediaQueryContext";

interface MessageAttachmentProps {
    attachments:  AttachmentMediaReq[];
    mediaGetUrl: string
    attachmentSelected: (at: AttachmentMediaReq) => void
    priority?: boolean
}

/** "1:07": a video's length for its chip. */
export function clipDuration(seconds?: number): string | null {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null
    const s = Math.round(seconds)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * The pictures and files under a message (design v3 chat, C24 and C25).
 *
 * One picture is drawn as it is, at most 480 by 360, r12 with a hairline
 * ring; two sit side by side, three as one tall and two stacked, four in a
 * square, and the last of four says "+N" on 40% black for the rest (no blur:
 * a blurred picture under a number reads as broken). Under the pointer a
 * picture dims to 96% and never grows. Files are cards of the one card
 * material, one column for one or two, two columns from three.
 */
export const MessageAttachments = ({attachmentSelected, attachments, mediaGetUrl, priority}:MessageAttachmentProps) => {
    const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({})

    const { renderables, nonRenderables } = useMemo(() => {
        const renderables: AttachmentMediaReq[] = []
        const nonRenderables: AttachmentMediaReq[] = []
        attachments.forEach((attachment) => {
            if (isRenderable(attachment)) renderables.push(attachment)
            else nonRenderables.push(attachment)
        })
        return { renderables, nonRenderables }
    }, [attachments])

    if (!attachments.length) return null

    const shown = renderables.slice(0, ATTACHMENT_MAX_IMAGE_GRID_SIZE)
    const only = renderables.length === 1
    const three = shown.length === 3

    return (
        <div data-message-attachments="" className="mt-2 flex w-full max-w-[520px] flex-col items-start gap-1.5">
            {shown.length > 0 && (
                <div
                    data-media-grid={shown.length}
                    // /collapse hides it (app/globals.css), as Slack hides inline media.
                    data-message-media=""
                    className={cn(
                        only ? "flex w-fit max-w-full" : "grid w-full max-w-[480px] grid-cols-2 gap-1",
                        three && "grid-rows-2",
                    )}
                >
                    {shown.map((attachment, index) => {
                        const overflow = index === ATTACHMENT_MAX_IMAGE_GRID_SIZE - 1 && renderables.length > ATTACHMENT_MAX_IMAGE_GRID_SIZE
                        const w = attachment.attachment_width, h = attachment.attachment_height
                        const ratio = w && h ? w / h : 4 / 3
                        // One picture keeps its shape inside 480 x 360.
                        const single = only ? { aspectRatio: `${ratio}`, width: `min(100%, 480px, ${Math.round(360 * ratio)}px)` } : undefined
                        const duration = attachment.attachment_type === "video" ? clipDuration(attachment.attachment_duration) : null
                        return (
                            <button
                                key={attachment.attachment_uuid}
                                type="button"
                                data-no-ripple="true"
                                data-media-tile=""
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    attachmentSelected({ ...attachment, initial_url: loadedUrls[attachment.attachment_uuid] })
                                }}
                                aria-label={`Open ${attachment.attachment_file_name}`}
                                className={cn(
                                    "group/media relative flex items-center justify-center overflow-hidden rounded-xl bg-sunken ring-1 ring-inset ring-line",
                                    "transition-[filter] duration-[140ms] ease-out hover:brightness-[.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                    only ? "max-h-[360px]" : "aspect-square",
                                    three && index === 0 && "row-span-2 aspect-auto",
                                )}
                                style={single}
                            >
                                <MessageAttachmentCard
                                    priority={priority}
                                    attachment={attachment}
                                    autoplay={false}
                                    mediaGetURL={mediaGetUrl}
                                    className="h-full w-full object-cover"
                                    onUrlLoaded={(url) => setLoadedUrls(prev => ({ ...prev, [attachment.attachment_uuid]: url }))}
                                />
                                {duration && !overflow && (
                                    <span className="pointer-events-none absolute bottom-2 right-2 rounded-[6px] bg-black/60 px-1.5 py-0.5 text-micro font-medium tabular-nums text-white">{duration}</span>
                                )}
                                {overflow && (
                                    <span data-media-more="" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-heading font-semibold tabular-nums text-white">
                                        +{renderables.length - (ATTACHMENT_MAX_IMAGE_GRID_SIZE - 1)}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}

            {nonRenderables.length > 0 && (
                <div data-file-grid="" className={cn("grid w-full gap-1.5", nonRenderables.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                    {nonRenderables.map((attachment) => isVoiceClip(attachment) ? (
                        <VoiceClipCard key={attachment.attachment_uuid} attachment={attachment} mediaGetUrl={mediaGetUrl}/>
                    ) : (
                        <NonRenderableAttachment key={attachment.attachment_uuid} attachment={attachment} mediaGetUrl={mediaGetUrl} onOpen={attachmentSelected}/>
                    ))}
                </div>
            )}
        </div>
    )
}

interface NonRenderableAttachmentProps {
    attachment: AttachmentMediaReq
    mediaGetUrl: string
    /** Opens the file in the viewer (the lightbox). */
    onOpen: (at: AttachmentMediaReq) => void
}

/**
 * A file that is not a picture or a video (C24): the card material, a tile
 * in its kind's hue with its type's icon, its name cut in the middle so the
 * start and the extension both stay, "PDF · 2.4 MB", and a download button
 * that shows with the pointer (always, on a touch screen).
 *
 * A file the viewer can show (a PDF, a Word or Excel file, text) opens there,
 * as a picture does, and keeps its own Download button: every shared PDF was
 * a download (MC-50). A phone's browser can't show a PDF inside the page, so
 * there a PDF downloads. Any other file is one button that downloads, so the
 * keyboard reaches it in one stop.
 */
function NonRenderableAttachment({ attachment, mediaGetUrl, onOpen }: NonRenderableAttachmentProps) {
    const mediaReq = useMediaFetch<GetMediaURLRes>(attachment?.attachment_uuid ? mediaGetUrl +'/'+attachment.attachment_uuid : '')
    const { isMobile } = useMedia()
    const name = attachment.attachment_file_name
    const hue = fileTypeHue(name, attachment.attachment_raw_type)
    const [head, tail] = splitForMiddle(name)
    const viewable = viewableDocumentType(name)
    const opens = !!viewable && !(viewable === "pdf" && isMobile)

    const download = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (mediaReq.data?.url) {
            downloadFile(mediaReq.data.url, name)
        }
    }

    const body = (trailing: React.ReactNode) => (
        <LinkCardBody
            icon={<FileTypeIcon name={name} fileType={attachment.attachment_raw_type} size={18}/>}
            iconClassName={hue ? hueTileClass(hue) : NEUTRAL_TILE}
            title={<span data-file-name="" className="flex min-w-0"><span className="truncate">{head}</span><span className="shrink-0 whitespace-pre">{tail}</span></span>}
            detail={`${getFriendlyFileExtension(attachment.attachment_raw_type, name)} · ${formatFileSizeForAttachment(attachment.attachment_size || 0)}`}
            trailing={trailing}
        />
    )
    // Shown with the pointer (always on a touch screen), and taking clicks only then.
    const downloadGlyph = "flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 pointer-events-none transition-opacity duration-[140ms] group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"

    if (!opens) {
        return (
            <button
                type="button"
                onClick={download}
                data-no-ripple="true"
                data-file-card=""
                data-file-kind={fileKind(name, attachment.attachment_raw_type)}
                aria-label={`Download ${name}`}
                title={name}
                className={cn(linkCardClass, "group max-w-none")}
            >
                {body(
                    <span aria-hidden="true" className={cn(downloadGlyph, "group-hover:bg-hover group-hover:text-ink group-focus-visible:opacity-100")}>
                        <Download className="size-4"/>
                    </span>,
                )}
            </button>
        )
    }

    // The card opens the file; its Download is a button of its own beside
    // the name (never inside the open button: a button can't hold another).
    return (
        <div
            data-file-card=""
            data-file-kind={fileKind(name, attachment.attachment_raw_type)}
            title={name}
            className={cn(linkCardClass, "group max-w-none")}
        >
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpen(attachment)
                }}
                data-no-ripple="true"
                aria-label={`Open ${name}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
            >
                {body(null)}
            </button>
            <button
                type="button"
                onClick={download}
                data-no-ripple="true"
                aria-label={`Download ${name}`}
                className={cn(downloadGlyph, "relative z-[1] hover:bg-hover hover:text-ink focus-visible:opacity-100")}
            >
                <Download className="size-4"/>
            </button>
        </div>
    )
}
