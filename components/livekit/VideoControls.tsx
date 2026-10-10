import * as React from "react";
import {
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, MoreVertical, LayoutGrid, Loader2, Sparkles, Captions, CaptionsOff } from "@/lib/icons";
import { MonitorUp, MonitorOff, SquareUser, Disc } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/helpers/cn"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_AI } from "@/hooks/useClientConfig"

interface VideoControlsProps {
  onDisconnect?: () => void;
  onChatToggle?: () => void;
  isChatOpen?: boolean;
  layout?: 'grid' | 'speaker';
  onLayoutChange?: (layout: 'grid' | 'speaker') => void;
  onToggleRecording?: () => void;
  isRecording?: boolean;
  isRecordingLoading?: boolean;
  onToggleCaptions?: () => void;
  showCaptions?: boolean;
  onToggleAI?: () => void;
  isAIOpen?: boolean;
  aiUnreadCount?: number;
}

/**
 * The call's controls: a solid dock at the bottom of the call.
 *
 * The words are the pre-join screen's ("Mute", "Turn camera off"), so a
 * control doesn't change its name between the two screens. A control that is
 * off reads in the danger colour, as the pre-join screen's do; recording reads
 * the same way, steadily (it pulsed for as long as the call was recorded). The
 * dock is a surface, not frosted glass, and doesn't change colour under the
 * pointer.
 */
export function VideoControls({
  onDisconnect,
  onChatToggle,
  isChatOpen,
  layout,
  onLayoutChange,
  onToggleRecording,
  isRecording,
  isRecordingLoading,
  onToggleCaptions,
  showCaptions,
  onToggleAI,
  isAIOpen,
  aiUnreadCount,
}: VideoControlsProps) {
  const room = useRoomContext();
  // These are kept up to date by the hook as tracks are muted and published.
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  const toggleCamera = () => localParticipant.setCameraEnabled(!isCameraEnabled);
  const toggleScreenShare = () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled);

  const handleLeave = () => {
    if (onDisconnect) {
        onDisconnect();
    } else {
        room.disconnect();
    }
  };

  const off = "bg-destructive/15 text-danger-ink hover:bg-destructive/25 border-destructive/40";

  return (
    <TooltipProvider delayDuration={300}>
    <div
      role="toolbar"
      aria-label="Call controls"
      className="absolute bottom-4 left-1/2 z-[var(--z-fixed)] flex w-[95%] -translate-x-1/2 items-center justify-center gap-2 overflow-x-auto rounded-xl border border-border bg-popover p-2 shadow-overlay @3xl:w-auto @3xl:gap-3 @3xl:overflow-visible @3xl:p-2.5"
    >
      <ControlBtn
        label={isMicrophoneEnabled ? "Mute" : "Unmute"}
        onClick={toggleMic}
        isActive={!isMicrophoneEnabled}
        activeClass={off}
      >
        {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </ControlBtn>

      <ControlBtn
        label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        onClick={toggleCamera}
        isActive={!isCameraEnabled}
        activeClass={off}
      >
        {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </ControlBtn>

      {/* Desktop: Screen Share */}
      <div className="hidden @3xl:block">
      <ControlBtn
        label={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
        onClick={toggleScreenShare}
        isActive={isScreenShareEnabled}
        activeClass="bg-info/15 text-info-ink hover:bg-info/25 border-info/40"
      >
        {isScreenShareEnabled ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
      </ControlBtn>
      </div>

      {/* Recording Toggle */}
      {onToggleRecording && (
        <div className="hidden @3xl:block">
        <ControlBtn
            label={isRecording ? "Stop recording" : "Record"}
            onClick={onToggleRecording}
            isActive={isRecording}
            disabled={isRecordingLoading}
            activeClass={off}
        >
            {isRecordingLoading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <Disc className="h-5 w-5" />}
        </ControlBtn>
        </div>
      )}

      {/* Captions Toggle */}
      {onToggleCaptions && (
        <div className="hidden @3xl:block">
        <ControlBtn
            label={showCaptions ? "Hide captions" : "Show captions"}
            onClick={onToggleCaptions}
            isActive={showCaptions}
            activeClass="bg-highlight text-foreground border-border"
        >
            {showCaptions ? <CaptionsOff className="h-5 w-5" /> : <Captions className="h-5 w-5" />}
        </ControlBtn>
        </div>
      )}

      {/* AI Assistant Toggle */}
      {onToggleAI && (
        <FeatureGate feature={FEATURE_AI}>
        <div className="relative">
        <ControlBtn
            label={isAIOpen ? "Hide OneCamp AI" : "Ask AI"}
            onClick={onToggleAI}
            isActive={isAIOpen}
            activeClass="bg-brand-muted text-brand-text hover:bg-brand-muted border-brand/40"
        >
            <Sparkles className="h-5 w-5" />
        </ControlBtn>
        {!isAIOpen && (aiUnreadCount ?? 0) > 0 && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-3xs font-bold leading-none text-primary-foreground ring-2 ring-popover">
                {(aiUnreadCount ?? 0) > 9 ? "9+" : aiUnreadCount}
            </span>
        )}
        </div>
        </FeatureGate>
      )}

      {/* Layout Toggle */}
      {onLayoutChange && (
        <div className="hidden @3xl:block">
        <ControlBtn
            label={layout === 'grid' ? "Switch to speaker view" : "Switch to grid view"}
            onClick={() => onLayoutChange(layout === 'grid' ? 'speaker' : 'grid')}
        >
            {layout === 'grid' ? <LayoutGrid className="h-5 w-5" /> : <SquareUser className="h-5 w-5" />}
        </ControlBtn>
        </div>
      )}

      {onChatToggle && (
        <ControlBtn
            label="Chat"
            onClick={onChatToggle}
            isActive={isChatOpen}
            activeClass="bg-highlight text-foreground border-border"
        >
            <MessageSquare className="h-5 w-5" />
        </ControlBtn>
      )}

      <div className="mx-1 hidden h-8 w-px bg-border @3xl:block" aria-hidden="true" />

      {/* Leave says so, where there is room: an icon alone was the one
          control whose meaning had to be guessed from its colour. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Leave call"
            variant="destructive"
            className="h-12 w-12 gap-2 rounded-lg px-0 transition-colors active:scale-[0.97] @3xl:w-auto @3xl:px-4"
            onClick={handleLeave}
          >
            <PhoneOff className="h-5 w-5" />
            <span className="hidden @3xl:inline">Leave</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Leave call</TooltipContent>
      </Tooltip>

      {/* Mobile Menu for extra options */}
      <div className="@3xl:hidden">
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button aria-label="More call options" variant="ghost" size="icon" className="h-12 w-12 rounded-lg text-muted-foreground hover:text-foreground">
                    <MoreVertical className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mb-4 w-56 p-2">
                <DropdownMenuItem onClick={toggleScreenShare} className="py-3">
                    {isScreenShareEnabled ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
                    {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
                </DropdownMenuItem>

                {onToggleRecording && (
                    <DropdownMenuItem onClick={onToggleRecording} className="py-3 text-danger-ink focus:text-danger-ink">
                         <Disc className="h-4 w-4" />
                         {isRecording ? "Stop recording" : "Record call"}
                    </DropdownMenuItem>
                )}

                {onToggleCaptions && (
                    <DropdownMenuItem onClick={onToggleCaptions} className="py-3">
                        {showCaptions ? <CaptionsOff className="h-4 w-4" /> : <Captions className="h-4 w-4" />}
                        {showCaptions ? "Hide captions" : "Show captions"}
                    </DropdownMenuItem>
                )}

                {onToggleAI && (
                    <DropdownMenuItem onClick={onToggleAI} className="py-3">
                        <Sparkles className="h-4 w-4" />
                        {isAIOpen ? "Hide OneCamp AI" : "Ask AI"}
                    </DropdownMenuItem>
                )}

                {onLayoutChange && (
                    <DropdownMenuItem onClick={() => onLayoutChange(layout === 'grid' ? 'speaker' : 'grid')} className="py-3">
                        {layout === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <SquareUser className="h-4 w-4" />}
                        {layout === 'grid' ? "Switch to speaker view" : "Switch to grid view"}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
         </DropdownMenu>
      </div>

    </div>
    </TooltipProvider>
  );
}

interface ControlBtnProps extends React.ComponentProps<typeof Button> {
    label: string;
    isActive?: boolean;
    activeClass?: string;
}

function ControlBtn({ label, isActive, activeClass, className, children, ...props }: ControlBtnProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={label}
                    className={cn(
                        "h-12 w-12 rounded-lg border border-transparent text-foreground/80 transition-colors hover:bg-highlight hover:text-foreground",
                        isActive && activeClass,
                        className
                    )}
                    {...props}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    )
}
