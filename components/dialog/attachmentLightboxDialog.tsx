"use client"

import { useState, useEffect, memo, useCallback } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, RotateCcw, Loader2 } from "@/lib/icons"
import { File as FileIcon, ZoomIn, ZoomOut } from "@/lib/icons"
import { AttachmentMediaReq, AttachmentType } from "@/types/attachment"
import { useMediaFetch } from "@/hooks/useFetch"
import { GetMediaURLRes } from "@/types/file"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { formatDateForAttachment } from "@/lib/utils/date/formatDateforAttachment"
import VideoPlayer from "@/components/attachments/videoPlayer"
import { AudioPlayer } from "@/components/fileUpload/AudioPlayer"
import DocumentViewer from "@/components/attachments/documentViewer"
import { useMedia } from "@/context/MediaQueryContext"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"
import { cn } from "@/lib/utils/helpers/cn"
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon"
import { truncateFileName } from "@/lib/utils/format/truncateFileName"
import { downloadFile } from "@/lib/utils/file/downloadFile"
import { isImageByExtension } from "@/lib/utils/file/getAttachmentType"

/**
 * Attachment lightbox.
 *
 * Theming approach (matches Notion / GitHub / iCloud Photos):
 *  - Dialog frame, sidebar, top bar, and bottom info bar follow the
 *    app theme via standard tokens (bg-background, bg-card, border,
 *    text-foreground). In light mode they are light; in dark mode
 *    they are dark.
 *  - The image canvas itself stays a neutral dark surface (zinc-950)
 *    in both themes so screenshots / photos with bright backgrounds
 *    don't blast white-on-white when opened. This is intentional and
 *    consistent with every major media viewer.
 *  - Floating zoom / nav buttons that sit on top of the image canvas
 *    use white-on-translucent-black so they remain legible regardless
 *    of theme; chrome buttons that sit on the themed surfaces use
 *    text-foreground so they pick up the active theme.
 */

interface MediaLightboxProps {
    media: AttachmentMediaReq
    setOpenState: (b: boolean) => void
    dialogOpenState: boolean
    allMedia: AttachmentMediaReq[]
    mediaGetUrl: string
}

/**
 * Resolve the *effective* attachment type for the lightbox renderer.
 *
 * The persisted `attachment_type` on the row is sometimes wrong for
 * historical reasons (the FE classifier used to bucket `webp` under
 * `video`, so legacy rows still carry that classification in Dgraph).
 * Rather than a one-off backfill — which would be expensive and would
 * still leave imported / API-sourced rows at risk if any other client
 * ever miscategorises them — the lightbox does a cheap, deterministic
 * filename check: if the file extension is one a browser <img> can
 * render, we route to the image branch regardless of what the row says.
 *
 * This is purely additive: rows that already classify correctly are
 * unaffected.
 */
function resolveEffectiveType(media: AttachmentMediaReq): AttachmentType {
    const persisted = media?.attachment_type || "other"
    const fileName = media?.attachment_file_name || ""

    // Legacy webp/avif/heic rows were stored as "video" or "other";
    // recover them here so they render natively in <img> instead of
    // failing inside <video>.
    if (persisted !== "image" && isImageByExtension(fileName)) {
        return "image"
    }
    return persisted
}

function MediaPrefetcher({
    currentIndex,
    allMedia,
    mediaGetUrl,
}: {
    currentIndex: number
    allMedia: AttachmentMediaReq[]
    mediaGetUrl: string
}) {
    const nextIndex = (currentIndex + 1) % allMedia.length
    const prevIndex = (currentIndex - 1 + allMedia.length) % allMedia.length

    const nextMedia = allMedia[nextIndex]
    const prevMedia = allMedia[prevIndex]

    const nextUrl =
        nextMedia?.attachment_uuid && mediaGetUrl
            ? mediaGetUrl + "/" + nextMedia.attachment_uuid
            : ""
    const prevUrl =
        prevMedia?.attachment_uuid && mediaGetUrl
            ? mediaGetUrl + "/" + prevMedia.attachment_uuid
            : ""

    const { data: nextData } = useMediaFetch<GetMediaURLRes>(nextUrl)
    const { data: prevData } = useMediaFetch<GetMediaURLRes>(prevUrl)

    useEffect(() => {
        // Treat anything renderable by <img> as an image for prefetch
        // purposes. This covers webp / avif / heic that older rows
        // persisted under a different attachment_type before the
        // classifier was fixed.
        const nextIsImage =
            nextMedia?.attachment_type === "image" ||
            isImageByExtension(nextMedia?.attachment_file_name || "")
        const prevIsImage =
            prevMedia?.attachment_type === "image" ||
            isImageByExtension(prevMedia?.attachment_file_name || "")

        if (nextData?.url && nextIsImage) {
            const img = new (window as any).Image()
            img.src = nextData.url
        }
        if (prevData?.url && prevIsImage) {
            const img = new (window as any).Image()
            img.src = prevData.url
        }
    }, [nextData?.url, prevData?.url])

    return null
}

const SidebarItem = memo(
    ({
        item,
        isSelected,
        onClick,
    }: {
        item: AttachmentMediaReq
        isSelected: boolean
        onClick: (item: AttachmentMediaReq) => void
    }) => {
        return (
            <div
                onClick={() => onClick(item)}
                className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                    isSelected ? "bg-accent" : "hover:bg-accent/50",
                )}
            >
                <div className="shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center border">
                    <FileTypeIcon
                        name={item.attachment_file_name}
                        fileType={item.attachment_raw_type}
                        size={20}
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <div
                        className={cn(
                            "text-sm truncate",
                            isSelected
                                ? "text-foreground font-medium"
                                : "text-foreground/80",
                        )}
                    >
                        {truncateFileName(item.attachment_file_name)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {formatFileSizeForAttachment(item.attachment_size || 0)}
                    </div>
                </div>
            </div>
        )
    },
)

SidebarItem.displayName = "SidebarItem"

const Sidebar = memo(
    ({
        allMedia,
        currentMediaUuid,
        onSelect,
        isFullscreen,
        toggleFullscreen,
        closeModal,
    }: {
        allMedia: AttachmentMediaReq[]
        currentMediaUuid: string
        onSelect: (item: AttachmentMediaReq) => void
        isFullscreen: boolean
        toggleFullscreen: () => void
        closeModal: () => void
    }) => {
        return (
            <div className="w-80 border-l bg-card flex flex-col shrink-0">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-semibold text-sm text-foreground">
                        Attachments ({allMedia.length})
                    </h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFullscreen}
                            className="h-8 w-8"
                            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-4 w-4" />
                            ) : (
                                <Maximize2 className="h-4 w-4" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={closeModal}
                            className="h-8 w-8"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {allMedia.map((item) => (
                        <SidebarItem
                            key={item.attachment_uuid}
                            item={item}
                            isSelected={item.attachment_uuid === currentMediaUuid}
                            onClick={onSelect}
                        />
                    ))}
                </div>
            </div>
        )
    },
)

Sidebar.displayName = "Sidebar"

export function MediaLightboxDialog({
    media,
    dialogOpenState,
    allMedia,
    mediaGetUrl,
    setOpenState,
}: MediaLightboxProps) {
    const [currentMedia, setCurrentMedia] = useState<AttachmentMediaReq>(media)
    const mediaReq = useMediaFetch<GetMediaURLRes>(
        currentMedia?.attachment_uuid && mediaGetUrl
            ? mediaGetUrl + "/" + currentMedia.attachment_uuid
            : "",
        currentMedia?.initial_url
            ? ({ url: currentMedia.initial_url } as GetMediaURLRes)
            : undefined,
    )

    const currentIndex =
        allMedia?.findIndex((m) => m.attachment_uuid === currentMedia?.attachment_uuid) || 0
    const { isMobile, isDesktop } = useMedia()
    const [isFullscreen, setIsFullscreen] = useState(false)

    useEffect(() => {
        setCurrentMedia(media)
    }, [media?.attachment_uuid])

    useEffect(() => {
        if (isMobile) {
            setIsFullscreen(true)
        }
    }, [isMobile])

    useEffect(() => {
        if (isDesktop) {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (!dialogOpenState) return
                if (e.key === "ArrowLeft") handlePrevious()
                if (e.key === "ArrowRight") handleNext()
                if (e.key === "Escape") closeModal()
            }

            window.addEventListener("keydown", handleKeyDown)
            return () => window.removeEventListener("keydown", handleKeyDown)
        }
    }, [currentIndex])

    // NOTE: hooks must come before any early return. The previous
    // arrangement had `if (!currentMedia) return` above the
    // useCallbacks, which violated the Rules of Hooks (callbacks
    // captured stale references on the first render where currentMedia
    // is null, then ran out of order on the second render). We now
    // declare all callbacks first and gate rendering at the JSX layer.

    const handlePrevious = useCallback(() => {
        if (!allMedia || allMedia.length === 0) return
        const prevIndex = (currentIndex - 1 + allMedia.length) % allMedia.length
        setCurrentMedia(allMedia[prevIndex])
    }, [currentIndex, allMedia])

    const handleNext = useCallback(() => {
        if (!allMedia || allMedia.length === 0) return
        const nextIndex = (currentIndex + 1) % allMedia.length
        setCurrentMedia(allMedia[nextIndex])
    }, [currentIndex, allMedia])

    const handleSelectMedia = useCallback((item: AttachmentMediaReq) => {
        setCurrentMedia(item)
    }, [])

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen((prev) => !prev)
    }, [])

    const closeModal = useCallback(() => {
        setOpenState(false)
    }, [setOpenState])

    const handleDownload = useCallback(() => {
        const url = mediaReq.data?.url || currentMedia?.initial_url
        if (!url) return
        downloadFile(url, currentMedia?.attachment_file_name || "attachment")
    }, [mediaReq.data?.url, currentMedia])

    if (!currentMedia || allMedia?.length == 0) {
        return null
    }

    /**
     * Tailwind class shared by every floating control that sits on top
     * of the dark image canvas. Always-light text on translucent black
     * is intentional regardless of theme — the controls have to read
     * against arbitrary photo content underneath.
     */
    const canvasButtonClass =
        "h-9 w-9 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white backdrop-blur-sm border border-white/10 focus-visible:ring-2 focus-visible:ring-white/60"

    const renderAsPerAttachmentType = (
        attachmentString: AttachmentType,
        fileName: string,
    ) => {
        switch (attachmentString) {
            case "image":
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
                                            "absolute z-[var(--z-sticky)] flex gap-1 p-1 rounded-full",
                                            "bg-black/55 backdrop-blur-sm ring-1 ring-white/15",
                                            "bottom-[calc(theme(spacing.20)+env(safe-area-inset-bottom))]",
                                            "left-1/2 -translate-x-1/2",
                                        )}
                                        role="toolbar"
                                        aria-label="Image zoom controls"
                                    >
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => zoomIn()}
                                            className="h-8 w-8 text-white hover:bg-white/15 rounded-full focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Zoom in"
                                        >
                                            <ZoomIn className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => zoomOut()}
                                            className="h-8 w-8 text-white hover:bg-white/15 rounded-full focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Zoom out"
                                        >
                                            <ZoomOut className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => resetTransform()}
                                            className="h-8 w-8 text-white hover:bg-white/15 rounded-full focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Reset zoom"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                        <div
                                            aria-hidden
                                            className="w-px self-stretch bg-white/15 mx-0.5"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleDownload}
                                            className="h-8 w-8 text-white hover:bg-white/15 rounded-full focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Download"
                                        >
                                            <Download className="h-4 w-4" />
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
                                            key={currentMedia.attachment_uuid}
                                            className="relative w-full h-full flex items-center justify-center"
                                        >
                                            {(mediaReq.isLoading || mediaReq.isValidating) &&
                                                !mediaReq.data?.url &&
                                                !currentMedia.initial_url && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 backdrop-blur-sm">
                                                        <Loader2 className="h-10 w-10 text-white animate-spin" />
                                                    </div>
                                                )}
                                            <Image
                                                src={
                                                    mediaReq.data?.url ||
                                                    currentMedia.initial_url ||
                                                    "/placeholder.svg"
                                                }
                                                alt={fileName}
                                                fill
                                                priority
                                                sizes="100vw"
                                                className={cn(
                                                    "object-contain transition-all duration-200",
                                                    (mediaReq.isLoading || mediaReq.isValidating) &&
                                                        !mediaReq.data?.url &&
                                                        !currentMedia.initial_url
                                                        ? "opacity-0 scale-95"
                                                        : "opacity-100 scale-100",
                                                )}
                                                unoptimized={true}
                                                draggable={false}
                                            />
                                        </div>
                                    </TransformComponent>
                                </>
                            )}
                        </TransformWrapper>
                    </div>
                )

            case "video":
                return (
                    <VideoPlayer
                        key={currentMedia.attachment_uuid}
                        url={mediaReq.data?.url || ""}
                        fileName={fileName}
                    />
                )

            case "audio":
                return (
                    <AudioPlayer key={currentMedia.attachment_uuid} url={mediaReq.data?.url || ""} />
                )

            case "document":
            case "other":
                const extension = fileName.split(".").pop()?.toLowerCase() || ""
                const supportedDocs = [
                    "pdf",
                    "txt",
                    "doc",
                    "docx",
                    "xls",
                    "xlsx",
                    "csv",
                    "json",
                    "xml",
                    "log",
                    "md",
                ]

                if (supportedDocs.includes(extension)) {
                    return (
                        <DocumentViewer
                            key={currentMedia.attachment_uuid}
                            url={mediaReq.data?.url || ""}
                            type={extension}
                        />
                    )
                }

                return (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                        <FileIcon className="md:h-24 md:w-24 h-16 w-16 text-muted-foreground mb-4" />
                        <p className="md:text-lg font-medium truncate max-w-full text-foreground">
                            {currentMedia?.attachment_file_name}
                        </p>
                    </div>
                )
        }
    }

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent
                className={cn(
                    "max-w-[95vw] md:max-w-[85vw] lg:max-w-[80vw] transition-all duration-300 p-0 overflow-hidden bg-background border [&>button]:hidden",
                    isFullscreen && "!max-w-none !w-screen !h-screen !rounded-none",
                )}
            >
                <DialogHeader className="hidden">
                    <DialogTitle></DialogTitle>
                    <DialogDescription></DialogDescription>
                </DialogHeader>

                <div className={cn("flex h-[90vh] w-full", isFullscreen && "h-screen")}>
                    {/*
                      Main content column.
                      The image canvas (flex-1 inner area) keeps a neutral
                      dark backdrop so screenshots / photos with bright
                      backgrounds don't blast white-on-white when opened.
                      Surrounding chrome (top + bottom bars) follows the
                      theme.
                    */}
                    <div className="relative flex flex-col flex-1 h-full min-w-0 bg-background">
                        {/* Title strip */}
                        <div className="flex items-center justify-between gap-2 px-4 h-12 border-b bg-background/95 backdrop-blur shrink-0">
                            <div className="text-sm font-medium text-foreground truncate min-w-0">
                                {currentMedia?.attachment_file_name}
                            </div>

                            {/*
                              On mobile + tablet we don't render the right
                              sidebar, so the close + download + fullscreen
                              cluster has to live up here. Desktop has them
                              in the sidebar header.
                            */}
                            {!isDesktop && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleDownload}
                                        className="h-8 w-8"
                                        aria-label="Download"
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                    {!isMobile && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={toggleFullscreen}
                                            className="h-8 w-8"
                                            aria-label={
                                                isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                                            }
                                        >
                                            {isFullscreen ? (
                                                <Minimize2 className="h-4 w-4" />
                                            ) : (
                                                <Maximize2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={closeModal}
                                        className="h-8 w-8"
                                        aria-label="Close"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Image canvas — neutral dark in both themes. */}
                        <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-zinc-950">
                            {renderAsPerAttachmentType(
                                resolveEffectiveType(currentMedia),
                                currentMedia?.attachment_file_name || "unknown",
                            )}

                            {allMedia.length > 1 && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handlePrevious}
                                        className={cn(
                                            "absolute left-4 top-1/2 -translate-y-1/2 z-10",
                                            canvasButtonClass,
                                        )}
                                        aria-label="Previous"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleNext}
                                        className={cn(
                                            "absolute right-4 top-1/2 -translate-y-1/2 z-10",
                                            canvasButtonClass,
                                        )}
                                        aria-label="Next"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Bottom info / download bar — themed. */}
                        <div className="flex justify-between items-center px-4 py-3 border-t bg-background shrink-0">
                            <div className="text-xs text-muted-foreground">
                                {formatFileSizeForAttachment(currentMedia?.attachment_size || 1)} ·{" "}
                                {formatDateForAttachment(currentMedia?.attachment_created_at || "")}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    downloadFile(
                                        mediaReq.data?.url || "",
                                        currentMedia?.attachment_file_name,
                                    )
                                }
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Download
                            </Button>
                        </div>
                    </div>

                    {/* Desktop sidebar — themed. */}
                    {isDesktop && (
                        <Sidebar
                            allMedia={allMedia}
                            currentMediaUuid={currentMedia.attachment_uuid}
                            onSelect={handleSelectMedia}
                            isFullscreen={isFullscreen}
                            toggleFullscreen={toggleFullscreen}
                            closeModal={closeModal}
                        />
                    )}
                </div>
            </DialogContent>
            {dialogOpenState && (
                <MediaPrefetcher
                    currentIndex={currentIndex}
                    allMedia={allMedia}
                    mediaGetUrl={mediaGetUrl}
                />
            )}
        </Dialog>
    )
}
