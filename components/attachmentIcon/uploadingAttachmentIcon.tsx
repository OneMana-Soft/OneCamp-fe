'use client';

import { FileImage, FileText, FileVideo, File, X, Play } from "@/lib/icons";
import { FileAudio2 } from "lucide-react";
import Image from 'next/image';
import {useEffect, useState} from "react";
import { AttachmentType} from "@/types/attachment";
import {getVideoThumbnail} from "@/lib/utils/file/getVideoThumbnail";
import { useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {useMedia} from "@/context/MediaQueryContext";
import {AttachmentIcon} from "@/components/attachments/attachmentIcon";

type ConditionalIconProps = {
    fileName: string;
    progress: number;
    fileKey: string;
    getUrl?: string;
    attachmentOnCLick: () => void;
    removeFile: () => void;
    attachmentType: AttachmentType

};

const UploadingAttachmentIcon = ({
                                     fileName,
                                     progress,
                                     getUrl,
                                     fileKey,
                                     removeFile,
                                     attachmentOnCLick,
                                    attachmentType,
                                 }: ConditionalIconProps) => {


    const {isDesktop } = useMedia();





    return (
        <div
            className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-gray-700"

        >
            <button
                className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-gray-700 border"
                onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                }}
            >
                <X height="1rem" width="1rem" />
            </button>
            <AttachmentIcon attachmentType={attachmentType} attachmentOnCLick={attachmentOnCLick} getUrl={getUrl} fileName={fileName} />

            {(isDesktop || (!getUrl) || (attachmentType == 'document') || (attachmentType == 'other')) && <div className="flex-col">
                <div className="text-ellipsis truncate max-w-40 text-xs">
                    {fileName}
                </div>
                <div className="text-ellipsis truncate max-w-40 text-xs">
                    uploading: {progress}%
                </div>
            </div>}
        </div>
    );
};

export default UploadingAttachmentIcon;