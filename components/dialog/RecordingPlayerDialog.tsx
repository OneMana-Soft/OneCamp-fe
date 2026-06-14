"use client";

import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {closeUI} from "@/store/slice/uiSlice";
import {useEffect, useState, useRef, useMemo} from "react";
import {useFetch} from "@/hooks/useFetch";
import { LoaderCircle, X, Download, Maximize2, Minimize2 } from "@/lib/icons";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {VirtualInfiniteScroll} from "@/components/list/virtualInfiniteScroll";
import {TranscriptInfoInterface} from "@/types/recording";
import {useMedia} from "@/context/MediaQueryContext";
import {cn} from "@/lib/utils/helpers/cn";
import {Button} from "@/components/ui/button";
import {formatFileSizeForAttachment} from "@/lib/utils/format/formatFileSizeForAttachment";
import {formatDateForAttachment} from "@/lib/utils/date/formatDateforAttachment";
import {formatDuration} from "@/lib/utils/format/formatDuration";
import {downloadFile} from "@/lib/utils/file/downloadFile";

// ... existing imports

export const RecordingPlayerDialog = () => {
    const dispatch = useDispatch();
    const {isOpen, data} = useSelector((state: RootState) => state.ui.recordingPlayer);
    const [mediaUrl, setMediaUrl] = useState<string>("");
    const { isMobile } = useMedia();
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Video Controls
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);

    /* ... useEffects ... */

    useEffect(() => {
        if (isMobile) {
            setIsFullscreen(true);
        }
    }, [isMobile]);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    }
    
    // We fetch the presigned URL for the media
    const mediaUrlInfo = useFetch<{url?: string; data?: {url: string} | string}>(data.mediaGetUrl + "/" + data.egressId);

    // Transcript State
    const [transcriptList, setTranscriptList] = useState<TranscriptInfoInterface[]>([]);
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 20;

    // Fetch transcript for current page
    const transcriptInfo = useFetch<{data: {recording_transcript: any[]; transcript_count: number; recording_stared_at?: string}, pageCount: number}>(
        data.transcriptGetUrl ? `${data.transcriptGetUrl}/${data.egressId}?pageIndex=${pageIndex}&pageSize=${pageSize}` : ""
    );

    useEffect(() => {
        if (isOpen && mediaUrlInfo.data) {
           if (mediaUrlInfo.data.url) {
               setMediaUrl(mediaUrlInfo.data.url);
           } else if (mediaUrlInfo.data.data) {
               if (typeof mediaUrlInfo.data.data === 'object' && 'url' in mediaUrlInfo.data.data) {
                   setMediaUrl((mediaUrlInfo.data.data as any).url);
               } else if (typeof mediaUrlInfo.data.data === 'string') {
                    setMediaUrl(mediaUrlInfo.data.data);
               }
           }
        }
    }, [mediaUrlInfo.data, isOpen]);

    // Reset state when dialog opens/closes or egressId changes
    useEffect(() => {
        if (isOpen) {
            setTranscriptList([]);
            setPageIndex(0);
        }
    }, [isOpen, data.egressId]);
    
    // Let's implement a ref to track processed page index.
    const lastProcessedPage = useRef(-1);
    
    useEffect(() => {
        if (transcriptInfo.data?.data?.recording_transcript && !transcriptInfo.isLoading) {
             const newItems = transcriptInfo.data.data.recording_transcript;
             if (pageIndex === 0) {
                 setTranscriptList(newItems);
                 lastProcessedPage.current = 0;
             } else if (pageIndex > lastProcessedPage.current) {
                 setTranscriptList(prev => [...prev, ...newItems]);
                 lastProcessedPage.current = pageIndex;
             }
        }
    }, [transcriptInfo.data, transcriptInfo.isLoading, pageIndex]);

    // Calculate recording start time once
    // Prefer the timestamp from the fresh transcript fetch (which reflects precise backend update)
    // Fallback to the prop data (which might be stale creation time)
    const recordingStartMs = useMemo(() => {
        const freshStart = transcriptInfo?.data?.data?.recording_stared_at; // Accessing inside data.data
        if (freshStart && freshStart !== "0001-01-01T00:00:00Z") {
            return new Date(freshStart).getTime();
        }
        return data?.recordedAt ? new Date(data.recordedAt).getTime() : 0;
    }, [data, transcriptInfo]);

    const handleSeek = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = seconds;
            videoRef.current.play();
        }
    };

    const handleClose = () => {
        dispatch(closeUI('recordingPlayer'));
    };

    const handleLoadMore = () => {
        // Only load more if not loading and has more pages
        if (!transcriptInfo.isLoading) {
             // Check if we have more pages
             // pageCount is returned by backend
             const totalPages = transcriptInfo.data?.pageCount || 1;
             if (pageIndex < totalPages - 1) {
                 setPageIndex(prev => prev + 1);
             }
        }
    };

    const renderTranscriptItem = (item: TranscriptInfoInterface, index: number) => {
      // Resolve the utterance's position in the recorded video, in seconds.
      //
      // Preferred path (skew-free): the producer (browser in frontend mode,
      // agent in backend mode) recorded transcript_offset_ms — the utterance
      // start measured from recording start IN ITS OWN CLOCK. Using it directly
      // avoids subtracting two unsynchronized clocks (the speaker's browser /
      // agent vs. the LiveKit egress server), which is what made earlier
      // recordings seek several seconds off.
      //
      // Legacy fallback: older rows have no offset, so we reconstruct it from
      // (absolute transcript timestamp − recording start). This keeps existing
      // recordings working, just without the skew correction.
      let startTimeSeconds: number
      if (typeof item.transcript_offset_ms === "number" && item.transcript_offset_ms >= 0) {
        startTimeSeconds = item.transcript_offset_ms / 1000
      } else {
        // Normalize legacy timestamp to milliseconds (10-digit = seconds).
        let transcriptTsMs = item.transcript_timestamp
        if (transcriptTsMs < 10000000000) {
          transcriptTsMs = transcriptTsMs * 1000
        }
        startTimeSeconds = (transcriptTsMs - recordingStartMs) / 1000
      }
      // Guard against negative offsets (clock jitter / pre-roll over-shift).
      if (!isFinite(startTimeSeconds) || startTimeSeconds < 0) {
        startTimeSeconds = 0
      }

      // Estimate Duration for Highlighting (Heuristic: 0.4s per word)
      const wordCount = item.transcript_text ? item.transcript_text.trim().split(/\s+/).length : 1;
      const durationSeconds = Math.max(1, wordCount * 0.4);
      const endTimeSeconds = startTimeSeconds + durationSeconds;
      
      // Active Highlight Logic
      const isActive = currentTime >= startTimeSeconds && currentTime < endTimeSeconds;

      const handleJump = () => {
         if(videoRef.current) {
             videoRef.current.currentTime = Math.max(0, startTimeSeconds);
             if(videoRef.current.paused) {
                 videoRef.current.play();
             }
         }
      };
        return (
            <div 
                key={index} 
                className={cn(
                    "flex flex-col gap-1 p-2 rounded-md transition-colors cursor-pointer border border-transparent",
                    isActive ? "bg-primary/10 border-primary/20" : "hover:bg-muted/50"
                )}
                onClick={handleJump}
            >
                 <div className="flex justify-between items-center">
                     <span className={cn("font-semibold text-xs", isActive ? "text-primary" : "text-muted-foreground")}>
                        {item.transcript_from?.user_name || "Unknown"}
                     </span>
                     <span className="text-[10px] text-muted-foreground font-mono">
                        {formatDuration(startTimeSeconds)}
                     </span>
                 </div>
                 <p className={cn("text-sm", isActive ? "text-foreground font-medium" : "text-foreground/90")}>
                    {item.transcript_text}
                 </p>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            {/* ... Dialog Content ... */}
             <DialogContent className={cn(
                "max-w-[70vw] h-[85vh] p-0 flex flex-col overflow-hidden bg-background border [&>button]:hidden", 
                isFullscreen && "!max-w-none !w-screen !h-screen !rounded-none border-none"
            )}>
                {/* ... Header ... */}
                 <div className="flex justify-between items-center p-3 border-b bg-muted/20">
                    <div className="flex flex-col">
                        <DialogTitle className="text-base font-semibold truncate max-w-[200px] md:max-w-md">
                           {data.fileName || "Recording"}
                        </DialogTitle>
                         <span className="text-xs text-muted-foreground">
                            {formatFileSizeForAttachment(data.fileSize || 0)} • {formatDateForAttachment(data.recordedAt || "")}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {mediaUrl && (
                             <Button variant="outline" size="sm" onClick={() => downloadFile(mediaUrl, data.fileName)} className="hidden md:flex gap-2 h-8">
                                <Download className="h-3.5 w-3.5" />
                                <span className="text-xs">Download</span>
                            </Button>
                        )}

                        {!isMobile && (
                            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="h-8 w-8">
                                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                 </div>

                {/* Main Content: Video + Transcript */}
                <div className={cn("flex flex-1 overflow-hidden flex-col md:flex-row")}>
                    
                    {/* Video Area */}
                    <div className={cn("flex-1 bg-black flex justify-center items-center relative min-h-[30vh]", isFullscreen ? "h-full" : "")}>
                        {mediaUrl ? (
                            <div className="w-full h-full flex justify-center items-center">
                                { }
                                <video 
                                    ref={videoRef}
                                    src={mediaUrl} 
                                    controls 
                                    autoPlay 
                                    playsInline
                                    className="max-h-full max-w-full"
                                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                />
                            </div>
                        ) : (
                            <div className="flex gap-2 items-center text-white/70">
                                <LoaderCircle className="animate-spin h-5 w-5"/> 
                                <span className="text-sm">Loading Video...</span>
                            </div>
                        )}
                    </div>

                    {/* Transcript Area */}
                    <div className={cn(
                        "flex flex-col border-l border-border bg-background transition-all duration-300",
                        isFullscreen && !isMobile ? "w-[350px]" : "w-full md:w-[350px] h-[40vh] md:h-full"
                    )}>
                        <div className="p-3 border-b font-medium text-sm bg-muted/10 flex justify-between items-center">
                            <span>Transcript</span>
                            {/* Mobile download button since header one is hidden */}
                             {mediaUrl && isMobile && (
                                <Button variant="ghost" size="sm" onClick={() => downloadFile(mediaUrl, data.fileName)} className="h-7 w-7 p-0">
                                    <Download className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <div className="flex-1 overflow-hidden p-2 relative"> 
                             {transcriptList.length === 0 && transcriptInfo.isLoading ? (
                                <div className="absolute inset-0 flex justify-center items-center text-muted-foreground text-sm">
                                    <LoaderCircle className="animate-spin h-4 w-4 mr-2" /> Loading transcript...
                                </div>
                             ) : transcriptList.length === 0 ? (
                                <div className="absolute inset-0 flex justify-center items-center text-muted-foreground text-sm">
                                    No transcript available
                                </div>
                             ) : (
                                <VirtualInfiniteScroll
                                    items={transcriptList}
                                    renderItem={renderTranscriptItem}
                                    onLoadMore={handleLoadMore}
                                    isLoading={transcriptInfo.isLoading}
                                    hasMore={(transcriptInfo.data?.pageCount || 0) > pageIndex + 1}
                                    className="h-full"
                                />
                             )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
