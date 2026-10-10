"use client";

import { useEffect, useState, useRef } from "react";
import { createLocalVideoTrack, LocalTrack } from "livekit-client";
import { Mic, MicOff, Video, VideoOff } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kicker } from "@/components/ui/pageHeader";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { cn } from "@/lib/utils/helpers/cn";

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
  /** Whose colour the camera-off face wears: the person's id where there is one. */
  hueId?: string;
}

/** What the preview says when there is no picture. Pure. */
export function previewMessage(state: { videoEnabled: boolean; hasTrack: boolean; problem: string | null }): string | null {
  if (state.problem) return state.problem
  if (state.hasTrack) return null
  // The camera is still opening: "Camera is off" said the opposite of what
  // was happening for the second or two it takes.
  return state.videoEnabled ? "Starting your camera…" : "Camera is off"
}

export function PreJoin({ onJoin, username, nameEditable = false, joinLabel = "Join call", place, onCancel, embedded = false, hueId }: PreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [name, setName] = useState(username);
  const [videoTrack, setVideoTrack] = useState<LocalTrack | undefined>(undefined);
  // Set when the camera could not be opened (refused, busy, missing), so the
  // preview says why instead of quietly showing "Camera is off".
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);

  const trackRef = useRef<LocalTrack | undefined>(undefined);

  // The account's name arrives a moment after the page; until it is edited,
  // the field follows it.
  useEffect(() => {
    if (!nameEditable) setName(username)
  }, [username, nameEditable])

  useEffect(() => {
    let cancelled = false
    const enableVideo = async () => {
        if (videoEnabled) {
            try {
                const track = await createLocalVideoTrack({
                    deviceId: "", // Use default or selected
                    resolution: { width: 1280, height: 720 },
                });
                if (cancelled) {
                    track.stop()
                    return
                }
                setVideoTrack(track);
                trackRef.current = track; // Store in ref for cleanup
            } catch (e) {
                if (cancelled) return
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
        cancelled = true
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
  const showing = videoTrack && videoEnabled
  const message = previewMessage({ videoEnabled, hasTrack: !!showing, problem: cameraProblem })

  return (
    <div className={`flex w-full items-center justify-center bg-background p-4 ${embedded ? "min-h-full" : "min-h-dvh"}`}>
    <div className="flex w-full max-w-md flex-col items-center space-y-6 rounded-lg border bg-card p-6">
      <div className="space-y-1.5 text-center">
        {/* Held open before the call's name arrives, so the card doesn't
            grow under the reader (it is centred, so everything moved). */}
        <p className={cn(kicker, "min-h-[1.125rem]")} data-call-place="">
          {place ? `Call ${place}` : " "}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">Ready to join?</h1>
      </div>

      {/* The microphone and camera sit under the preview, not on it. Floated
          over the frame they covered the "camera could not be opened" line,
          which is the one time the frame has words in it. */}
      <div className="w-full space-y-3">
        <div className="relative aspect-video w-full bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {showing ? (
            <VideoTrackPreview track={videoTrack} />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-muted-foreground">
               {/* The person's own colour, as on their avatar elsewhere. */}
               <IdentityMark variant="avatar" size={56} id={hueId ?? (name || username)} label={name || username || "?"} />
               <p className="max-w-[18rem] text-center text-sm text-pretty" role="status">{message}</p>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2">
             <Button
                variant={audioEnabled ? "outline" : "destructive"}
                size="icon"
                aria-label={audioEnabled ? "Mute" : "Unmute"}
                title={audioEnabled ? "Mute" : "Unmute"}
                className="h-10 w-10"
                onClick={toggleAudio}
             >
                {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
             </Button>
             <Button
                variant={videoEnabled ? "outline" : "destructive"}
                size="icon"
                aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
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
              // A label above the field, not a placeholder standing in for one.
              <div className="flex flex-col gap-1.5">
                  <label htmlFor="prejoin-name" className="text-sm font-medium">Your name</label>
                  <Input
                      id="prejoin-name"
                      name="name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={40}
                      placeholder="Priya Sharma"
                  />
              </div>
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

// Attached once per track, and let go when it changes: a callback ref here
// attached the track again on every render of the page.
function VideoTrackPreview({ track }: { track: LocalTrack }) {
    const ref = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        track.attach(el)
        return () => {
            track.detach(el)
        }
    }, [track])
    return <video ref={ref} muted playsInline className="w-full h-full object-cover -scale-x-100" />
}
