import Image from "next/image";
import { Play } from "@/lib/icons";
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon";
import {useEffect, useState} from "react";
import {useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {getVideoThumbnail} from "@/lib/utils/file/getVideoThumbnail";
import {AttachmentType} from "@/types/attachment";

interface AttachmentIconProps {
    getUrl?: string;
    fileName: string;
    attachmentOnCLick: () => void;
    attachmentType: AttachmentType
    /**
     * Out of the tab order, where something beside it already opens the file
     * (a project file's name): one stop per action. Defaults to in it.
     */
    focusable?: boolean

};

export const AttachmentIcon = ({
                                  fileName,
                                   getUrl,
                                   attachmentOnCLick,
                                   attachmentType,
                                   focusable = true,
                               }:AttachmentIconProps) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

    const mediaRes = useMediaFetch<GetMediaURLRes>(getUrl ? getUrl : '')

    useEffect( () => {
        if(attachmentType == 'video' && mediaRes.data?.url) {
            getVideoThumbnail(mediaRes.data?.url)
                .then((res)=>{
                    setThumbnailUrl(res)
                })

        }

    },[mediaRes.data?.url, attachmentType])

    const renderIcon = () => {
        if (mediaRes.data?.url) {
            switch (attachmentType) {
                case 'image':
                    return (
                        <Image
                            src={mediaRes.data?.url}
                            className='w-10 h-10 m-1 rounded-lg'
                            alt={fileName}
                            width={40}
                            height={40}
                        />
                    );
                case 'video':
                    return thumbnailUrl ? (
                        <div className='relative '>
                            <Image
                                src={thumbnailUrl}
                                className='w-10 h-10 m-1 rounded-lg'
                                alt={fileName}
                                width={40}
                                height={40}
                            />
                            <Play size={16} className='absolute top-[30%]  left-[30%]'/>
                        </div>

                    ) : (
                        <FileGlyph name={fileName} className='m-1' />
                    );
                default:
                    return <FileGlyph name={fileName} className='m-1' />;
            }
        }

        // Until there is a URL, every kind is its glyph on its camp tint (FileGlyph).
        return <FileGlyph name={fileName} className='m-1' />;
    };


    // A button: it was a div with a click handler, which the keyboard could
    // not reach and a screen reader did not announce. With nothing to open yet
    // (still uploading) it is disabled.
    return (
        <button
            type="button"
            onClick={attachmentOnCLick}
            disabled={!getUrl}
            tabIndex={focusable ? undefined : -1}
            aria-label={`Open ${fileName}`}
            className="block shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 enabled:cursor-pointer disabled:cursor-default"
        >
            {renderIcon()}
        </button>
    )

}