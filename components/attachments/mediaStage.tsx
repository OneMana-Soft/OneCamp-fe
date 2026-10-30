"use client"

import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"
import VideoPlayer from "@/components/attachments/videoPlayer"
import { AudioPlayer } from "@/components/fileUpload/AudioPlayer"
import DocumentViewer from "@/components/attachments/documentViewer"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { Download, Loader2, RotateCcw, ZoomIn, ZoomOut } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { viewableDocumentType } from "@/lib/utils/file/getAttachmentType"
import type { AttachmentType } from "@/types/attachment"

// The lightbox's stage (components/dialog/attachmentLightboxDialog), shared
// with Docs & Files' preview (docs F1b): one file drawn by its kind, on the
// near-black stage both draw it on.

/**
 * What the stage draws a file with (the lightbox, and Docs & Files' preview,
 * docs F1b): its signed address, a key that mounts a fresh viewer per file,
 * whether the address is still coming (an image fades in when it does), the
 * download, and for the file's card its media type and the card's surface.
 */
export interface StageMedia {
    key: string
    url: string
    loading: boolean
    onDownload: () => void
    /** The file's media type: its card's glyph. */
    mime?: string
    /** The card's surface: dark on the stage itself, light in a phone's sheet. */
    tone?: "dark" | "light"
    /**
     * Told while the stage draws the file's card instead of the file, by a
     * surface that holds the download itself (a phone's sheet: its footer's
     * Download is the card's, so the card draws none, and one Download shows).
     */
    onCantPreview?: (cant: boolean) => void
}

/**
 * A file the stage can't draw, as one card wherever that happens (design
 * review, 21 Oct: never a blank page): a kind no viewer reads (a pptx, a
 * legacy .doc), a PDF in a browser with no PDF viewer (a phone's Chrome), a
 * file its viewer couldn't read, an image that didn't load. Its glyph, its
 * name, that it can't be previewed, and Download, unless the surface holds
 * the download itself (onCantPreview).
 */
export function CantPreview({ name, media }: { name: string; media: Pick<StageMedia, "mime" | "tone" | "onDownload" | "onCantPreview"> }) {
    const dark = media.tone !== "light"
    const told = media.onCantPreview
    useEffect(() => {
        if (!told) return
        told(true)
        return () => told(false)
    }, [told])
    return (
        <div
            data-testid="no-preview"
            className={cn(
                "content-rise flex w-[min(360px,100%)] flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center",
                dark ? "bg-[#16171A] text-white shadow-e4 ring-1 ring-white/10" : "bg-raised text-ink shadow-e2",
            )}
        >
            <FileGlyph name={name} fileType={media.mime} size={40} />
            <p className="max-w-full truncate text-ui font-medium">{name}</p>
            <p className={cn("text-ui-sm", dark ? "text-white/60" : "text-ink-3")}>Can&apos;t preview this file</p>
            {told ? null : (
                <Button size="sm" onClick={media.onDownload} className="mt-1 gap-1.5">
                    <Download className="size-3.5" aria-hidden="true" />
                    Download
                </Button>
            )}
        </div>
    )
}

/** An image to zoom; one that doesn't load is its card. */
function StageImage({ fileName, media }: { fileName: string; media: StageMedia }) {
    // Which file failed: the stage stays mounted from one file to the next.
    const [failed, setFailed] = useState<string | null>(null)
    if (failed === media.key) return <CantPreview name={fileName} media={media} />
    return (
        <div
            className="relative h-full w-full flex items-center justify-center overflow-hidden"
            style={{ touchAction: "none" }}
        >
            <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={8}
                centerOnInit
                wheel={{ step: 0.2 }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div
                            className={cn(
                                "absolute z-[var(--z-sticky)] flex h-9 items-center gap-0.5 rounded-[18px] px-1",
                                "bg-[rgb(30_31_35/.9)] ring-1 ring-white/10",
                                "bottom-[calc(theme(spacing.6)+env(safe-area-inset-bottom))]",
                                "left-1/2 -translate-x-1/2",
                            )}
                            role="toolbar"
                            aria-label="Image zoom controls"
                            data-touch-group=""
                        >
                            <Button
                                data-tone="light"
                                variant="ghost"
                                size="icon"
                                onClick={() => zoomIn()}
                                className="size-7 rounded-[14px] text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Zoom in"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button
                                data-tone="light"
                                variant="ghost"
                                size="icon"
                                onClick={() => zoomOut()}
                                className="size-7 rounded-[14px] text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Zoom out"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button
                                data-tone="light"
                                variant="ghost"
                                size="icon"
                                onClick={() => resetTransform()}
                                className="size-7 rounded-[14px] text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Reset zoom"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        </div>
                        <TransformComponent
                            wrapperStyle={{ width: "100%", height: "100%" }}
                            contentStyle={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <div
                                key={media.key}
                                className="relative w-full h-full flex items-center justify-center"
                            >
                                {media.loading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                                        <Loader2 className="h-10 w-10 text-white animate-spin" />
                                    </div>
                                )}
                                <Image
                                    src={media.url || "/placeholder.svg"}
                                    alt={fileName}
                                    fill
                                    priority
                                    sizes="100vw"
                                    className={cn(
                                        "object-contain transition duration-200",
                                        media.loading
                                            ? "opacity-0 scale-95"
                                            : "opacity-100 scale-100",
                                    )}
                                    unoptimized={true}
                                    draggable={false}
                                    // Its own address, not the stand-in while it comes.
                                    onError={() => {
                                        if (media.url) setFailed(media.key)
                                    }}
                                />
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    )
}

/**
 * One file on the stage, by its kind: an image to zoom, a video, audio, or
 * a document the in-app viewer reads (PDF, Word, Excel, text); anything it
 * can't draw is the file's card.
 */
export function renderAsPerAttachmentType(attachmentString: AttachmentType, fileName: string, media: StageMedia): ReactNode {
    switch (attachmentString) {
        case "image":
            return <StageImage fileName={fileName} media={media} />

        case "video":
            return (
                <VideoPlayer
                    key={media.key}
                    url={media.url}
                    fileName={fileName}
                />
            )

        case "audio":
            return (
                <AudioPlayer key={media.key} url={media.url} />
            )

        case "document":
        case "other":
            const viewable = viewableDocumentType(fileName)

            if (viewable) {
                return (
                    <DocumentViewer
                        key={media.key}
                        url={media.url}
                        type={viewable}
                        fallback={<CantPreview name={fileName} media={media} />}
                    />
                )
            }

            return <CantPreview name={fileName} media={media} />
    }
}
