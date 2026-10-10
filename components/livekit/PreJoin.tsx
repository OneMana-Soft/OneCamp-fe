
"use client";

import { useEffect, useState, useRef } from "react";
import { createLocalVideoTrack, LocalTrack } from "livekit-client";
import { Mic, MicOff, Video, VideoOff } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { kicker } from "@/components/ui/pageHeader";

interface PreJoinProps {
  onJoin: (values: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => void;
  username: string;
  // When true, the user can type their display name (used by the guest join
  // flow, where there is no account). Join stays disabled until non-empty.
  nameEditable?: boolean;
  // Optional override for the primary button label.
  joinLabel?: string;
  // Where the call is, after "Call" ("in #engineering", "with Maya Chen"), said above the title, so
  // nobody joins a call without knowing which one it is.
  place?: string;
  // A way out before joining. Without it the page offered only "Join".
  onCancel?: () => void;
  // In a side pane (split view): fill the pane, not the screen.
  embedded?: boolean;
}

export function PreJoin({ onJoin, username, nameEditable = false, joinLabel = "Join call", place, onCancel, embedded = false }: PreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [name, setName] = useState(username);
  const [videoTrack, setVideoTrack] = useState<LocalTrack | undefined>(undefined);
  // Set when the camera could not be opened (refused, busy, missing), so the
  // preview says why instead of quietly showing "Camera is off".
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  
  const trackRef = useRef<LocalTrack | undefined>(undefined);

  useEffect(() => {
    const enableVideo = async () => {
        if (videoEnabled) {
            try {
                const track = await createLocalVideoTrack({
                    deviceId: "", // Use default or selected
                    resolution: { width: 1280, height: 720 },
                });
                setVideoTrack(track);
                trackRef.current = track; // Store in ref for cleanup
            } catch (e) {
                console.error("Failed to acquire video track", e);
                const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
                setCameraProblem(
                  denied
                    ? "OneCamp is not allowed to use your camera. Allow it in the browser, or join with audio."
                    : "Your camera could not be opened. It may be in use by another app. You can join with audio.",
                );
                setVideoEnabled(false);
            }
        } else {
            if (trackRef.current) {
                trackRef.current.stop();
                trackRef.current = undefined;
                setVideoTrack(undefined);
            }
        }
    };
    enableVideo();
    return () => {
        // Robust cleanup on unmount or dependency change
        if (trackRef.current) {
            trackRef.current.stop();
            trackRef.current = undefined;
        }
    };
  }, [videoEnabled]);

  const toggleVideo = () => {
    setCameraProblem(null);
    setVideoEnabled(!videoEnabled);
  };
  const toggleAudio = () => setAudioEnabled(!audioEnabled);

  return (
    <div className={`flex w-full items-center justify-center bg-background p-4 ${embedded ? "min-h-full" : "min-h-dvh"}`}>
    <div className="flex w-full max-w-md flex-col items-center space-y-6 rounded-lg border bg-card p-6">
      <div className="space-y-1.5 text-center">
        {place && <p className={kicker}>Call {place}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">Ready to join?</h1>
      </div>
      
      {/* The microphone and camera sit under the preview, not on it. Floated
          over the frame they covered the "camera could not be opened" line,
          which is the one time the frame has words in it. */}
      <div className="w-full space-y-3">
        <div className="relative aspect-video w-full bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {videoTrack && videoEnabled ? (
            <VideoTrackPreview track={videoTrack} />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-muted-foreground">
               <div className="h-14 w-14 rounded-full bg-background flex items-center justify-center" aria-hidden="true">
                   <span className="text-xl font-semibold text-foreground">{(name || "?").charAt(0).toUpperCase()}</span>
               </div>
               <p className="max-w-[18rem] text-center text-sm text-pretty">{cameraProblem ?? "Camera is off"}</p>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2">
             <Button
                variant={audioEnabled ? "outline" : "destructive"}
                size="icon"
                aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                aria-pressed={!audioEnabled}
                title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                className="h-10 w-10"
                onClick={toggleAudio}
             >
                {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
             </Button>
             <Button
                variant={videoEnabled ? "outline" : "destructive"}
                size="icon"
                aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
                aria-pressed={!videoEnabled}
                title={videoEnabled ? "Turn camera off" : "Turn camera on"}
                className="h-10 w-10"
                onClick={toggleVideo}
             >
                {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
             </Button>
        </div>
      </div>

      <div className="w-full flex flex-col gap-3">
          {nameEditable && (
              <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="w-full rounded-md border border-border bg-background px-3 h-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              />
          )}
          <Button
              size="lg"
              className="w-full"
              disabled={nameEditable && name.trim() === ""}
              onClick={() => onJoin({ audioEnabled, videoEnabled, displayName: name.trim() })}
          >
            {joinLabel}
          </Button>
          {onCancel && (
            <Button variant="ghost" className="w-full" onClick={onCancel}>
              Not now
            </Button>
          )}
      </div>
    </div>
    </div>
  );
}

function VideoTrackPreview({ track }: { track: LocalTrack }) {
    const videoRef = (element: HTMLVideoElement | null) => {
        if (element) {
            track.attach(element);
        }
    };
    return <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" />
}
