import Image from "next/image";
import { File, FileImage, FileText, FileVideo, Play } from "@/lib/icons";
import { FileAudio2 } from "@/lib/icons";
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

};

export const AttachmentIcon = ({
                                  fileName,
                                   getUrl,
                                   attachmentOnCLick,
                                   attachmentType,
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
                case 'document':
                    return <FileText className='w-10 h-10 m-1 rounded-lg' />;
                case 'audio':
                    return <FileAudio2 className='w-10 h-10 m-1 rounded-lg' />;

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
                        <FileVideo className='w-10 h-10 m-1 rounded-lg' />
                    );
                default:
                    return <File className='w-10 h-10 m-1 rounded-lg' />;
            }
        }

        switch (attachmentType) {
            case 'image':
                return <FileImage className='w-10 h-10 m-1 rounded-lg' />;
            case 'document':
                return <FileText className='w-10 h-10 m-1 rounded-lg' />;
            case 'audio':
                return <FileAudio2 className='w-10 h-10 m-1 rounded-lg' />;
            case 'video':
                return <FileVideo className='w-10 h-10 m-1 rounded-lg' />;
            default:
                return <File className='w-10 h-10 m-1 rounded-lg' />;
        }
    };


    return (
        <div onClick={attachmentOnCLick}
             className={getUrl ? "hover:cursor-pointer" : ""}
        >
            {renderIcon()}
        </div>
    )

}