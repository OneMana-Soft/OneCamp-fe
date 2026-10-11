"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useConnectionState,
  LayoutContextProvider,
  TrackReferenceOrPlaceholder,
  ParticipantClickEvent,
} from "@livekit/components-react";
import { Track, RoomEvent, RemoteParticipant, DataPacket_Kind, ConnectionState } from "livekit-client";
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { VideoControls } from "./VideoControls";
import { CallConnecting, CallReconnecting, CaptionsOverlay, PlacePill, RecordingPill } from "./CallStage";
import { StageTile } from "./StageTile";
import { captureTiles, flipTiles, type TileRects } from "./stageMotion";
import { readDevicePrefs } from "./callDevices";
import { FrontendTranscriber, type TranscriberState } from "./FrontendTranscriber";
import { cn } from "@/lib/utils/helpers/cn"

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


/**
 * Speaker and grid draw in one frame (hub.md C4): 12px round the tiles, the
 * pills' 48px clear at the top, and the dock kept clear at the bottom (the
 * phone's full-width bar, 84px for the floating dock). Speaker and grid used
 * different insets once, so every tile moved 8px on a switch.
 */
export const STAGE_FRAME = "px-3 pt-12 pb-24 @3xl:pb-[84px]"

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


  // The microphone and camera picked in the green room.
  const [prefs] = useState(() => (typeof window === "undefined" ? {} : readDevicePrefs()));

  if (!token) {
    return <CallConnecting place={place} embedded={embedded} />;
  }

  return (
    <div
      className={`dark @container relative w-full overflow-hidden bg-[#0B0C0E] text-foreground before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(700px_480px_at_-80px_-100px,rgb(var(--glow)/0.10),transparent_68%)] ${embedded ? "h-full" : "h-full md:h-dvh"}`}
      data-lk-theme="default"
      data-call-stage=""
    >
      <LiveKitRoom
        video={prefs.videoinput ? { deviceId: prefs.videoinput } : true}
        audio={{ 
            ...(prefs.audioinput ? { deviceId: prefs.audioinput } : {}),
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
            <MyVideoConference onDisconnect={onDisconnect} parentToggleRecording={toggleRecording} isAdmin={isAdmin} guest={guest} place={place} />
            <RoomAudioRenderer />
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

function MyVideoConference({ onDisconnect,parentToggleRecording, isAdmin, guest = false, place }: { onDisconnect?: () => void , parentToggleRecording: (isRecording: boolean) => void, isAdmin: boolean, guest?: boolean, place?: string }) {
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
  // When this screen first saw the recording on, for the pill's clock.
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  useEffect(() => {
    setRecordingSince((was) => (isRecording ? (was ?? Date.now()) : null));
  }, [isRecording]);


  
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

  // How long this screen has been in the call, for the place pill.
  const [joinedAt] = useState(() => Date.now());
  const connection = useConnectionState(room);
  const reconnecting = connection === ConnectionState.Reconnecting;

  // The stage's reflow: tiles slide to their new places when the set of
  // tiles or the layout changes (stageMotion).
  const stageRef = useRef<HTMLDivElement>(null);
  const lastRects = useRef<TileRects>(new Map());
  const tileKey = `${layout}|${tracks.map((t) => `${t.participant.identity}|${t.source}`).join(",")}|${effectiveFocusedTrack ? effectiveFocusedTrack.participant.identity + effectiveFocusedTrack.source : ""}`;
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    flipTiles(stage, lastRects.current);
    lastRects.current = captureTiles(stage);
  }, [tileKey]);

  const sameTrack = (a: TrackReferenceOrPlaceholder, b: TrackReferenceOrPlaceholder) => a.participant.identity === b.participant.identity && a.source === b.source;

  return (
    <div className="relative flex h-full w-full flex-col">
        <PlacePill place={place} since={joinedAt} />
        {isRecording && <RecordingPill by={recordingUser} since={recordingSince} />}
        {reconnecting && <CallReconnecting />}

        <div ref={stageRef} className={cn("relative flex flex-1 overflow-hidden transition-opacity duration-200", reconnecting && "opacity-70")}>
            {layout === 'speaker' && effectiveFocusedTrack ? (
                <div className={cn("flex h-full w-full gap-2", STAGE_FRAME)}>
                    <div className="hub-fade-in relative min-w-0 flex-1" key={effectiveFocusedTrack.participant.identity + effectiveFocusedTrack.source}>
                        <StageTile
                            trackRef={effectiveFocusedTrack}
                            size="lg"
                            contain
                            pinned={!!focusedTrack && sameTrack(focusedTrack, effectiveFocusedTrack)}
                            onPin={() => setFocusedTrack(focusedTrack ? null : effectiveFocusedTrack)}
                        />
                    </div>
                    {tracks.some((t) => !sameTrack(t, effectiveFocusedTrack)) && (
                        <div className="flex h-full w-[104px] shrink-0 flex-col gap-2 overflow-y-auto @2xl:w-[200px]">
                             {tracks.filter((t) => !sameTrack(t, effectiveFocusedTrack)).map((track) => (
                                 // A button: the thumbnails were clickable divs the
                                 // keyboard couldn't reach.
                                 <button
                                    type="button"
                                    key={track.participant.identity + track.source}
                                    aria-label={`Show ${track.participant.name || track.participant.identity}`}
                                    className="relative aspect-video w-full shrink-0 rounded-[14px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    onClick={() => onParticipantClick({ participant: track.participant, track: track.publication } as ParticipantClickEvent)}
                                 >
                                     <StageTile trackRef={track} size="sm" />
                                 </button>
                             ))}
                        </div>
                    )}
                 </div>
            ) : (
                    <div className={cn("h-full w-full [&_.lk-grid-layout]:gap-2 [&_.lk-grid-layout]:p-0", STAGE_FRAME)}>
                        <GridLayout tracks={tracks}>
                            <StageTile onParticipantClick={onParticipantClick} />
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
            recordingSince={recordingSince}
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
