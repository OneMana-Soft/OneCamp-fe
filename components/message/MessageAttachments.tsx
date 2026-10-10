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
import { LinkCardBody, linkCardClass } from "@/components/message/LinkCard";

interface MessageAttachmentProps {
    attachments:  AttachmentMediaReq[];
    mediaGetUrl: string
    attachmentSelected: (at: AttachmentMediaReq) => void
    priority?: boolean
}

export const MessageAttachments = ({attachmentSelected, attachments, mediaGetUrl, priority}:MessageAttachmentProps) => {
    const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({})


    const { renderables, nonRenderables } = useMemo(() => {
        const renderables: AttachmentMediaReq[] = []
        const nonRenderables: AttachmentMediaReq[] = []

        attachments.forEach((attachment) => {
            if (isRenderable(attachment)) {
                renderables.push(attachment)
            } else {
                nonRenderables.push(attachment)
            }
        })

        return { renderables, nonRenderables }
    }, [attachments])

    if (!attachments.length) return null


    return (

            // One width for what sits under a message, as the cards' (448px,
            // the full width on a phone). It was a third of the column: 370px
            // at 1440 and 170px on a small laptop, with a one-off 16px under it.
            <div
                data-message-attachments=""
                className='mt-1.5 flex w-full max-w-md flex-col items-start justify-start gap-2'
            >
                <div className={cn('md:shrink-0', )} />

                <div
                    className={cn('relative flex flex-col justify-start gap-2 w-full')}
                >

                    {renderables?.length > 0 && (
                        <div className='grid grid-cols-2 gap-2 w-full'>
                            {renderables.slice(0, ATTACHMENT_MAX_IMAGE_GRID_SIZE).map((attachment, index) => {
                                const only = renderables.length === 1
                                const overflow = index ===  ATTACHMENT_MAX_IMAGE_GRID_SIZE - 1 && renderables.length >  ATTACHMENT_MAX_IMAGE_GRID_SIZE
                                const aspectRatio = (attachment.attachment_width && attachment.attachment_height) ? attachment.attachment_width / attachment.attachment_height : 1

                                return (
                                    <div
                                        key={attachment.attachment_uuid}
                                        className={cn('bg-elevated relative flex-1 rounded-xl overflow-hidden border border-border/50 group', {
                                            'col-span-2 max-h-[30rem]': only,
                                            'aspect-square': !only
                                        })}
                                        style={{ aspectRatio: only ? `${aspectRatio}` : undefined }}
                                    >
                                        <div className='pointer-events-none absolute inset-0 z-[var(--z-base)] rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10' />

                                            <button
                                                type="button"
                                                data-no-ripple="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    attachmentSelected({
                                                        ...attachment,
                                                        initial_url: loadedUrls[attachment.attachment_uuid]
                                                    });
                                                }}
                                                aria-label={`Open ${attachment.attachment_file_name}`}
                                                className='relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl transition-transform duration-200 hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100'
                                            >
                                                <MessageAttachmentCard
                                                    priority={priority}
                                                    attachment={attachment}
                                                    autoplay={false}
                                                    mediaGetURL={mediaGetUrl}
                                                    className="h-full w-full object-cover"
                                                    onUrlLoaded={(url) => setLoadedUrls(prev => ({ ...prev, [attachment.attachment_uuid]: url }))}
                                                />
                                                {overflow && (
                                                    <div className="absolute inset-0 z-[var(--z-base)] bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition duration-150 group-hover:bg-black/50 pointer-events-none">
                                                        <div className='text-xl font-medium text-white'>
                                                            +{renderables.length - (ATTACHMENT_MAX_IMAGE_GRID_SIZE - 1)}
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {nonRenderables.length > 0 && (
                        <div className="flex flex-col gap-2 w-full">
                            {nonRenderables.map((attachment) => (
                                <NonRenderableAttachment key={attachment.attachment_uuid} attachment={attachment} mediaGetUrl={mediaGetUrl}/>
                            ))}
                        </div>
                    )}


                </div>
            </div>
    )
}

interface NonRenderableAttachmentProps {
    attachment: AttachmentMediaReq
    mediaGetUrl: string
}

/**
 * A file that is not a picture or a video, as the cards under a message are
 * drawn (LinkCard): its type's icon on a tile, its whole name cut to the
 * card's width, its type and size, and a download mark. One button, so the
 * keyboard reaches it: it was a clickable box (no focus, no name) holding a
 * Download button that showed only on hover, and the name was cut at a fixed
 * count of letters ("OneCamp brand....pdf" with room to spare).
 */
function NonRenderableAttachment({ attachment, mediaGetUrl }: NonRenderableAttachmentProps) {
    const mediaReq = useMediaFetch<GetMediaURLRes>(attachment?.attachment_uuid ? mediaGetUrl +'/'+attachment.attachment_uuid : '')
    const name = attachment.attachment_file_name

    const download = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (mediaReq.data?.url) {
            downloadFile(mediaReq.data.url, name)
        }
    }

    return (
        <button
            type="button"
            onClick={download}
            data-no-ripple="true"
            data-file-card=""
            aria-label={`Download ${name}`}
            title={name}
            className={cn(linkCardClass, "group")}
        >
            <LinkCardBody
                icon={<FileTypeIcon name={name} fileType={attachment.attachment_raw_type} size={16}/>}
                title={name}
                detail={`${getFriendlyFileExtension(attachment.attachment_raw_type, name)} · ${formatFileSizeForAttachment(attachment.attachment_size || 0)}`}
                trailing={<Download className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true"/>}
            />
        </button>
    )
}
