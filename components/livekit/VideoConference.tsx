
"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  ParticipantTile,
  LayoutContextProvider,
  TrackReferenceOrPlaceholder,
  TrackReference,
  ParticipantClickEvent,
  VideoTrack,
  AudioTrack,
  ParticipantName,
  ConnectionQualityIndicator,
} from "@livekit/components-react";
import { Track, RoomEvent, RemoteParticipant, DataPacket_Kind } from "livekit-client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, Pin, PinOff } from "@/lib/icons";
import { VideoControls } from "./VideoControls";
import { CameraOffFace, CaptionsOverlay, RecordingIndicator } from "./CallStage";
import { FrontendTranscriber, type TranscriberState } from "./FrontendTranscriber";

interface VideoConferenceProps {
  token: string;
  serverUrl: string;
  onDisconnect?: () => void;
  toggleRecording: (isRecording: boolean) => void;
  isAdmin: boolean;
  // Guest mode (unauthenticated external participant). When true we skip every
  // feature that calls an authed backend endpoint — the frontend transcriber
  // (reads /config/client) and the in-call AI assistant (streams from an authed
  // route) — so a guest never triggers a 401 → refresh → logout redirect. Guests
  // still see remote captions relayed over the LiveKit data channel.
  guest?: boolean;
  // Where the call is, after "Call" ("in #engineering", "with Maya Chen"). Shown over the call, so
  // someone with two calls open, or back from another tab, knows which this is.
  place?: string;
  // In a side pane beside other work (split view) rather than its own page:
  // it fills the pane. Its layout follows its own width either way (container
  // queries), so a narrow pane gets the compact controls a phone gets.
  embedded?: boolean;
}

export function VideoConference({
  token,
  serverUrl,
  onDisconnect,
                                    toggleRecording, isAdmin, guest = false, place, embedded = false
}: VideoConferenceProps) {
  const [shouldConnect, setShouldConnect] = useState(false);

  useEffect(() => {
    if (token) {
        setShouldConnect(true)
    }
  }, [token]);


  if (!token) {
    return (
      <div
        role="status"
        aria-label="Connecting to the call"
        className="dark flex h-full w-full items-center justify-center bg-background text-foreground"
      >
        <div className="text-center">
            <Loader2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground motion-safe:animate-spin" />
            <p className="text-sm text-muted-foreground">Connecting to the call…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`dark @container relative w-full bg-background text-foreground overflow-hidden ${embedded ? "h-full" : "h-full md:h-screen"}`} data-lk-theme="default">
      {place && (
        <p className="pointer-events-none absolute left-9 top-9 z-10 max-w-[50%] truncate rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-foreground">
          Call {place}
        </p>
      )}
      <LiveKitRoom
        video={true}
        audio={{ 
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 48000 },
            sampleSize: 16
        }}
        token={token}
        serverUrl={serverUrl}
        onDisconnected={onDisconnect}
        connect={shouldConnect}
        className="h-full w-full"
      >
        <LayoutContextProvider>
            <MyVideoConference onDisconnect={onDisconnect} parentToggleRecording={toggleRecording} isAdmin={isAdmin} guest={guest} />
            <RoomAudioRenderer />
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

function MyVideoConference({ onDisconnect,parentToggleRecording, isAdmin, guest = false }: { onDisconnect?: () => void , parentToggleRecording: (isRecording: boolean) => void, isAdmin: boolean, guest?: boolean }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  ).filter(t => t.participant.identity !== 'transcriber-bot');
  
  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [focusedTrack, setFocusedTrack] = useState<TrackReferenceOrPlaceholder | null>(null);
  const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);
  
  // Use a stable ID to prevent re-triggering effect on every render or manual focus change
  const screenShareId = screenShareTrack ? `${screenShareTrack.participant.identity}-${screenShareTrack.source}` : undefined;

  const { localParticipant, microphoneTrack } = useLocalParticipant();
  // Force cleanup of tracks on unmount to ensure camera light turns off
  useEffect(() => {
      return () => {
          if (localParticipant) {
              localParticipant.videoTrackPublications.forEach(pub => {
                  pub.track?.stop();
              });
              localParticipant.audioTrackPublications.forEach(pub => {
                  pub.track?.stop();
              });
          }
      };
  }, [localParticipant]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [krispProcessor, setKrispProcessor] = useState<any | undefined>(undefined);

  // Krisp Noise Filter is NOT supported on self-hosted LiveKit (requires LiveKit Cloud).
  // Enabling it causes 404 errors on /settings endpoint.
  // We disable it here for now.
  /*
  useEffect(() => {
    const enableKrisp = async () => {
      if (!isKrispNoiseFilterSupported()) {
        console.warn("Krisp noise filter is not supported on this browser");
        return;
      }

      try {
        const processor = KrispNoiseFilter();
        // Some versions might require initialization, but if 'enable' is missing, likely just instantiation
        // or it's a different API. We'll set it.
        setKrispProcessor(processor);
      } catch (e) {
        console.error("Failed to enable Krisp noise filter", e);
      }
    };

    enableKrisp();
  }, []);

  useEffect(() => {
    if (microphoneTrack?.track && krispProcessor) {
       // Ensure it's treated as a LocalAudioTrack which supports processors
       (microphoneTrack.track as LocalAudioTrack).setProcessor(krispProcessor);
       return () => {
           if (microphoneTrack.track) {
                // Use undefined to clear the processor
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (microphoneTrack.track as LocalAudioTrack).setProcessor(null as any);
           }
       };
    }
  }, [microphoneTrack, krispProcessor]);
  */

  useEffect(() => {
    if (screenShareTrack) {
        setFocusedTrack(screenShareTrack);
        setLayout('speaker');
    } else {
        setFocusedTrack(prev => (prev?.source === Track.Source.ScreenShare ? null : prev));
        // Don't auto-switch back to grid, let user decide or stay in speaker if they want
    }
  }, [screenShareId]);
  
  const otherTracks = tracks.filter(t => {
      if (!focusedTrack) return false;
      // Exclude the specific track being focused
      // If same participant AND same source, exclude it.
      if (t.participant.identity === focusedTrack.participant.identity && t.source === focusedTrack.source) {
          return false;
      }
      return true;
  });

  const [activeSpeakerTrack, setActiveSpeakerTrack] = useState<TrackReferenceOrPlaceholder | null>(null);

  // Smooth Active Speaker Switching: Debounce updates to prevent rapid switching
  useEffect(() => {
    // Find who is CURRENTLY speaking (instant)
    const currentSpeaker = tracks.find(t => t.participant.isSpeaking && t.source === Track.Source.Camera) || 
                           tracks.find(t => t.participant.isSpeaking);

    // If the instant speaker is different from the stabilized one
    if (currentSpeaker?.participant.identity !== activeSpeakerTrack?.participant.identity) {
        // Wait before switching to avoid jitter
        const timer = setTimeout(() => {
            setActiveSpeakerTrack(currentSpeaker || null);
        }, 800); // 800ms delay for smoothness

        return () => clearTimeout(timer);
    }
  }, [tracks, activeSpeakerTrack]);

  const onParticipantClick = (evt: ParticipantClickEvent) => {
      // ... existing extraction logic ...
      let trackPublication = evt.track;
      let trackSource = evt.track?.source;

      if (!trackPublication) {
          const participantTracks = tracks.filter(t => t.participant.identity === evt.participant.identity);
          const screenShare = participantTracks.find(t => t.source === Track.Source.ScreenShare);
          const camera = participantTracks.find(t => t.source === Track.Source.Camera);
          
          if (screenShare) {
              trackPublication = screenShare.publication;
              trackSource = screenShare.source;
          } else if (camera) {
              trackPublication = camera.publication;
              trackSource = camera.source;
          }
      }

      if (!trackPublication || !trackSource) return;

      const track: TrackReferenceOrPlaceholder = {
          participant: evt.participant,
          source: trackSource,
          publication: trackPublication,
      };

      if (layout === 'grid') {
          // In Grid View, always switch to Speaker View and focus the clicked track
          setFocusedTrack(track);
          setLayout('speaker');
          return;
      }

      // In Speaker View:
      if (focusedTrack?.participant.identity === track.participant.identity && focusedTrack.source === track.source) {
          // Unpinning - just clear explicit focus, stay in current layout (fallback to active speaker)
          setFocusedTrack(null);
      } else {
          // Pinning - switch focus to new track
          setFocusedTrack(track);
      }
  };

  // Determine what to show in Speaker View if nothing is explicitly pinned
  let autoSelection = activeSpeakerTrack;

  if (screenShareTrack) {
      // If screen share is active, it takes priority UNLESS someone *else* is speaking.
      // If the presenter (screen sharer) is speaking, we still want to see their content, not their face flapping in and out.
      if (!activeSpeakerTrack || activeSpeakerTrack.participant.identity === screenShareTrack.participant.identity) {
          autoSelection = screenShareTrack;
      }
  }

  const effectiveFocusedTrack = focusedTrack || 
                                autoSelection || 
                                (tracks.length > 0 ? tracks[0] : null);

  // Recording State driven by Room Metadata
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUser, setRecordingUser] = useState<string | null>(null);


  
  const room = useRoomContext();

  useEffect(() => {
      const updateRecordingState = () => {
          if (!room.metadata) {
              setIsRecording(false);
              setRecordingUser(null);
              return;
          }

          try {
              const metadata = JSON.parse(room.metadata);
              if (metadata.isRecording) {
                  setIsRecording(true);
                  setRecordingUser(metadata.recordingStartedBy || "Unknown User");
              } else {
                  setIsRecording(false);
                  setRecordingUser(null);
              }
          } catch (e) {
              console.error("Failed to parse room metadata", e);
          }
      };

      // Initial check
      updateRecordingState();

      // Listen for updates
      room.on(RoomEvent.RoomMetadataChanged, updateRecordingState);
      
      return () => {
          room.off(RoomEvent.RoomMetadataChanged, updateRecordingState);
      };
  }, [room]);

  // State for active transcripts: map participantIdentity -> { accumulated, lastFinalId, name, lastUpdate }
  const [showCaptions, setShowCaptions] = useState(false);
  // Why no captions are appearing, so switching them on never leaves the user
  // staring at an empty screen wondering whether the feature is broken.
  const [captionState, setCaptionState] = useState<TranscriberState>({ status: "starting" });
  // Rolling buffer of recent FINAL utterances ("Name: text"), newest last.
  // Fed from handleTranscript; this is the freshest in-call context source for
  // the in-call AI agent (the persisted Dgraph copy only exists while recording
  // and lags by a write). Capped to keep memory + prompt size bounded.
  const transcriptBufferRef = useRef<{ name: string; text: string }[]>([]);
  // Per-participant last buffered final id — dedups the AI buffer feed against
  // StrictMode double-invokes and repeated final events for the same utterance.
  const lastBufferedIdRef = useRef<Record<string, string>>({});
  const getTranscriptBuffer = useCallback(() => {
    return transcriptBufferRef.current
      .map((l) => `${l.name}: ${l.text}`)
      .join("\n");
  }, []);
  const [activeTranscripts, setActiveTranscripts] = useState<Record<string, { 
      accumulated: string, 
      lastFinalId: string,
      name: string,
      id: string, // Keep tracking latest ID for staleness
      lastUpdate: number
  }>>({});
  
  // Cleanup stale transcripts
  const transcriptTimestamps = useRef<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
        const now = Date.now();
        setActiveTranscripts(prev => {
            const next = { ...prev };
            let hasChanges = false;
            Object.keys(next).forEach(pIdentity => {
                const entry = next[pIdentity];
                // Remove if stale (> 10s) - Keep history longer since we only update on finals
                if (now - (transcriptTimestamps.current[entry.id] || 0) > 10000) {
                    delete next[pIdentity];
                    hasChanges = true;
                }
            });
            return hasChanges ? next : prev;
        });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

    const handleTranscript = (data: any) => {
        const pName = data.participantName || "Unknown"; 
        const pIdentity = data.participantIdentity || "unknown_user";
        
        // 1. Filter out Interim results
        if (!data.isFinal) {
             // We update the timestamp to prevent cleanup while they are speaking, even if text isn't shown yet.
             // But we need an ID. Use data.id.
             if (data.id) transcriptTimestamps.current[data.id] = Date.now();
             return; 
        }

        // 2. Process Final results
        // Feed the in-call AI rolling buffer here (outside the setState
        // updater, which can run twice under StrictMode). Dedup on final id.
        if (data.id && lastBufferedIdRef.current[pIdentity] !== data.id) {
            const bufText = (data.text || "").trim();
            if (bufText.length > 0) {
                lastBufferedIdRef.current[pIdentity] = data.id;
                const buf = transcriptBufferRef.current;
                buf.push({ name: pName, text: bufText });
                if (buf.length > 200) buf.splice(0, buf.length - 200);
            }
        }

        setActiveTranscripts(prev => {
            const current = prev[pIdentity];
            
            // Deduplication: If we already added this ID, ignore.
            if (current && current.lastFinalId === data.id) {
                return prev;
            }

            // Valid text check
            if (!data.text || data.text.trim() === "") {
                return prev;
            }

            // Update timestamp
            transcriptTimestamps.current[data.id] = Date.now();
            
            // Append logic
            let newAccumulated = current?.accumulated || "";
            const newSentence = data.text.trim();
            if (newSentence.length > 0) {
                newAccumulated = newAccumulated ? `${newAccumulated} ${newSentence}` : newSentence;
            }
            
            return {
                ...prev,
                [pIdentity]: { 
                    accumulated: newAccumulated,
                    lastFinalId: data.id,
                    name: pName, 
                    id: data.id,
                    lastUpdate: Date.now()
                }
            };
        });
    };

    useEffect(() => {
      if (!room) return;
  
      const onDataReceived = (
        payload: Uint8Array,
        participant?: RemoteParticipant,
        kind?: DataPacket_Kind,
        topic?: string
      ) => {
        if (topic === "lk.transcription") {
          try {
              const decoder = new TextDecoder();
              const jsonString = decoder.decode(payload);
              const data = JSON.parse(jsonString);
              
              // For remote transcripts, ensure name is populated from participant if missing
              if (!data.participantName && participant) {
                  data.participantName = participant.name || participant.identity;
              }
              // Ensure identity is present
              if (!data.participantIdentity && participant) {
                  data.participantIdentity = participant.identity;
              }
              
              handleTranscript(data);
          } catch (e) {
              console.error("Failed to parse transcript:", e);
          }
        }
      };
  
      room.on(RoomEvent.DataReceived, onDataReceived);
      return () => {
          room.off(RoomEvent.DataReceived, onDataReceived);
      };
    }, [room, showCaptions]);

  const toggleCaptions = () => setShowCaptions(!showCaptions);

  // Multiplayer in-call AI agent — owns the shared Q&A conversation and the
  // LiveKit data-channel broadcast, so the conversation survives the panel
  // being closed and every participant sees the same answers.

  // Unread indicator: count exchanges that arrived while the panel was closed
  // so we can badge the AI button (and clear it when the panel opens).

   const [isRecordingActionLoading, setIsRecordingActionLoading] = useState(false);

  const toggleRecording = async () => {
      if (isRecordingActionLoading) return;
      
      setIsRecordingActionLoading(true);
      try {
          await parentToggleRecording(isRecording);
          // Wait a bit for metadata to propagate
          await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
          console.error("Failed to toggle recording", e);
      } finally {
          setIsRecordingActionLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-full w-full relative">
        {isRecording && <RecordingIndicator by={recordingUser} />}

        <div className="flex-1 overflow-hidden relative flex bg-background">
            {layout === 'speaker' && effectiveFocusedTrack ? (
                <div className="flex w-full h-full p-2 pb-24 gap-2">
                    <FocusedTile 
                        trackRef={effectiveFocusedTrack}
                        isPinned={
                            (focusedTrack?.participant.identity === effectiveFocusedTrack.participant.identity &&
                                focusedTrack.source === effectiveFocusedTrack.source)
                        }
                        onTileClick={() => {
                            if (focusedTrack) {
                                setFocusedTrack(null);
                            } else if (effectiveFocusedTrack) {
                                setFocusedTrack(effectiveFocusedTrack);
                            }
                        }}
                    />
                    {/* Other tracks logic needs to exclude effectiveFocusedTrack */}
                    {tracks.filter(t => t.participant.identity !== effectiveFocusedTrack.participant.identity || t.source !== effectiveFocusedTrack.source).length > 0 && (
                        <div className="w-[100px] @2xl:w-[220px] h-full flex flex-col gap-2 overflow-y-auto pr-1 shrink-0">
                             {tracks.filter(t => t.participant.identity !== effectiveFocusedTrack.participant.identity || t.source !== effectiveFocusedTrack.source).map((track) => (
                                 // A button: the thumbnails were clickable divs the
                                 // keyboard couldn't reach.
                                 <button
                                    type="button"
                                    key={track.participant.identity + track.source}
                                    aria-label={`Show ${track.participant.name || track.participant.identity}`}
                                    className="relative aspect-video w-full shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => onParticipantClick({ participant: track.participant, track: track.publication } as ParticipantClickEvent)}
                                 >
                                     <ParticipantTile trackRef={track} />
                                     <CameraOffFace trackRef={track} size="sm" />
                                 </button>
                             ))}
                        </div>
                    )}
                 </div>
            ) : (

                    <div className="w-full h-full p-2 @3xl:p-4 pb-20 @3xl:pb-24">
                        <GridLayout tracks={tracks}>
                        <CustomTile onParticipantClick={onParticipantClick} />
                    </GridLayout>
                    </div>
            )}
            
            {/* Captions, read out as they change. */}
            {showCaptions && (
                <CaptionsOverlay
                    idleMessage={captionMessage(captionState)}
                    entries={Object.entries(activeTranscripts).map(([identity, data]) => ({ identity, name: data.name, text: data.accumulated || "" }))}
                />
            )}

            {/* In-Call AI Assistant side panel. On desktop it docks to the
                right as a flex sibling (shrinking the video area); on mobile it
                overlays full-screen. */}
        </div>
        <VideoControls 
            onDisconnect={onDisconnect} 
            layout={layout}
            onLayoutChange={(newLayout) => {
                setLayout(newLayout);
            }}
            onToggleRecording={isAdmin ? toggleRecording : undefined}
            isRecording={isRecording}
            isRecordingLoading={isRecordingActionLoading}
            onToggleCaptions={toggleCaptions}
            showCaptions={showCaptions}
            // AI-free edition: no handler, so VideoControls renders no AI button.
                        // Same path guests already take.
                        onToggleAI={undefined}
        />
        {!guest && <FrontendTranscriber onTranscript={handleTranscript} onStatus={setCaptionState} />}
    </div>
  );
}

// What to tell the user while the caption overlay has nothing to show. Every
// one of these used to render as an empty box, which is indistinguishable from
// a broken feature, and the recognizer errors were only visible in devtools.
function captionMessage(state: TranscriberState): string {
    switch (state.status) {
        case "disabled":
            return "Captions are turned off for this workspace.";
        case "unsupported":
            return "This browser cannot transcribe speech, so nothing you say reaches the captions or the transcript. Chrome or Edge can.";
        case "mic-off":
            return "Unmute your microphone to caption what you say.";
        case "error":
            switch (state.error) {
                case "not-allowed":
                case "service-not-allowed":
                    return "Captions need microphone permission for this site.";
                case "audio-capture":
                    return "No microphone was available for captions.";
                case "network":
                    return "Captions cannot reach the speech service. Retrying.";
                case "language-not-supported":
                    return "Captions do not support this language yet.";
                default:
                    return `Captions stopped: ${state.error ?? "unknown error"}.`;
            }
        default:
            return "Listening for speech…";
    }
}

// Sub-component for the Focused Tile in Speaker View
interface FocusedTileProps {
    trackRef: TrackReferenceOrPlaceholder;
    isPinned: boolean;
    onTileClick: () => void;
}

function FocusedTile({ trackRef, isPinned, onTileClick }: FocusedTileProps) {
    return (
        <div 
            className="relative flex-1 overflow-hidden rounded-lg border border-border bg-card"
        >
            <ParticipantTile 
                trackRef={trackRef} 
                className="h-full w-full bg-background [&_video]:object-contain [&_button]:!hidden"
            >
                {/* Only render VideoTrack if we have a valid publication (not a placeholder) */}
                {trackRef.publication && (
                    <VideoTrack 
                        trackRef={trackRef as TrackReference} 
                        className="[&_video]:object-contain" 
                    />
                )}
                {/* AudioTrack handles its own validity internally usually, or is invisible */}
                {trackRef.publication && <AudioTrack trackRef={trackRef as TrackReference} />}
                
                {/* Connection Quality & Name Overlay */}
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1 text-sm text-foreground">
                    <ConnectionQualityIndicator className="h-4 w-4" />
                    <ParticipantName />
                </div>
            </ParticipantTile>
            <CameraOffFace trackRef={trackRef} size="lg" />
            
            {/* Pin or unpin: a real button, named, that says which it is. */}
            <button
                type="button"
                aria-label={isPinned ? "Unpin" : "Pin to the stage"}
                aria-pressed={isPinned}
                className="absolute right-4 top-4 z-10 rounded-md border border-border bg-popover p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                    e.stopPropagation();
                    onTileClick();
                }}
            >
                {isPinned ? (
                    <PinOff className="w-4 h-4" />
                ) : (
                    <Pin className="w-4 h-4" />
                )}
            </button>
        </div>
    );
}

// Wrapper to intercept clicks in GridLayout and provide the TrackReference
function CustomTile({ trackRef, onParticipantClick, ...props }: any) {
    return (
        <div 
            {...props} 
            className="group relative h-full w-full cursor-pointer bg-background [&_video]:object-contain"
        >
            <ParticipantTile 
                trackRef={trackRef} 
                className="h-full w-full" 
                onParticipantClick={onParticipantClick} 
            />
            <CameraOffFace trackRef={trackRef} />
            {/* Hover visual hint */}
            <div className="pointer-events-none absolute inset-0 rounded-lg transition-colors group-hover:bg-foreground/5" />
        </div>
    )
}
