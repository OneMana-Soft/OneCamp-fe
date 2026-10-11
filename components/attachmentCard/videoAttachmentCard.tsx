import {cn} from "@/lib/utils/helpers/cn";
import {AttachmentMediaReq} from "@/types/attachment";


interface Props {
    attachment: AttachmentMediaReq
    selfSize?: boolean
    cover?: boolean
    autoplay?: boolean
    maxHeight?: `${number}rem`
    url?: string
    controls?: boolean

}

export function VideoAttachmentCard({ url, attachment, selfSize, cover = false, autoplay = true, maxHeight, controls = true }: Props) {

    return (
        <video
            key={attachment.attachment_uuid}
            muted
            loop={(attachment.attachment_duration || 0 )< 60000} // loop if less than one minute
            controls={controls}
            preload='metadata'
            draggable={false}
            playsInline
            autoPlay={autoplay}
            className={cn('relative max-w-full rounded-xl border border-border/50 shadow-e1 overflow-hidden', {
                'h-full max-h-[44rem]': selfSize && !maxHeight,
                'max-h-full': !selfSize && !maxHeight,
                'h-full w-full object-cover': cover,
                'object-contain': !cover,
                'pointer-events-none': !controls
            })}
            style={{
                width: selfSize ? attachment.attachment_width : undefined,
                maxHeight
            }}
        >
            <source src={`${url}#t=0.1`} type={attachment.attachment_file_name} />
            <source src={`${url}#t=0.1`} />
        </video>
    )
}
