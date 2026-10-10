'use client';

import { X } from "@/lib/icons";
import { AttachmentType} from "@/types/attachment";
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
            className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-border"

        >
            <button
                type="button"
                aria-label="Cancel upload"
                className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-border border"
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
                <div className="truncate max-w-40 text-2xs tabular-nums text-muted-foreground">
                    Uploading… {progress}%
                </div>
            </div>}
            {/* How far it has got, on every tile, the picture-only ones on a
                phone too: the words above are not always shown. */}
            <div
                role="progressbar"
                aria-label={`Uploading ${fileName}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-highlight"
            >
                {/* Moves by transform, as the shared Progress does: growing its
                    width laid the tile out again on every step. */}
                <div
                    className="h-full w-full rounded-full bg-foreground/50 transition-transform duration-200 ease-out motion-reduce:transition-none"
                    style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, progress))}%)` }}
                />
            </div>
        </div>
    );
};

export default UploadingAttachmentIcon;