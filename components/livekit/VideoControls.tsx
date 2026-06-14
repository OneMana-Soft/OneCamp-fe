import * as React from "react";
import {
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, MoreVertical, LayoutGrid, Loader2, Sparkles } from "@/lib/icons";
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
  const { localParticipant } = useLocalParticipant();
  
  const [isMuted, setIsMuted] = React.useState(false);
  const [isVideoOff, setIsVideoOff] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);

  // Sync state with actual participant state
  React.useEffect(() => {
    if (!localParticipant) return;

    const onTrackUpdated = () => {
      setIsMuted(!localParticipant.isMicrophoneEnabled);
      setIsVideoOff(!localParticipant.isCameraEnabled);
      setIsScreenSharing(localParticipant.isScreenShareEnabled);
    };

    // Initial check
    onTrackUpdated();

    // Listen to changes
    const events = [
      "localTrackPublished",
      "localTrackUnpublished",
      "trackMuted",
      "trackUnmuted",
    ];
    
    // Note: In a production app, we should attach listeners to room/participant events.
    // For simplicity with react hooks, we often rely on re-renders, but explicit listeners are safer for instant updates.
    // Using an interval or relying on `useLocalParticipant` updates is common. 
    // `useLocalParticipant` triggers re-renders on state changes.
    
    // Actually, `useLocalParticipant` returns booleans that auto-update. Let's use them directly.
  }, [localParticipant]);
  
  // Re-getting values directly from hook for reactivity
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();

  const toggleMic = async () => {
    if (isMicrophoneEnabled) {
      await localParticipant.setMicrophoneEnabled(false);
    } else {
      await localParticipant.setMicrophoneEnabled(true);
    }
  };

  const toggleCamera = async () => {
    if (isCameraEnabled) {
      await localParticipant.setCameraEnabled(false);
    } else {
      await localParticipant.setCameraEnabled(true);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenShareEnabled) {
      await localParticipant.setScreenShareEnabled(false);
    } else {
      await localParticipant.setScreenShareEnabled(true);
    }
  };

  const handleLeave = () => {
    if (onDisconnect) {
        onDisconnect();
    } else {
        room.disconnect();
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-2xl bg-black/80 md:bg-black/40 backdrop-blur-md border border-white/10 shadow-xl z-[var(--z-fixed)] transition-all hover:bg-black/90 md:hover:bg-black/50 w-[95%] md:w-auto overflow-x-auto md:overflow-visible justify-center md:justify-start">
      
      <ControlBtn
        label={isMicrophoneEnabled ? "Mute" : "Unmute"}
        onClick={toggleMic}
        isActive={!isMicrophoneEnabled} // Red when muted
        activeClass="bg-red-500/20 text-red-500 hover:bg-red-500/30 border-red-500/50"
      >
        {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </ControlBtn>

      <ControlBtn
        label={isCameraEnabled ? "Stop Video" : "Start Video"}
        onClick={toggleCamera}
        isActive={!isCameraEnabled}
        activeClass="bg-red-500/20 text-red-500 hover:bg-red-500/30 border-red-500/50"
      >
        {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </ControlBtn>

      {/* Desktop: Screen Share */}
      <div className="hidden md:block">
      <ControlBtn
        label={isScreenShareEnabled ? "Stop Sharing" : "Share Screen"}
        onClick={toggleScreenShare}
        isActive={isScreenShareEnabled}
        activeClass="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 border-blue-500/50"
      >
        {isScreenShareEnabled ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
      </ControlBtn>
      </div>

      {/* Recording Toggle */}
      {onToggleRecording && (
        <div className="hidden md:block">
        <ControlBtn
            label={isRecording ? "Stop Recording" : "Record"}
            onClick={onToggleRecording}
            isActive={isRecording}
            disabled={isRecordingLoading}
            activeClass="bg-red-500/20 text-red-500 hover:bg-red-500/30 border-red-500/50 animate-pulse"
        >
            {isRecordingLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Disc className="h-5 w-5" />}
        </ControlBtn>
        </div>
      )}
      
      {/* Captions Toggle */}
      {onToggleCaptions && (
        <div className="hidden md:block">
        <ControlBtn
            label={showCaptions ? "Hide Captions" : "Show Captions"}
            onClick={onToggleCaptions}
            isActive={showCaptions}
            activeClass="bg-white/20 text-white border-white/50"
        >
            <div className="font-bold text-xs border border-current rounded px-1 group-hover:scale-110 transition-transform">CC</div>
        </ControlBtn>
        </div>
      )}

      {/* AI Assistant Toggle */}
      {onToggleAI && (
        <div className="relative">
        <ControlBtn
            label={isAIOpen ? "Hide AI Assistant" : "Ask AI"}
            onClick={onToggleAI}
            isActive={isAIOpen}
            activeClass="bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border-violet-500/50"
        >
            <Sparkles className="h-5 w-5" />
        </ControlBtn>
        {!isAIOpen && (aiUnreadCount ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-bold leading-none shadow ring-2 ring-black/40 pointer-events-none">
                {(aiUnreadCount ?? 0) > 9 ? "9+" : aiUnreadCount}
            </span>
        )}
        </div>
      )}

      {/* Layout Toggle */}
      {onLayoutChange && (
        <div className="hidden md:block">
        <ControlBtn
            label={layout === 'grid' ? "Switch to Speaker View" : "Switch to Grid View"}
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
            activeClass="bg-white/20 text-white border-white/50"
        >
            <MessageSquare className="h-5 w-5" />
        </ControlBtn>
      )}

      <div className="w-px h-8 bg-white/10 mx-1 hidden md:block" />

       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg hover:scale-110 transition-transform"
              onClick={handleLeave}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Leave Call</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Mobile Menu for extra options */}
      <div className="md:hidden">
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl h-12 w-12">
                    <MoreVertical className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100 mb-4 w-56 p-2">
                <DropdownMenuItem onClick={toggleScreenShare} className="py-3">
                    {isScreenShareEnabled ? <MonitorOff className="mr-2 h-4 w-4" /> : <MonitorUp className="mr-2 h-4 w-4" />}
                    {isScreenShareEnabled ? "Stop Sharing" : "Share Screen"}
                </DropdownMenuItem>
                
                {onToggleRecording && (
                    <DropdownMenuItem onClick={onToggleRecording} className="py-3 text-red-400 focus:text-red-400">
                         <Disc className="mr-2 h-4 w-4" />
                         {isRecording ? "Stop Recording" : "Record Meeting"}
                    </DropdownMenuItem>
                )}

                {onToggleCaptions && (
                    <DropdownMenuItem onClick={onToggleCaptions} className="py-3">
                        <div className="mr-2 font-bold text-xs border border-current rounded px-1">CC</div>
                        {showCaptions ? "Hide Captions" : "Show Captions"}
                    </DropdownMenuItem>
                )}

                {onToggleAI && (
                    <DropdownMenuItem onClick={onToggleAI} className="py-3">
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isAIOpen ? "Hide AI Assistant" : "Ask AI"}
                    </DropdownMenuItem>
                )}
                
                {onLayoutChange && (
                    <DropdownMenuItem onClick={() => onLayoutChange(layout === 'grid' ? 'speaker' : 'grid')} className="py-3">
                        {layout === 'grid' ? <LayoutGrid className="mr-2 h-4 w-4" /> : <SquareUser className="mr-2 h-4 w-4" />}
                        {layout === 'grid' ? "Switch to Speaker View" : "Switch to Grid View"}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
         </DropdownMenu>
      </div>

    </div>
  );
}

interface ControlBtnProps extends React.ComponentProps<typeof Button> {
    label: string;
    isActive?: boolean;
    activeClass?: string;
}

function ControlBtn({ label, isActive, activeClass, className, children, ...props }: ControlBtnProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-12 w-12 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all border border-transparent",
                            isActive && activeClass,
                            className
                        )}
                        {...props}
                    >
                        {children}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
