import { useState } from 'react'

import {AttachmentMediaReq} from "@/types/attachment";
import {ImageAttachmentCard} from "@/components/attachmentCard/imageAttachmentCard";
import {VideoAttachmentCard} from "@/components/attachmentCard/videoAttachmentCard";
import {useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {EyeOff, Play} from "lucide-react";
import {cn} from "@/lib/utils/helpers/cn";

function getApproximateAspectRatio(val: number, lim = 10) {
    let lower = [0, 1]
    let upper = [1, 0]

    // eslint-disable-next-line no-constant-condition
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

export function MessageAttachmentCard({ mediaGetURL, attachment, autoplay, className, priority, onUrlLoaded }: Props) {
    const cover = attachmentShouldCover(attachment)

    const mediaReq = useMediaFetch<GetMediaURLRes>(attachment?.attachment_uuid ? mediaGetURL +'/'+attachment.attachment_uuid : '')

    useEffect(() => {
        if (mediaReq.data?.url && onUrlLoaded) {
            onUrlLoaded(mediaReq.data.url)
        }
    }, [mediaReq.data?.url])


    if (mediaReq.isError) {
        return (
            <div className={cn('bg-secondary/50 text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-border/50 p-4', className)}>
                <EyeOff size={24} />
                <span className="text-xs font-medium">Failed to load</span>
            </div>
        )
    }

    if (mediaReq.isLoading || !mediaReq.data?.url) {
        return (
            <Skeleton className={cn('h-full w-full rounded-xl', className)} />
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                    <div className="bg-black/30 backdrop-blur-sm p-3 rounded-full border border-white/20 shadow-lg">
                        <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                </div>
            </div>
        )
    }

    return null
}

export function Accessory({ label }: { label: string }) {
    return (
        <div className='dark:bg-elevated rounded-md bg-black px-2 py-1 text-center font-mono text-[11px] text-xs font-semibold text-white'>
            {label}
        </div>
    )
}
