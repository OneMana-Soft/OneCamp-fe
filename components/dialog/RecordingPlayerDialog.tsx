"use client";

import { displayNameOf } from "@/lib/personName"
import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {closeUI} from "@/store/slice/uiSlice";
import {useEffect, useRef, useState, useMemo, type ReactNode} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import type {UserProfileInterface} from "@/types/user";
import {CorrectedMark, LineCorrection, TranscriptExport} from "@/components/dialog/transcriptTools";
import {downloadRefusal, mayCorrectLine, stageNoun} from "@/lib/calls/transcriptCorrect";
import {playerTitle, recordingFileName} from "@/lib/calls/recordingFileName";
import { AlertTriangle, Captions, Disc, LoaderCircle, X, Download, Maximize2, Minimize2, Pencil, VideoOff } from "@/lib/icons";
import {VirtualInfiniteScroll} from "@/components/list/virtualInfiniteScroll";
import type {TranscriptLine} from "@/types/transcriptLine";
import {useMedia} from "@/context/MediaQueryContext";
import {useSheetMode} from "@/components/ui/overlayMode";
import {cn} from "@/lib/utils/helpers/cn";
import {Button} from "@/components/ui/button";
import {MiddleName} from "@/components/ui/middleName";
import {fileSize} from "@/lib/utils/format/formatFileSizeForAttachment";
import {formatDateForAttachment} from "@/lib/utils/date/formatDateforAttachment";
import {formatDuration} from "@/lib/utils/format/formatDuration";
import {downloadFile} from "@/lib/utils/file/downloadFile";
import {useRecordingPlayback, type RecordingMedia} from "@/components/dialog/useRecordingPlayback";
import {nothingToPlay, transcriptLayout, type RecordingHome} from "@/components/recording/recordingState";
import {stageFit} from "@/components/dialog/recordingStage";
import {ErrorState} from "@/components/ui/error-state";
import {EmptyState} from "@/components/ui/empty-state";
import {SpotError} from "@/components/ui/graphics/spots";
import {SaysLoadFailure, failureWords, loadFailure, type LoadFailure} from "@/lib/http/loadFailure";
import {hasPageAfter} from "@/lib/http/pageCount";
import {lineAt, lineStartSeconds} from "@/lib/calls/transcriptLine";
import {toast} from "@/hooks/use-toast";
import {tabStop} from "@/lib/keys/tabOrder";

export const RecordingPlayerDialog = () => {
    const dispatch = useDispatch();
    const {isOpen, data} = useSelector((state: RootState) => state.ui.recordingPlayer);
    const { isMobile } = useMedia();
    // A line's editor: in place, or a drawer where every sheet is one (components/ui/overlayMode, zoom-05).
    const sheet = useSheetMode();
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // The recording's link, fresh whenever it runs out (CALL-BUG-10), and
    // its state when there is nothing to play (CALL-BUG-16). mediaPath is the
    // play path itself, for a recording read by its owner's own route (an
    // event's "Recordings & notes", meet-02); else media URL + egress id.
    // A call's moment (a search hit's, zoom-13) is where the media starts, in seconds.
    const startAt = typeof data.startAtMs === "number" ? data.startAtMs / 1000 : undefined;
    const playback = useRecordingPlayback(data.mediaPath || (data.mediaGetUrl && data.egressId ? `${data.mediaGetUrl}/${data.egressId}` : ""), isOpen, startAt);
    const media = playback.media;
    const mediaUrl = media?.status === "ready" ? media.url ?? "" : "";
    const [currentTime, setCurrentTime] = useState(0);
    // The picture's shape, as its recording says it once its first bytes are
    // read: 16:9, a call's room's, until then, and for each recording anew.
    const recording = data.mediaPath || data.egressId || "";
    const [shape, setShape] = useState<{ recording: string; ratio: string } | null>(null);
    const ratio = shape !== null && shape.recording === recording ? shape.ratio : "16 / 9";

    /* ... useEffects ... */

    useEffect(() => {
        if (isMobile) {
            setIsFullscreen(true);
        }
    }, [isMobile]);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    }

    // The media route's answer; before it, or with no picture asked for (a call nobody recorded), the row's.
    const transcriptOnly = (media?.status ?? data.status) === "transcript_only";
    // The download takes a fresh link when this one has run out.
    const download = async () => {
        // A refusal reads as the stage reads it: no access or gone says so, with no try again (V-1102).
        const { url, failure } = await playback.freshUrl();
        if (url) downloadFile(url, fileName);
        else toast({ ...downloadRefusal(failure || "failed"), variant: "destructive" });
    };
    
    // Transcript State
    const [transcriptList, setTranscriptList] = useState<TranscriptLine[]>([]);
    const [pageIndex, setPageIndex] = useState(0);
    // The page whose lines are in the list (-1, none yet), and whether the list's end asked for more.
    const [listedPage, setListedPage] = useState(-1);
    const [moreWanted, setMoreWanted] = useState(false);
    const pageSize = 20;

    // Where the words are read, a page at a time: an event's call by its own
    // transcript path (head C2, meet-02), else its transcript route by egress id.
    const transcriptSource: string = data.transcriptPath || (data.transcriptGetUrl ? `${data.transcriptGetUrl}/${data.egressId}` : "");
    // Who may correct a line (zoom-05, lib/calls/transcriptCorrect): the viewer's own lines, and every line where
    // the place already gives the recording's Delete; never an event's call, whose words are the calendar's.
    const eventCall = data.home === "event" || !!data.transcriptPath;
    // The line being corrected, by its uid, and the lines corrected here, as the server answered them.
    const [editing, setEditing] = useState<string | null>(null);
    const [corrected, setCorrected] = useState<Record<string, TranscriptLine>>({});
    const saved = (line: TranscriptLine) => {
        if (line.uid) setCorrected((was) => ({ ...was, [line.uid as string]: line }));
        setEditing(null);
    };

    // Fetch transcript for current page
    const transcriptInfo = useFetch<{data: {recording_transcript: any[]; transcript_count: number; recording_stared_at?: string}, pageCount: number}>(
        transcriptSource ? `${transcriptSource}?pageIndex=${pageIndex}&pageSize=${pageSize}` : ""
    );

    // Reset state when dialog opens/closes or its words' source changes
    useEffect(() => {
        if (isOpen) {
            setTranscriptList([]);
            setPageIndex(0);
            setListedPage(-1);
            setMoreWanted(false);
            setEditing(null);
            setCorrected({});
        }
    }, [isOpen, transcriptSource]);
    
    // Each page's lines join the list once.
    useEffect(() => {
        if (transcriptInfo.data?.data?.recording_transcript && !transcriptInfo.isLoading) {
             const newItems = transcriptInfo.data.data.recording_transcript;
             if (pageIndex === 0) {
                 setTranscriptList(newItems);
                 setListedPage(0);
             } else if (pageIndex > listedPage) {
                 setTranscriptList(prev => [...prev, ...newItems]);
                 setListedPage(pageIndex);
             }
        }
    }, [transcriptInfo.data, transcriptInfo.isLoading, pageIndex, listedPage]);

    // Calculate recording start time once
    // Prefer the timestamp from the fresh transcript fetch (which reflects precise backend update)
    // Fallback to the prop data (which might be stale creation time)
    const freshStart = transcriptInfo?.data?.data?.recording_stared_at;
    const startedAt = freshStart && freshStart !== "0001-01-01T00:00:00Z" ? freshStart : data?.recordedAt || "";
    const recordingStartMs = useMemo(() => (startedAt ? new Date(startedAt).getTime() : 0), [startedAt]);
    // Its name and day before its row is known (a link opened it) come from that start too.
    const fileName = data.fileName || recordingFileName(startedAt);
    const title = playerTitle({ fileName: data.fileName, startedAt, transcriptOnly });

    const handleClose = () => {
        dispatch(closeUI('recordingPlayer'));
    };
    // What had the focus as the player opened. A player a link opened (a search hit's moment, zoom-13) had none,
    // or one that has left the page, so closing it gives the focus to its recording's row when the page lists it
    // (CR-330 F3); one a row opened goes back the dialog's own way (useReturnFocus).
    const opener = useRef<Element | null>(null);
    const noteOpener = () => { opener.current = document.activeElement; };
    const focusRowIfNoOpener = (event: Event) => {
        const from = opener.current;
        opener.current = null;
        if (from && from !== document.body && from.isConnected) return;
        const row: Element | null = data.egressId ? document.querySelector(`[data-recording-id="${CSS.escape(data.egressId)}"]`) : null;
        if (!row) return;
        // Where a Tab into the row would land: a mouse's screen hides the row's touch-only Actions (app/hub.css).
        const to = tabStop(row);
        if (!to || !row.contains(to)) return;
        event.preventDefault();
        to.focus({ preventScroll: true });
    };

    // The list's end asks; the one reader below reads the page (CR-330 N6).
    const handleLoadMore = () => setMoreWanted(true);

    const renderTranscriptItem = (given: TranscriptLine, index: number) => {
      // A line corrected here shows the server's answer for it.
      const item = (given.uid && corrected[given.uid]) || given
      const mayCorrect = !!item.uid && mayCorrectLine({ speaker: item.transcript_from?.user_uuid, me, mayDelete: !!data.mayDelete, eventCall })
      // Where the line starts in its recording (lib/calls/transcriptLine: the offset the producer kept, else its time).
      const startTimeSeconds = lineStartSeconds(item, recordingStartMs)

      const wordCount = item.transcript_text ? item.transcript_text.trim().split(/\s+/).length : 1;
      const durationSeconds = Math.max(1, wordCount * 0.4);
      const endTimeSeconds = startTimeSeconds + durationSeconds;
      
      // Active Highlight Logic
      // Playing, the line being said; with no picture, the line at the moment the player was opened at.
      const isActive = mediaUrl ? currentTime >= startTimeSeconds && currentTime < endTimeSeconds : index === momentIndex;

      // A fresh link first when this one has run out: a click on a line
      // after five minutes used to fail.
      const handleJump = () => {
         if (mediaUrl) void playback.seekTo(startTimeSeconds);
      };
        return (
            <div 
                key={index} 
                className={cn(
                    // An inset ring, not a border: a border's pixel set the words off the heading's line.
                    "group/line flex flex-col gap-1 p-2 rounded-md transition-colors cursor-pointer",
                    isActive ? "bg-primary/10 ring-1 ring-inset ring-primary/20" : "hover:bg-muted/50"
                )}
                onClick={handleJump}
                aria-current={isActive ? "true" : undefined}
            >
                 <div className="flex justify-between items-center">
                     <span className={cn("font-semibold text-xs", isActive ? "text-primary" : "text-muted-foreground")}>
                        {displayNameOf(item.transcript_from) || "Unknown"}
                     </span>
                     <span className="flex items-center gap-1">
                        {mayCorrect ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Correct this line"
                                title="Correct this line"
                                // A mouse finds it on the line's hover; a finger (a phone, or any screen without hover) always sees it, 44 px.
                                className="size-6 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/line:opacity-100 max-md:size-11 max-md:opacity-100 [@media(hover:none)]:size-11 [@media(hover:none)]:opacity-100"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setEditing(item.uid ?? null);
                                }}
                            >
                                <Pencil className="size-3.5" aria-hidden />
                            </Button>
                        ) : null}
                        <span className="text-2xs text-muted-foreground font-mono">
                           {formatDuration(startTimeSeconds)}
                        </span>
                     </span>
                 </div>
                 {editing !== null && editing === item.uid && !sheet ? (
                    <LineCorrection egressId={data.egressId} line={item} speaker={displayNameOf(item.transcript_from) || "Unknown"} at={formatDuration(startTimeSeconds)} onSaved={saved} onClose={() => setEditing(null)} />
                 ) : (
                    <p className={cn("text-sm", isActive ? "text-foreground font-medium" : "text-foreground/90")}>
                       {item.transcript_text}
                    </p>
                 )}
                 <CorrectedMark line={item} />
            </div>
        );
    };

    // Nothing to play and nothing to read: the stage says why on its own (DB-28
    // on V-32). Until the player's own answer comes, the row's status decides,
    // so the sheet doesn't open with a panel only to drop it. The first page's
    // lines show as soon as they answer, before the list takes them in.
    const shownLines: TranscriptLine[] = transcriptList.length ? transcriptList : (transcriptInfo.data?.data?.recording_transcript ?? []);
    const transcriptFailed = !!transcriptInfo.isError && shownLines.length === 0;
    // Who is looking, read only where a line could offer its correction (the app's own cached profile).
    const me = useFetchOnlyOnce<UserProfileInterface>(isOpen && !eventCall && shownLines.length > 0 ? GetEndpointUrl.SelfProfile : "").data?.data?.user_uuid;
    // A call this person can't see (403) or that is gone (404): no Try again can fix it (CR-330 F2).
    const refusal = transcriptFailed ? loadFailure(transcriptInfo.isError) : "failed";
    const refused = refusal === "failed" ? null : refusal;
    // The line at or before the moment the player was opened at (zoom-13), -1 with none.
    const momentIndex = useMemo(
        () => (startAt === undefined ? -1 : lineAt(shownLines.map((l) => lineStartSeconds(l, recordingStartMs)), startAt)),
        [startAt, shownLines, recordingStartMs],
    );
    // A moment past the lines read so far reads on until it is reached, judged once the page it's on is listed
    // (the render before, the list is a page behind and the chase read one page too many).
    const listed = listedPage === pageIndex;
    const pageAfter = hasPageAfter(pageIndex, transcriptInfo.data?.pageCount);
    const momentPending = listed && momentIndex >= 0 && momentIndex === shownLines.length - 1 && pageAfter;
    // The one place the next page is read, for the moment's chase or the list's end: one page at a time, only once
    // the page it's on is listed, and none past the last. Both asking in the same tick read one page, not two.
    useEffect(() => {
        if (!(momentPending || moreWanted) || !listed || transcriptInfo.isLoading || !pageAfter) return;
        setMoreWanted(false);
        setPageIndex(pageIndex + 1);
    }, [momentPending, moreWanted, listed, transcriptInfo.isLoading, pageAfter, pageIndex]);
    const answered = !transcriptSource || transcriptInfo.data !== undefined || transcriptFailed;
    // A shared moment link opened by someone it isn't shared with: both reads follow the same membership rule, so
    // both refuse. The stage alone says it, once, with no panel beside it; while the words' read is still out the
    // sheet lays out the same, rather than open a panel only to drop it (V-1075).
    const stageRefused = playback.loadError === "no-access" || playback.loadError === "gone";
    const layout = stageRefused && (refused || !answered)
        ? "none"
        : transcriptLayout(media?.status ?? data.status, { source: !!transcriptSource, answered, lines: shownLines.length, failed: transcriptFailed });
    // A phone's Download (the header's own shows from md up): in the sheet's
    // head beside Close, as at 1280, whether or not the words are beside it.
    // On the Transcript row it read as the transcript's own (V-189).
    const phoneDownload = (className: string) => mediaUrl && isMobile ? (
        <Button aria-label="Download recording" variant="ghost" size="sm" onClick={() => void download()} className={className}>
            <Download className="h-4 w-4" />
        </Button>
    ) : null;
    // The header's facts, joined only where there are some: no size for one
    // with nothing in it ("0 bytes" before), as its row gives none, and none
    // for a doc's embed, which knows neither ("0 bytes · " before).
    const facts = [fileSize(data.fileSize), formatDateForAttachment(startedAt)].filter(Boolean).join(" · ");
    // The stage is its picture's box in the sheet and above a phone's words;
    // a full screen's fills it (stageFit). Beside a picture-sized stage the
    // words take its height and scroll (contain: size keeps their own height
    // out of the row's), and under a phone's they fill what's left.
    const fit = stageFit({ fullScreen: isFullscreen, phone: isMobile, words: layout === "panel" });

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            {/* Full screen lifts the dialog surface's 85dvh cap as well as its
                width: with the cap kept, the player stopped 15% short of the
                screen and the page showed above and below it, as the file
                lightbox did. Its parts sit flush (gap-0): the surface's own
                gap left a band of it between the header and the stage. */}
             <DialogContent className={cn(
                "max-w-[70vw] p-0 gap-0 flex flex-col overflow-hidden bg-background border [&>button]:hidden",
                // With no stage, the words alone keep the sheet's height; a stage sizes it.
                transcriptOnly && "h-[85vh]",
                isFullscreen && "!max-w-none !w-screen !h-dvh !max-h-none !rounded-none border-none"
            )} data-full-screen={isFullscreen ? "" : undefined} onOpenAutoFocus={noteOpener} onCloseAutoFocus={focusRowIfNoOpener}>
                {/* ... Header ... */}
                 <div className="flex justify-between items-center p-3 border-b bg-muted/20">
                    <div className="flex min-w-0 flex-col md:max-w-md">
                        <DialogTitle className="text-base font-semibold">
                            <MiddleName name={title} />
                        </DialogTitle>
                        {facts ? <span className="text-xs text-muted-foreground">{facts}</span> : null}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {mediaUrl && (
                             <Button variant="outline" size="sm" onClick={() => void download()} className="hidden md:flex gap-2 h-8">
                                <Download className="h-3.5 w-3.5" />
                                <span className="text-xs">Download</span>
                            </Button>
                        )}
                        {phoneDownload("h-8 w-8 p-0")}

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
                    <div
                        className={cn(
                            "bg-black flex justify-center items-center relative",
                            fit === "picture"
                                ? "w-full shrink-0 self-start max-h-[60dvh] md:w-auto md:flex-1 md:max-h-[calc(85dvh-4rem)]"
                                : "flex-1 min-h-[30vh] h-full"
                        )}
                        style={fit === "picture" ? { aspectRatio: ratio } : undefined}
                        data-stage={fit}
                    >
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
                                    onLoadedMetadata={(e) => {
                                        playback.videoProps.onLoadedMetadata(e);
                                        const { videoWidth, videoHeight } = e.currentTarget;
                                        if (videoWidth > 0 && videoHeight > 0) setShape({ recording, ratio: `${videoWidth} / ${videoHeight}` });
                                    }}
                                />
                            </div>
                        ) : (
                            // While the layout waits for the words, the stage keeps
                            // its loading state, as while the media answer comes.
                            <RecordingStageMessage media={layout === "wait" ? null : media} loadError={playback.loadError} noun={stageNoun(layout === "panel" && !refused)} playbackFailed={playback.playbackFailed} onRetry={media ? playback.retry : () => void playback.reload()} home={data.home} />
                        )}
                    </div>
                    )}

                    {/* Transcript Area */}
                    {layout === "panel" && (
                    <div className={cn(
                        // Its size snaps when full screen changes: a transitioned
                        // width and height laid the dialog out on every frame.
                        "flex flex-col bg-background transition-colors",
                        transcriptOnly
                            ? "w-full flex-1"
                            : cn("border-border", fit === "screen" ? "w-[350px] border-l" : "w-full flex-1 min-h-0 md:flex-none md:w-[350px] md:border-l md:[contain:size]")
                    )} data-transcript="">
                        {/* It wraps: a failed export's sentence takes its own row under the heading (transcriptTools). */}
                        <div className="p-3 border-b font-medium text-sm bg-muted/10 flex flex-wrap justify-between items-center gap-x-2 gap-y-1">
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                {transcriptOnly ? <Captions className="size-4 text-ink-3" aria-hidden /> : null}
                                {/* "wasn't recorded" is the link's (media=0), never said of a call this person can't see. */}
                                {transcriptOnly && !refused ? "Transcript · this call wasn't recorded" : "Transcript"}
                            </span>
                            {shownLines.length > 0 ? <TranscriptExport source={transcriptSource} fileName={fileName} /> : null}
                        </div>
                        {/* px-1 and the rows' own p-2 start their text under the heading's. No end room under
                            the last line (no tab bar here): with it a transcript that fits could scroll, and
                            opening at a moment scrolled line 1's speaker out of sight (CR-330 F5). */}
                        <div className="flex-1 overflow-hidden px-1 py-2 relative [--list-end-room:0px]">
                             {shownLines.length === 0 && transcriptInfo.isLoading ? (
                                <div className="absolute inset-0 flex justify-center items-center text-muted-foreground text-sm">
                                    <LoaderCircle className="animate-spin h-4 w-4 mr-2" /> Loading transcript…
                                </div>
                             ) : refused ? (
                                <CallRefused kind={refused} className="absolute inset-0" />
                             ) : transcriptFailed ? (
                                <ErrorState compact subject="the transcript" className="absolute inset-0" onRetry={() => void transcriptInfo.mutate()} />
                             ) : shownLines.length === 0 ? (
                                <div className="absolute inset-0 flex justify-center items-center text-muted-foreground text-sm">
                                    No transcript available
                                </div>
                             ) : (
                                <VirtualInfiniteScroll
                                    items={shownLines}
                                    renderItem={renderTranscriptItem}
                                    onLoadMore={handleLoadMore}
                                    isLoading={transcriptInfo.isLoading}
                                    hasMore={hasPageAfter(pageIndex, transcriptInfo.data?.pageCount)}
                                    scrollToIndex={momentIndex >= 0 ? momentIndex : undefined}
                                    className="h-full"
                                />
                             )}
                        </div>
                        {/* A phone corrects a line in a drawer, its Save and Cancel pinned (zoom-05). */}
                        {sheet && editing !== null ? (() => {
                            const given = shownLines.find((l) => l.uid === editing);
                            const line = given && (corrected[editing] ?? given);
                            return line ? (
                                <LineCorrection egressId={data.egressId} line={line} speaker={displayNameOf(line.transcript_from) || "Unknown"} at={formatDuration(lineStartSeconds(line, recordingStartMs))} onSaved={saved} onClose={() => setEditing(null)} />
                            ) : null;
                        })() : null}
                    </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

/**
 * A call this person can't see (403) or that is gone (404): the house's words
 * for it (lib/http/loadFailure), with no Try again, which can't fix it. The
 * transcript's side (CR-330 F2) and the stage's (V-1075) say the same.
 * ErrorState's own EmptyState and SpotError draw it, so the player's chunk
 * loads nothing new.
 */
function CallRefused({ kind, noun = "call", className }: { kind: Exclude<LoadFailure, "failed">; noun?: "call" | "recording"; className?: string }) {
    const words = failureWords(kind, noun)
    return (
        <>
            <SaysLoadFailure />
            <EmptyState illustration={<SpotError />} title={words.title} description={words.detail} className={className} />
        </>
    )
}

/**
 * What the stage says when there is no picture (CALL-BUG-16): still loading,
 * a recording that failed (it used to open as a black frame with controls),
 * one that captured nothing, calmly (V-32), one still being recorded, a
 * link that wouldn't play, or one the server refused: not this person's to
 * see, or gone (V-1075).
 */
export function RecordingStageMessage({
    media,
    loadError,
    playbackFailed,
    onRetry,
    home,
    noun = "call",
}: {
    media: RecordingMedia | null
    loadError: LoadFailure | false
    playbackFailed: boolean
    onRetry: () => void
    /** Where it is kept, which its words say it can be deleted from: a channel's or a chat's unless given. */
    home?: RecordingHome
    /** What a refusal names: the call, or the recording alone when its words read beside it (V-1104). */
    noun?: "call" | "recording"
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
    // A refusal first: a link that wouldn't play is no reason to offer a Try again the server will refuse too.
    if (loadError && loadError !== "failed") {
        return (
            // The stage is dark in either theme, so its words take the dark theme's ink (as a file's dark stage does).
            <div role="status" className="dark" data-recording-state={loadError}>
                <CallRefused kind={loadError} noun={noun} className="py-4" />
            </div>
        )
    }
    const nothing = nothingToPlay(media?.status, home)
    if (nothing) {
        const icon = nothing.state === "empty"
            ? <VideoOff className="size-6 text-white/70" aria-hidden />
            : <AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />
        return box(icon, nothing.title, nothing.detail)
    }
    if (media?.status === "recording") {
        return box(<Disc className="size-6 text-[#F2555A]" aria-hidden />, "Still recording", "This call is still being recorded. It can be played once the recording stops.")
    }
    if (playbackFailed) {
        return box(<AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />, "This recording can't be played", "The link to it didn't work, even after a fresh one.", true)
    }
    if (loadError) {
        return (
            <>
                <SaysLoadFailure />
                {box(<AlertTriangle className="size-6 text-[#FFB547]" aria-hidden />, "Couldn't load the recording", "Check your connection and try again.", true)}
            </>
        )
    }
    return (
        <div role="status" className="flex gap-2 items-center text-white/70" data-recording-state="loading">
            <LoaderCircle className="animate-spin h-5 w-5" aria-hidden />
            <span className="text-sm">Loading the recording…</span>
        </div>
    )
}
