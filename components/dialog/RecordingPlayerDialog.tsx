"use client";

import { displayNameOf } from "@/lib/personName"
import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {closeUI} from "@/store/slice/uiSlice";
import {useEffect, useState, useRef, useMemo, type ReactNode} from "react";
import {useFetch} from "@/hooks/useFetch";
import { AlertTriangle, Captions, Disc, LoaderCircle, X, Download, Maximize2, Minimize2 } from "@/lib/icons";
import {VirtualInfiniteScroll} from "@/components/list/virtualInfiniteScroll";
import {TranscriptInfoInterface} from "@/types/recording";
import {useMedia} from "@/context/MediaQueryContext";
import {cn} from "@/lib/utils/helpers/cn";
import {Button} from "@/components/ui/button";
import {formatFileSizeForAttachment} from "@/lib/utils/format/formatFileSizeForAttachment";
import {formatDateForAttachment} from "@/lib/utils/date/formatDateforAttachment";
import {formatDuration} from "@/lib/utils/format/formatDuration";
import {downloadFile} from "@/lib/utils/file/downloadFile";
import {useRecordingPlayback, type RecordingMedia} from "@/components/dialog/useRecordingPlayback";

export const RecordingPlayerDialog = () => {
    const dispatch = useDispatch();
    const {isOpen, data} = useSelector((state: RootState) => state.ui.recordingPlayer);
    const { isMobile } = useMedia();
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // The recording's link, fresh whenever it runs out (CALL-BUG-10), and
    // its state when there is nothing to play (CALL-BUG-16).
    const playback = useRecordingPlayback(data.mediaGetUrl && data.egressId ? `${data.mediaGetUrl}/${data.egressId}` : "", isOpen);
    const media = playback.media;
    const mediaUrl = media?.status === "ready" ? media.url ?? "" : "";
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

    const transcriptOnly = media?.status === "transcript_only";
    // The download takes a fresh link when this one has run out.
    const download = async () => {
        const url = await playback.freshUrl();
        if (url) downloadFile(url, data.fileName);
    };
    
    // Transcript State
    const [transcriptList, setTranscriptList] = useState<TranscriptInfoInterface[]>([]);
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 20;

    // Fetch transcript for current page
    const transcriptInfo = useFetch<{data: {recording_transcript: any[]; transcript_count: number; recording_stared_at?: string}, pageCount: number}>(
        data.transcriptGetUrl ? `${data.transcriptGetUrl}/${data.egressId}?pageIndex=${pageIndex}&pageSize=${pageSize}` : ""
    );

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

      // A fresh link first when this one has run out: a click on a line
      // after five minutes used to fail.
      const handleJump = () => {
         if (mediaUrl) void playback.seekTo(startTimeSeconds);
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
                        {displayNameOf(item.transcript_from) || "Unknown"}
                     </span>
                     <span className="text-2xs text-muted-foreground font-mono">
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
                isFullscreen && "!max-w-none !w-screen !h-dvh !rounded-none border-none"
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
                             <Button variant="outline" size="sm" onClick={() => void download()} className="hidden md:flex gap-2 h-8">
                                <Download className="h-3.5 w-3.5" />
                                <span className="text-xs">Download</span>
                            </Button>
                        )}

                        {!isMobile && (
                            <Button aria-label={isFullscreen ? "Exit full screen" : "Full screen"} variant="ghost" size="icon" onClick={toggleFullscreen} className="h-8 w-8">
                                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                        )}
                        <Button aria-label="Close" variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                 </div>

                {/* Main Content: Video + Transcript */}
                <div className={cn("flex flex-1 overflow-hidden flex-col md:flex-row")}>
                    
                    {/* Video Area: none for a call that was transcribed, not recorded. */}
                    {!transcriptOnly && (
                    <div className={cn("flex-1 bg-black flex justify-center items-center relative min-h-[30vh]", isFullscreen ? "h-full" : "")}>
                        {mediaUrl && !playback.playbackFailed ? (
                            <div className="w-full h-full flex justify-center items-center">
                                <video 
                                    {...playback.videoProps}
                                    controls 
                                    playsInline
                                    className="max-h-full max-w-full"
                                    onTimeUpdate={(e) => {
                                        playback.videoProps.onTimeUpdate(e);
                                        setCurrentTime(e.currentTarget.currentTime);
                                    }}
                                />
                            </div>
                        ) : (
                            <RecordingStageMessage media={media} loadError={playback.loadError} playbackFailed={playback.playbackFailed} onRetry={media ? playback.retry : () => void playback.reload()} />
                        )}
                    </div>
                    )}

                    {/* Transcript Area */}
                    <div className={cn(
                        // Its size snaps when full screen changes: a transitioned
                        // width and height laid the dialog out on every frame.
                        "flex flex-col bg-background transition-colors",
                        transcriptOnly
                            ? "w-full flex-1"
                            : cn("border-l border-border", isFullscreen && !isMobile ? "w-[350px]" : "w-full md:w-[350px] h-[40vh] md:h-full")
                    )}>
                        <div className="p-3 border-b font-medium text-sm bg-muted/10 flex justify-between items-center">
                            <span className="flex items-center gap-2">
                                {transcriptOnly ? <Captions className="size-4 text-ink-3" aria-hidden /> : null}
                                {transcriptOnly ? "Transcript · this call wasn't recorded" : "Transcript"}
                            </span>
                            {/* Mobile download button since header one is hidden */}
                             {mediaUrl && isMobile && (
                                <Button aria-label="Download recording" variant="ghost" size="sm" onClick={() => void download()} className="h-7 w-7 p-0">
                                    <Download className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <div className="flex-1 overflow-hidden p-2 relative"> 
                             {transcriptList.length === 0 && transcriptInfo.isLoading ? (
                                <div className="absolute inset-0 flex justify-center items-center text-muted-foreground text-sm">
                                    <LoaderCircle className="animate-spin h-4 w-4 mr-2" /> Loading transcript…
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

/**
 * What the stage says when there is no picture (CALL-BUG-16): still loading,
 * a recording that failed or was aborted (it used to open as a black frame
 * with controls), one still being recorded, or a link that wouldn't play.
 */
export function RecordingStageMessage({
    media,
    loadError,
    playbackFailed,
    onRetry,
}: {
    media: RecordingMedia | null
    loadError: boolean
    playbackFailed: boolean
    onRetry: () => void
}) {
    const box = (icon: ReactNode, title: string, detail: string, retry = false) => (
        <div role="status" className="flex max-w-sm flex-col items-center gap-2 px-6 text-center text-white" data-recording-state={media?.status ?? (loadError ? "error" : "loading")}>
            {icon}
            <p className="text-ui font-medium">{title}</p>
            <p className="text-ui-sm text-white/70 text-pretty">{detail}</p>
            {retry ? (
                <Button size="sm" variant="secondary" className="mt-1" onClick={onRetry}>
                    Try again
                </Button>
            ) : null}
        </div>
    )
    if (media?.status === "failed") {
        return box(<AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />, "This recording couldn't be saved", "Something went wrong while the call was being recorded, so there's nothing to play. You can delete it from the recordings list.")
    }
    if (media?.status === "recording") {
        return box(<Disc className="size-6 text-[#F2555A]" aria-hidden />, "Still recording", "This call is still being recorded. It can be played once the recording stops.")
    }
    if (playbackFailed) {
        return box(<AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />, "This recording can't be played", "The link to it didn't work, even after a fresh one.", true)
    }
    if (loadError) {
        return box(<AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />, "Couldn't load the recording", "Check your connection and try again.", true)
    }
    return (
        <div role="status" className="flex gap-2 items-center text-white/70">
            <LoaderCircle className="animate-spin h-5 w-5" aria-hidden />
            <span className="text-sm">Loading the recording…</span>
        </div>
    )
}
