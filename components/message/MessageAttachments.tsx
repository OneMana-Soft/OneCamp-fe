import {ATTACHMENT_MAX_IMAGE_GRID_SIZE, AttachmentMediaReq} from "@/types/attachment";
import {useMemo, useState} from "react";
import {useCanHover} from "@/hooks/useCanHover";
import {isRenderable} from "@/lib/utils/validation/isRenderable";
import {cn} from "@/lib/utils/helpers/cn";
import {MessageAttachmentCard} from "@/components/message/MessageAttachmentCard";
import {FileTypeIcon} from "@/components/fileIcon/fileTypeIcon";
import {truncateFileName} from "@/lib/utils/format/truncateFileName";
import {useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {downloadFile} from "@/lib/utils/file/downloadFile";

import {getFriendlyFileExtension} from "@/lib/utils/format/getFriendlyFileExtension";
import {formatFileSizeForAttachment} from "@/lib/utils/format/formatFileSizeForAttachment";
import {Download} from "lucide-react";

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

            <div
                className={cn(
                    'flex flex-col md:w-1/3 md:max-w-4xl items-start justify-start w-full mb-4 gap-2'
                )}
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
                                        className={cn('bg-elevated relative flex-1 rounded-xl overflow-hidden shadow-sm border border-border/50 group', {
                                            'col-span-2 max-h-[30rem]': only,
                                            'aspect-square': !only
                                        })}
                                        style={{ aspectRatio: only ? `${aspectRatio}` : undefined }}
                                    >
                                        <div className='pointer-events-none absolute inset-0 z-[1] rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10' />

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
                                                className='relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl transition-transform duration-300 hover:scale-[1.02]'
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
                                                    <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-all duration-200 group-hover:bg-black/50 pointer-events-none">
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
                                <NonRenderableAttachment key={attachment.attachment_uuid} attachment={attachment} attachmentLength={attachments.length} mediaGetUrl={mediaGetUrl}/>
                            ))}
                        </div>
                    )}


                </div>
            </div>
    )
}

interface NonRenderableAttachmentProps {
    attachment: AttachmentMediaReq
    attachmentLength: number
    mediaGetUrl: string
}

export function NonRenderableAttachment({ attachment, attachmentLength, mediaGetUrl }: NonRenderableAttachmentProps) {
    const mediaReq = useMediaFetch<GetMediaURLRes>(attachment?.attachment_uuid ? mediaGetUrl +'/'+attachment.attachment_uuid : '')

    const download = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (mediaReq.data?.url) {
            downloadFile(mediaReq.data.url,attachment.attachment_file_name)
        }
    }

    return (
        <div
            onClick={download}
            data-no-ripple="true"
            className={cn(
                'group flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/50 px-3 py-2 transition-all duration-200',
                'hover:bg-accent/40 hover:border-border/80 hover:shadow-sm cursor-pointer relative overflow-hidden w-full'
            )}
        >
            <div className="shrink-0 p-2 bg-background rounded-md border border-border/50 shadow-sm group-hover:scale-105 transition-transform duration-200">
                <FileTypeIcon name={attachment.attachment_file_name} fileType={attachment.attachment_raw_type} size={20}/>
            </div>

            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <div
                    className={cn(
                        'truncate text-sm font-medium text-foreground/90 group-hover:text-foreground transition-colors',
                    )}
                    title={attachment.attachment_file_name}
                >
                    {truncateFileName(attachment.attachment_file_name)}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/80">
                    <span className="uppercase tracking-wider">
                        {getFriendlyFileExtension(attachment.attachment_raw_type, attachment.attachment_file_name)}
                    </span>
                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40" />
                    <span>
                        {formatFileSizeForAttachment(attachment.attachment_size || 0)}
                    </span>
                </div>
            </div>

            <button
                onClick={download}
                className={cn(
                    "opacity-0 group-hover:opacity-100 transition-all duration-200",
                    "p-1.5 hover:bg-background rounded-full shadow-sm border border-border/50 shrink-0",
                    "translate-x-2 group-hover:translate-x-0"
                )}
                title="Download"
            >
                <Download size={14} className="text-foreground/80"/>
            </button>
        </div>
    )
}