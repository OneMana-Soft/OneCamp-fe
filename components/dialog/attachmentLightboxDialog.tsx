"use client"

import { useState, useEffect, memo, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, ChevronLeft, ChevronRight, Download, Info, Link, Loader2 } from "@/lib/icons"
import { AttachmentMediaReq, AttachmentType } from "@/types/attachment"
import { useMediaFetch } from "@/hooks/useFetch"
import { GetMediaURLRes } from "@/types/file"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { formatDateForAttachment } from "@/lib/utils/date/formatDateforAttachment"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { renderAsPerAttachmentType, type StageMedia } from "@/components/attachments/mediaStage"
import { useMedia } from "@/context/MediaQueryContext"
import { cn } from "@/lib/utils/helpers/cn"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { truncateFileName } from "@/lib/utils/format/truncateFileName"
import { downloadFile } from "@/lib/utils/file/downloadFile"
import { isImageByExtension } from "@/lib/utils/file/getAttachmentType"
import { useAttachmentAddOn } from "@/lib/addOns/attachments"
import type { AttachmentSource } from "@/lib/addOns/core"

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
    // Where it was posted, for the add-ons (lib/addOns): srcKey/srcRef name the
    // parent for the server's access check, never the user. srcRef is the id
    // the page already holds (the channel's, the other person's for a DM, the
    // group's or the doc's); the server resolves it.
    source?: AttachmentSource
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
            <button
                type="button"
                onClick={() => onClick(item)}
                aria-current={isSelected || undefined}
                className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                    isSelected ? "bg-white/10" : "hover:bg-white/[0.06]",
                )}
            >
                <FileGlyph name={item.attachment_file_name} fileType={item.attachment_raw_type} size={32} />
                <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-ui-sm", isSelected ? "font-medium text-white" : "text-white/80")}>
                        {truncateFileName(item.attachment_file_name)}
                    </span>
                    <span className="block text-meta text-white/50 tabular-nums">
                        {formatFileSizeForAttachment(item.attachment_size || 0)}
                    </span>
                </span>
            </button>
        )
    },
)

SidebarItem.displayName = "SidebarItem"

/**
 * The info rail (content.md F05): 320 px on the dark panel step, the file's
 * details, the AI's answer when there is one, and the other files in the set.
 */
const Sidebar = memo(
    ({
        allMedia,
        current,
        onSelect,
        note,
    }: {
        allMedia: AttachmentMediaReq[]
        current: AttachmentMediaReq
        onSelect: (item: AttachmentMediaReq) => void
        /** What an add-on found about it (lib/addOns). */
        note: { title: string; text: string } | null
    }) => {
        return (
            <aside className="flex w-80 shrink-0 flex-col bg-[#16171A] pt-14 text-white" data-lightbox-rail="">
                <div className="border-b border-white/10 px-4 pb-4">
                    <h3 className="text-meta font-medium text-white/60">Details</h3>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ui-sm">
                        <dt className="text-white/50">Size</dt>
                        <dd className="tabular-nums">{formatFileSizeForAttachment(current.attachment_size || 0)}</dd>
                        <dt className="text-white/50">Added</dt>
                        <dd>{formatDateForAttachment(current.attachment_created_at || "")}</dd>
                        {current.attachment_width && current.attachment_height ? (
                            <>
                                <dt className="text-white/50">Size in px</dt>
                                <dd className="tabular-nums">{current.attachment_width} × {current.attachment_height}</dd>
                            </>
                        ) : null}
                    </dl>
                </div>
                {note ? (
                    <div className="border-b border-white/10 px-4 py-3">
                        <h3 className="text-meta font-medium text-white/60">{note.title}</h3>
                        <p className="mt-1 whitespace-pre-line text-ui-sm text-white/90">{note.text}</p>
                    </div>
                ) : null}
                <h3 className="px-4 pb-1 pt-3 text-meta font-medium text-white/60">In this set · {allMedia.length}</h3>
                <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
                    {allMedia.map((item) => (
                        <SidebarItem
                            key={item.attachment_uuid}
                            item={item}
                            isSelected={item.attachment_uuid === current.attachment_uuid}
                            onClick={onSelect}
                        />
                    ))}
                </div>
            </aside>
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
    source,
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
    const [infoOpen, setInfoOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        setCurrentMedia(media)
    }, [media?.attachment_uuid])

    useEffect(() => {
        if (isDesktop) {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (!dialogOpenState) return
                if (e.key === "ArrowLeft") handlePrevious()
                if (e.key === "ArrowRight") handleNext()
                // Esc is the dialog's own: Radix closes it (onOpenChange).
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

    const copyLink = useCallback(() => {
        const url = mediaReq.data?.url || currentMedia?.initial_url
        if (!url) return
        void navigator.clipboard?.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }, [mediaReq.data?.url, currentMedia])

    const closeModal = useCallback(() => {
        setOpenState(false)
    }, [setOpenState])

    const handleDownload = useCallback(() => {
        const url = mediaReq.data?.url || currentMedia?.initial_url
        if (!url) return
        downloadFile(url, currentMedia?.attachment_file_name || "attachment")
    }, [mediaReq.data?.url, currentMedia])

    // What an edition adds to the file open here (lib/addOns): bar buttons, and what they found.
    const addOn = useAttachmentAddOn(currentMedia, !!currentMedia && resolveEffectiveType(currentMedia) === "image", source)

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
        "size-10 rounded-[20px] bg-white/[0.08] text-white ring-1 ring-white/[0.12] hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
    /** The top bar's 32 px icon buttons: white at 70 %, full on a faint disc under the pointer. */
    const barButtonClass =
        "size-8 rounded-[16px] text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"

    // The stage's file: its address, signed for a few minutes, the download,
    // and its type for its card when the stage can't draw it.
    const stageMedia: StageMedia = {
        key: currentMedia.attachment_uuid,
        url: mediaReq.data?.url || currentMedia.initial_url || "",
        loading: (mediaReq.isLoading || mediaReq.isValidating) && !mediaReq.data?.url && !currentMedia.initial_url,
        onDownload: handleDownload,
        mime: currentMedia.attachment_raw_type,
    }

    const effectiveType = resolveEffectiveType(currentMedia)

    // The media's own stage (content.md F05): full screen on near-black in
    // both themes, the name and its details in a top bar that fades into the
    // stage, the actions on the right, round prev and next at the sides, and
    // the info rail on demand.
    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            {/* The whole screen, edge to edge. The dialog surface caps itself
                at 85dvh (a long form scrolls inside it): without lifting that
                cap the stage stopped 15% short of the bottom, the page showed
                undimmed beneath it and the zoom bar floated mid-screen. */}
            <DialogContent
                className="!fixed !inset-0 !left-0 !top-0 !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden !rounded-none border-0 bg-[rgb(8_9_10/.92)] max-sm:bg-[rgb(8_9_10)] p-0 !shadow-none [&>button]:hidden"
                data-lightbox=""
                // Edge to edge on a phone too, not a sheet (app/phone.css C5d).
                data-full-screen=""
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{currentMedia?.attachment_file_name}</DialogTitle>
                    <DialogDescription>
                        {formatFileSizeForAttachment(currentMedia?.attachment_size || 0)}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex h-dvh w-full">
                    <div className="relative flex h-full min-w-0 flex-1 flex-col">
                        {/* The top bar, over the stage. */}
                        <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 bg-gradient-to-b from-black/40 to-transparent px-4">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-ui font-medium text-white">{currentMedia?.attachment_file_name}</p>
                                <p className="truncate text-meta text-white/60 tabular-nums">
                                    {formatFileSizeForAttachment(currentMedia?.attachment_size || 0)}
                                    {/* A file with no date (a table's file carries none) shows its size alone. */}
                                    {currentMedia?.attachment_created_at && !isZeroEpoch(currentMedia.attachment_created_at)
                                        ? ` · ${formatDateForAttachment(currentMedia.attachment_created_at)}`
                                        : null}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                <Button variant="ghost" size="icon" onClick={handleDownload} className={barButtonClass} aria-label="Download">
                                    <Download className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={copyLink} className={barButtonClass} aria-label={copied ? "Link copied" : "Copy link"}>
                                    <Link className="size-4" />
                                </Button>
                                {addOn.actions.map(({ key, label, icon: Icon, busy, run }) => (
                                    <Button
                                        key={key}
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            // What it finds shows in the rail.
                                            setInfoOpen(true)
                                            run()
                                        }}
                                        disabled={busy}
                                        className={barButtonClass}
                                        aria-label={label}
                                    >
                                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                                    </Button>
                                ))}
                                {!isMobile ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setInfoOpen((v) => !v)}
                                        className={cn(barButtonClass, infoOpen && "bg-white/10 text-white")}
                                        aria-label="Info"
                                        aria-pressed={infoOpen}
                                    >
                                        <Info className="size-4" />
                                    </Button>
                                ) : null}
                                <Button variant="ghost" size="icon" onClick={closeModal} className={barButtonClass} aria-label="Close">
                                    <X className="size-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="relative flex flex-1 items-center justify-center overflow-hidden pt-14">
                            <div key={currentMedia.attachment_uuid} className="content-view-in flex size-full items-center justify-center">
                                {renderAsPerAttachmentType(effectiveType, currentMedia?.attachment_file_name || "unknown", stageMedia)}
                            </div>

                            {allMedia.length > 1 && (
                                <>
                                    <Button variant="ghost" size="icon" onClick={handlePrevious} className={cn("absolute left-4 top-1/2 z-10 -translate-y-1/2", canvasButtonClass)} aria-label="Previous">
                                        <ChevronLeft className="size-5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={handleNext} className={cn("absolute right-4 top-1/2 z-10 -translate-y-1/2", canvasButtonClass)} aria-label="Next">
                                        <ChevronRight className="size-5" />
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* On a phone (no rail) what an add-on found sits under the stage. */}
                        {addOn.note && (isMobile || !infoOpen) ? (
                            <div className="max-h-40 shrink-0 overflow-y-auto border-t border-white/10 bg-[#16171A] px-4 py-3">
                                <p className="mb-1 text-meta font-medium text-white/60">{addOn.note.title}</p>
                                <p className="whitespace-pre-line text-ui-sm text-white/90">{addOn.note.text}</p>
                            </div>
                        ) : null}
                    </div>

                    {infoOpen && !isMobile ? (
                        <Sidebar allMedia={allMedia} current={currentMedia} onSelect={handleSelectMedia} note={addOn.note} />
                    ) : null}
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
