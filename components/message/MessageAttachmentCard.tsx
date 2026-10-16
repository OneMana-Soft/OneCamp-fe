
import {AttachmentMediaReq} from "@/types/attachment";
import {ImageAttachmentCard} from "@/components/attachmentCard/imageAttachmentCard";
import {VideoAttachmentCard} from "@/components/attachmentCard/videoAttachmentCard";
import {useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import { EyeOff, Play } from "@/lib/icons";
import {cn} from "@/lib/utils/helpers/cn";

function getApproximateAspectRatio(val: number, lim = 10) {
    let lower = [0, 1]
    let upper = [1, 0]

     
    while (true) {
        const mediant = [lower[0] + upper[0], lower[1] + upper[1]]

        if (val * mediant[1] > mediant[0]) {
            if (lim < mediant[1]) {
                return upper
            }
            lower = mediant
        } else if (val * mediant[1] == mediant[0]) {
            if (lim >= mediant[1]) {
                return mediant
            }
            if (lower[1] < upper[1]) {
                return lower
            }
            return upper
        } else {
            if (lim < mediant[1]) {
                return lower
            }
            upper = mediant
        }
    }
}

function attachmentShouldCover(attachment: AttachmentMediaReq) {
    if(!attachment.attachment_width || !attachment.attachment_height) return false
    if (attachment.attachment_type != 'video') return false

    const approximateAspectRatio = getApproximateAspectRatio(attachment.attachment_width / attachment.attachment_height)
    const approximatelyVideo = [
        [16, 9],
        [4, 3],
        [3, 2],
        [2, 1]
    ]
    const shouldCover = approximatelyVideo.some((aspectRatio) => {
        return approximateAspectRatio[0] === aspectRatio[0] && approximateAspectRatio[1] === aspectRatio[1]
    })

    return shouldCover
}

interface Props {
    attachment: AttachmentMediaReq
    autoplay?: boolean
    mediaGetURL: string
    className?: string
    priority?: boolean
    onUrlLoaded?: (url: string) => void
}

import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from 'react'
import { useSaysLoadFailure } from "@/lib/http/loadFailure"

export function MessageAttachmentCard({ mediaGetURL, attachment, autoplay, className, priority, onUrlLoaded }: Props) {
    const cover = attachmentShouldCover(attachment)

    const mediaReq = useMediaFetch<GetMediaURLRes>(attachment?.attachment_uuid ? mediaGetURL +'/'+attachment.attachment_uuid : '')
    // Said in place ("Couldn't load this"); the request's toast stays quiet.
    useSaysLoadFailure(!!mediaReq.isError)

    useEffect(() => {
        if (mediaReq.data?.url && onUrlLoaded) {
            onUrlLoaded(mediaReq.data.url)
        }
    }, [mediaReq.data?.url])


    if (mediaReq.isError) {
        return (
            <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-sunken p-4 text-ink-3', className)}>
                <EyeOff size={20} />
                <span className="text-meta font-medium">Couldn't load this</span>
            </div>
        )
    }

    if (mediaReq.isLoading || !mediaReq.data?.url) {
        return (
            <Skeleton className={cn('h-full min-h-24 w-full rounded-xl', className)} />
        )
    }


    if (attachment.attachment_type == 'image') {
        return <ImageAttachmentCard priority={priority} attachment={attachment} selfSize cover url={mediaReq.data?.url} className={className}/>
    }

    if (attachment.attachment_type == 'video') {
        return (
            <div
                className={cn('relative flex max-h-[44rem] w-full items-center justify-center', className)}
                style={{ aspectRatio: (attachment.attachment_width && attachment.attachment_height) ? `${attachment.attachment_width} / ${attachment.attachment_height}` : '1 / 1' }}
            >

                <VideoAttachmentCard selfSize attachment={attachment} cover={cover} autoplay={autoplay} url={mediaReq.data?.url} controls={false}/>
                {/* The poster's 44px play disc (C25): solid, no blur, the glyph nudged right to sit centred. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span data-play-disc="" className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white">
                        <Play className="ml-0.5 size-5 fill-white" />
                    </span>
                </div>
            </div>
        )
    }

    return null
}
