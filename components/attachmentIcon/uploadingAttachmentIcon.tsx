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
            className="relative m-1 mt-2 flex items-center justify-center gap-1 overflow-hidden rounded-xl bg-raised p-1.5 pr-3 shadow-e1"

        >
            <button
                type="button"
                aria-label="Cancel upload"
                className="absolute right-1 top-1 z-[1] rounded-md bg-pop p-0.5 text-ink-3 shadow-e1 hover:text-ink"
                onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                }}
            >
                <X height="1rem" width="1rem" />
            </button>
            <AttachmentIcon attachmentType={attachmentType} attachmentOnCLick={attachmentOnCLick} getUrl={getUrl} fileName={fileName} />

            {(isDesktop || (!getUrl) || (attachmentType == 'document') || (attachmentType == 'other')) && <div className="flex-col">
                <div className="max-w-40 truncate text-ui-sm font-medium text-ink">
                    {fileName}
                </div>
                <div className="max-w-40 truncate text-meta tabular-nums text-ink-3">
                    Uploading · {progress}%
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
                className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-press"
            >
                {/* A 2px accent line along the card's foot (design v3 chat,
                    C24), filling by transform and linearly: growing its width
                    laid the tile out again on every step. */}
                <div
                    className="h-full w-full origin-left bg-brand transition-transform duration-200 ease-linear motion-reduce:transition-none"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }}
                />
            </div>
        </div>
    );
};

export default UploadingAttachmentIcon;