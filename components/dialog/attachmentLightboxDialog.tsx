"use client"

import { useState, useEffect, memo, useCallback, useMemo } from "react"
import Image from "next/image"
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, ChevronLeft, ChevronRight, Download, FileIcon, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react"
import {AttachmentDocument, AttachmentMediaReq, AttachmentType} from "@/types/attachment";
import {useFetch, useMediaFetch} from "@/hooks/useFetch";
import {GetMediaURLRes} from "@/types/file";
import {formatFileSizeForAttachment} from "@/lib/utils/format/formatFileSizeForAttachment";
import {formatDateForAttachment} from "@/lib/utils/date/formatDateforAttachment";
import VideoPlayer from "@/components/attachments/videoPlayer";
import {AudioPlayer} from "@/components/fileUpload/AudioPlayer";
import DocumentViewer from "@/components/attachments/documentViewer";
import {useMedia} from "@/context/MediaQueryContext";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { cn } from "@/lib/utils/helpers/cn"
import {FileTypeIcon} from "@/components/fileIcon/fileTypeIcon";
import {truncateFileName} from "@/lib/utils/format/truncateFileName";
import {downloadFile} from "@/lib/utils/file/downloadFile";

interface MediaLightboxProps {
    media: AttachmentMediaReq
    setOpenState: (b: boolean) => void
    dialogOpenState: boolean
    allMedia: AttachmentMediaReq[]
    mediaGetUrl: string
}

function MediaPrefetcher({ currentIndex, allMedia, mediaGetUrl }: { currentIndex: number, allMedia: AttachmentMediaReq[], mediaGetUrl: string }) {
    const nextIndex = (currentIndex + 1) % allMedia.length;
    const prevIndex = (currentIndex - 1 + allMedia.length) % allMedia.length;

    const nextMedia = allMedia[nextIndex];
    const prevMedia = allMedia[prevIndex];

    const nextUrl = nextMedia?.attachment_uuid && mediaGetUrl ? mediaGetUrl + '/' + nextMedia.attachment_uuid : '';
    const prevUrl = prevMedia?.attachment_uuid && mediaGetUrl ? mediaGetUrl + '/' + prevMedia.attachment_uuid : '';

    // Fetch the high-res URLs for adjacent items
    const { data: nextData } = useMediaFetch<GetMediaURLRes>(nextUrl);
    const { data: prevData } = useMediaFetch<GetMediaURLRes>(prevUrl);

    // Proactively preload the actual image pixels into browser cache
    // This happens hidden in the background
    useEffect(() => {
        if (nextData?.url && nextMedia.attachment_type === 'image') {
            const img = new (window as any).Image();
            img.src = nextData.url;
        }
        if (prevData?.url && prevMedia.attachment_type === 'image') {
            const img = new (window as any).Image();
            img.src = prevData.url;
        }
    }, [nextData?.url, prevData?.url]);

    return null;
}

const SidebarItem = memo(({ item, isSelected, onClick }: { 
    item: AttachmentMediaReq, 
    isSelected: boolean, 
    onClick: (item: AttachmentMediaReq) => void 
}) => {
    return (
        <div
            onClick={() => onClick(item)}
            className={cn(
                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                isSelected ? "bg-white/10" : "hover:bg-white/5"
            )}
        >
            <div className="shrink-0 w-10 h-10 rounded bg-white/5 flex items-center justify-center border border-white/10">
                <FileTypeIcon name={item.attachment_file_name} fileType={item.attachment_raw_type} size={20} />
            </div>
            <div className="flex-1 min-w-0">
                <div className={cn("text-sm truncate", isSelected ? "text-white font-medium" : "text-white/80")}>
                    {truncateFileName(item.attachment_file_name)}
                </div>
                <div className="text-xs text-white/40">
                    {formatFileSizeForAttachment(item.attachment_size || 0)}
                </div>
            </div>
        </div>
    );
});

SidebarItem.displayName = "SidebarItem";

const Sidebar = memo(({ allMedia, currentMediaUuid, onSelect, isFullscreen, toggleFullscreen, closeModal }: {
    allMedia: AttachmentMediaReq[],
    currentMediaUuid: string,
    onSelect: (item: AttachmentMediaReq) => void,
    isFullscreen: boolean,
    toggleFullscreen: () => void,
    closeModal: () => void
}) => {
    return (
        <div className="w-80 border-l border-white/10 bg-[#09090b] flex flex-col shrink-0">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#09090b]">
                <h3 className="text-white font-medium text-sm">Attachments ({allMedia.length})</h3>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
                    >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={closeModal}
                        className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
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
    );
});

Sidebar.displayName = "Sidebar";

export function MediaLightboxDialog({ media, dialogOpenState, allMedia, mediaGetUrl, setOpenState}: MediaLightboxProps) {
    const [currentMedia, setCurrentMedia] = useState<AttachmentMediaReq>(media)
    const mediaReq = useMediaFetch<GetMediaURLRes>(
        currentMedia?.attachment_uuid && mediaGetUrl? mediaGetUrl +'/'+currentMedia.attachment_uuid : '',
        currentMedia?.initial_url ? { url: currentMedia.initial_url } as GetMediaURLRes : undefined
    )

    const currentIndex = allMedia?.findIndex((m) => m.attachment_uuid === currentMedia?.attachment_uuid) || 0
    const { isMobile, isDesktop } = useMedia();
    const [isFullscreen, setIsFullscreen] = useState(false)


    // Only update currentMedia when the initial media prop changes
    useEffect(() => {
        setCurrentMedia(media)
    }, [media?.attachment_uuid]);

    useEffect(() => {
        if (isMobile) {
            setIsFullscreen(true)
        }
    }, [isMobile])

    // Handle keyboard navigation
    useEffect(() => {

        if(isDesktop) {
            const handleKeyDown = (e: KeyboardEvent) => {
                if(!dialogOpenState) return
                if (e.key === "ArrowLeft") handlePrevious()
                if (e.key === "ArrowRight") handleNext()
                if (e.key === "Escape") closeModal()
            }

            window.addEventListener("keydown", handleKeyDown)
            return () => window.removeEventListener("keydown", handleKeyDown)
        }

    }, [currentIndex])


    if (!currentMedia || allMedia?.length == 0) {
        return
    }


    const handlePrevious = useCallback(() => {
        const prevIndex = (currentIndex - 1 + allMedia.length) % allMedia.length
        setCurrentMedia(allMedia[prevIndex])
    }, [currentIndex, allMedia]);

    const handleNext = useCallback(() => {
        const nextIndex = (currentIndex + 1) % allMedia.length
        setCurrentMedia(allMedia[nextIndex])
    }, [currentIndex, allMedia]);

    const handleSelectMedia = useCallback((item: AttachmentMediaReq) => {
        setCurrentMedia(item);
    }, []);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(prev => !prev)
    }, []);

    const closeModal = useCallback(() => {
        setOpenState(false);
    }, [setOpenState]);

    const renderAsPerAttachmentType = (attachmentString: AttachmentType, fileName: string) => {

        switch (attachmentString) {
            case 'image':
                return (<div className="relative h-full w-full flex items-center justify-center overflow-hidden" style={{ touchAction: 'none' }}>
                     <TransformWrapper
                        initialScale={1}
                        minScale={0.5}
                        maxScale={8}
                        centerOnInit
                        wheel={{ step: 0.2 }}
                    >
                        {({ zoomIn, zoomOut, resetTransform }) => (
                            <>
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/50 p-2 rounded-full backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity duration-200">
                                    <Button variant="ghost" size="icon" onClick={() => zoomIn()} className="h-8 w-8 text-white hover:bg-white/20 rounded-full">
                                        <ZoomIn className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => zoomOut()} className="h-8 w-8 text-white hover:bg-white/20 rounded-full">
                                        <ZoomOut className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => resetTransform()} className="h-8 w-8 text-white hover:bg-white/20 rounded-full">
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                </div>
                                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <div key={currentMedia.attachment_uuid} className="relative w-full h-full flex items-center justify-center">
                                        {(mediaReq.isLoading || mediaReq.isValidating) && !mediaReq.data?.url && !currentMedia.initial_url && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 backdrop-blur-sm">
                                                <Loader2 className="h-10 w-10 text-white animate-spin" />
                                            </div>
                                        )}
                                        <Image
                                            src={mediaReq.data?.url || currentMedia.initial_url || "/placeholder.svg"}
                                            alt={fileName}
                                            fill
                                            priority
                                            sizes="100vw"
                                            className={cn(
                                                "object-contain transition-all duration-200",
                                                ((mediaReq.isLoading || mediaReq.isValidating) && !mediaReq.data?.url && !currentMedia.initial_url) ? "opacity-0 scale-95" : "opacity-100 scale-100"
                                            )}
                                            unoptimized={true}
                                            draggable={false}
                                        />
                                    </div>
                                </TransformComponent>
                            </>
                        )}
                    </TransformWrapper>
                </div>)

            case 'video':
                return (<VideoPlayer key={currentMedia.attachment_uuid} url={mediaReq.data?.url || ''} fileName={fileName}/>)

            case 'audio':
                return (<AudioPlayer key={currentMedia.attachment_uuid} url={mediaReq.data?.url || ''}/>)

            case 'document':
            case 'other':
                const extension = fileName.split('.').pop()?.toLowerCase() || '';
                const supportedDocs = ['pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json', 'xml', 'log', 'md'];
                
                if (supportedDocs.includes(extension)) {
                     return (<DocumentViewer key={currentMedia.attachment_uuid} url={mediaReq.data?.url || ''} type={extension}/>)
                }
                
                return (<div className="flex flex-col items-center justify-center">
                    <FileIcon className="md:h-24 md:w-24 h-16 w-16 text-muted-foreground mb-4"/>
                    <p className="md:text-lg font-medium overflow-ellipsis truncate">{currentMedia?.attachment_file_name}</p>
                </div>)
        }
    }



    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className={cn(
                "max-w-[95vw] md:max-w-[85vw] lg:max-w-[80vw] transition-all duration-300 p-0 overflow-hidden bg-black/95 border-none [&>button]:hidden",
                isFullscreen && "!max-w-none !w-screen !h-screen !rounded-none"
            )}>
                <DialogHeader className="hidden">
                    <DialogTitle ></DialogTitle>
                    <DialogDescription >
                    </DialogDescription>
                </DialogHeader>
                
                <div className={cn("flex h-[90vh] w-full", isFullscreen && "h-screen")}>
                    
                    {/* Main Content Area */}
                    <div className="relative flex flex-col flex-1 h-full min-w-0 bg-black/95">
                        
                        {/* Controls - Title (Top Left) */}
                        <div className="absolute top-0 left-0 z-50 p-4 max-w-[50%] bg-gradient-to-b from-black/80 to-transparent w-full pointer-events-none">
                             <div className="text-white/90 font-medium truncate pointer-events-auto w-fit">
                                {currentMedia?.attachment_file_name}
                             </div>
                        </div>

                        {/* Controls - Buttons (Top Right) - Mobile/Tablet only */}
                        {!isDesktop && (
                            <div className="absolute top-4 right-4 z-[60] flex items-center gap-2">
                                {!isMobile && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={toggleFullscreen}
                                        className="text-white/80 hover:text-white hover:bg-white/10 rounded-full bg-black/20 backdrop-blur-sm"
                                    >
                                        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={closeModal}
                                    className="text-white/80 hover:text-white hover:bg-white/10 rounded-full bg-black/20 backdrop-blur-sm"
                                >
                                    <X className="h-6 w-6" />
                                </Button>
                            </div>
                        )}

                        {/* Media Render */}
                        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                            {renderAsPerAttachmentType(currentMedia?.attachment_type || 'other', currentMedia?.attachment_file_name || 'unknown')}

                            {allMedia.length > 1 && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handlePrevious}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 z-10 h-10 w-10"
                                    >
                                        <ChevronLeft className="h-6 w-6" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleNext}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 z-10 h-10 w-10"
                                    >
                                        <ChevronRight className="h-6 w-6" />
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Bottom Info Bar */}
                        <div className={cn("p-4 border-t border-white/10 bg-black/90 text-white backdrop-blur-sm")}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-sm text-white/60">
                                        {formatFileSizeForAttachment(currentMedia?.attachment_size||1)} • {formatDateForAttachment(currentMedia?.attachment_created_at||'')}
                                    </div>
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => downloadFile(mediaReq.data?.url || '', currentMedia?.attachment_file_name)}
                                    className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white flex items-center gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    <span>Download</span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar (Desktop Only) */}
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
