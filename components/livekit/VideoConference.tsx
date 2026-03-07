
"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  FocusLayout,
  CarouselLayout,
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
import { Track, RoomEvent, RemoteParticipant, DataPacket_Kind, LocalAudioTrack } from "livekit-client";
import { useEffect, useState, useRef } from "react";
import { Loader2, Pin, PinOff } from "lucide-react";
import { VideoControls } from "./VideoControls";
import { FrontendTranscriber } from "./FrontendTranscriber";
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from "@livekit/krisp-noise-filter";

interface VideoConferenceProps {
  token: string;
  serverUrl: string;
  onDisconnect?: () => void;
  toggleRecording: (isRecording: boolean) => void;
  isAdmin: boolean;
}

export function VideoConference({
  token,
  serverUrl,
  onDisconnect,
                                    toggleRecording, isAdmin
}: VideoConferenceProps) {
  const [shouldConnect, setShouldConnect] = useState(false);

  useEffect(() => {
    if (token) {
        setShouldConnect(true)
    }
  }, [token]);


  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
            <p>Getting token...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full md:h-screen w-full bg-zinc-950 overflow-hidden" data-lk-theme="default">
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
            <MyVideoConference onDisconnect={onDisconnect} parentToggleRecording={toggleRecording} isAdmin={isAdmin} />
            <RoomAudioRenderer />
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

function MyVideoConference({ onDisconnect,parentToggleRecording, isAdmin }: { onDisconnect?: () => void , parentToggleRecording: (isRecording: boolean) => void, isAdmin: boolean }) {
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
        console.log("Krisp noise filter enabled");
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
        {/* Recording Banner */}
        {isRecording && recordingUser && (
            <div className="absolute top-0 left-0 w-full flex justify-center z-20 pointer-events-none">
                <div className="bg-red-500/90 backdrop-blur text-white text-xs font-medium px-4 py-1 rounded-b-lg shadow-lg animate-in slide-in-from-top-full duration-300">
                    {recordingUser} is recording
                </div>
            </div>
        )}

        <div className="flex-1 overflow-hidden relative flex bg-black">
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
                        <div className="w-[100px] sm:w-[220px] h-full flex flex-col gap-2 overflow-y-auto pr-1 shrink-0">
                             {tracks.filter(t => t.participant.identity !== effectiveFocusedTrack.participant.identity || t.source !== effectiveFocusedTrack.source).map((track) => (
                                 <div 
                                    key={track.participant.identity + track.source} 
                                    className="aspect-video w-full rounded-lg overflow-hidden border border-white/5 bg-zinc-800 cursor-pointer hover:border-blue-500 transition-colors shrink-0 relative"
                                    onClick={() => onParticipantClick({ participant: track.participant, track: track.publication } as ParticipantClickEvent)}
                                 >
                                     <ParticipantTile trackRef={track} />
                                 </div>
                             ))}
                        </div>
                    )}
                 </div>
            ) : (

                    <div className="w-full h-full p-2 md:p-4 pb-20 md:pb-24">
                        <GridLayout tracks={tracks}>
                        <CustomTile onParticipantClick={onParticipantClick} />
                    </GridLayout>
                    </div>
            )}
            
            {/* Transcript Overlay */}
            {showCaptions && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl flex flex-col justify-end items-center gap-3 pointer-events-none z-50 px-4">
                    {/* Sort by lastUpdate to keep stable order? No, keep fixed slots? Just map. */}
                    {Object.entries(activeTranscripts).map(([pIdentity, data]) => (
                        <div 
                            key={pIdentity} 
                            className="bg-black/70 backdrop-blur-md text-white px-6 py-4 rounded-2xl text-left shadow-lg transform transition-all duration-200 ease-out animate-in slide-in-from-bottom-4 fade-in w-auto min-w-[320px] max-w-full border border-white/10"
                        >
                             <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-blue-400 uppercase tracking-wide opacity-90">{data.name}</span>
                             </div>
                             <div className="text-lg text-slate-100 font-medium antialiased tracking-wide">
                                 {/* Only display accumulated (Final) text with Typing Effect */}
                                 <TypingText 
                                    text={data.accumulated || ""} 
                                    isFinal={true} /* Always true for display purposes compared to interim */
                                 />
                             </div>
                        </div>
                    ))}
                </div>
            )}
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
        />
        <FrontendTranscriber onTranscript={handleTranscript} />
    </div>
  );
}

// Sub-component for smooth typing effect
function TypingText({ text = "", isFinal }: { text?: string, isFinal: boolean }) {
    const [displayedText, setDisplayedText] = useState(text || "");
    
    // Normalize for comparison to ignore case/punctuation changes which cause snapping
    const normalize = (s: string) => (s || "").toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();

    useEffect(() => {
        if (!text) return;
        
        // 1. If strict match (append only), type it out
        if (text.startsWith(displayedText)) {
             if (text.length > displayedText.length) {
                const delta = text.slice(displayedText.length);
                let charIndex = 0;
                // Type faster for longer chunks to keep up
                const speed = Math.max(10, 40 - Math.min(30, delta.length * 2)); 
                
                const interval = setInterval(() => {
                    charIndex++;
                     setDisplayedText(prev => text.slice(0, prev.length + 1));
                    if (charIndex >= delta.length) clearInterval(interval);
                }, speed);
                return () => clearInterval(interval);
             }
             return;
        }

        // 2. If normalized match (e.g. "hello" -> "Hello"), just update cleanly without typing scan
        // This handles capitalization/punctuation corrections instantly without "retyping"
        const normText = normalize(text);
        const normDisplayed = normalize(displayedText);
        
        if (normText.startsWith(normDisplayed)) {
            // It's effectively an append, but with some prefix correction.
            // We want to KEEP the suffix typing effect if there is new content.
            // Strategy: Update the "matched" part instantly to the new version, then type the rest.
            
            // Heuristic: overlap length
            // If new text is "Hello World" and old was "hello", overlap is 5.
            // We set displayed to "Hello" instantly. Then type " World".
            // But we don't know exactly where the split is easily without diff.
            // Simple fallback: If length grew, type the new tail relative to index.
            if (text.length > displayedText.length) {
                // Instantly snap to the new version of the existing length
                // Then type the rest
                const stableLength = displayedText.length;
                const newPrefix = text.slice(0, stableLength);
                
                // Set base
                setDisplayedText(newPrefix);
                
                // Animate tail
                const delta = text.slice(stableLength);
                let charIndex = 0;
                const speed = Math.max(10, 40 - Math.min(30, delta.length * 2));
                
                const interval = setInterval(() => {
                    charIndex++;
                    setDisplayedText(prev => text.slice(0, prev.length + 1));
                    if (charIndex >= delta.length) clearInterval(interval);
                }, speed);
                return () => clearInterval(interval);
            }
        }

        // 3. Fallback: Content changed significantly (correction or new sentence)
        // Just snap. No animation to avoid confusion.
        setDisplayedText(text);

    }, [text]); // Dependence on text update

    return (
        <span>
            {displayedText}
            {/* No cursor needed for Final-Only mode as it implies completed sentences */}
        </span>
    );
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
            className="flex-1 rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-900 relative group"
        >
            <ParticipantTile 
                trackRef={trackRef} 
                className="h-full w-full [&_video]:object-contain bg-black [&_button]:!hidden"
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
                <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm flex items-center gap-2 pointer-events-none">
                    <ConnectionQualityIndicator className="h-4 w-4" />
                    <ParticipantName />
                </div>
            </ParticipantTile>
            
            {/* Pin State Indicator Overlay - Now the ONLY clickable trigger */}
            <div 
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white transition-all z-10 cursor-pointer pointer-events-auto hover:bg-black/70"
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
            </div>
        </div>
    );
}

// Wrapper to intercept clicks in GridLayout and provide the TrackReference
function CustomTile({ trackRef, onParticipantClick, ...props }: any) {
    return (
        <div 
            {...props} 
            className="w-full h-full cursor-pointer relative group [&_video]:object-contain bg-black"
        >
            <ParticipantTile 
                trackRef={trackRef} 
                className="h-full w-full" 
                onParticipantClick={onParticipantClick} 
            />
            {/* Hover visual hint */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-colors pointer-events-none rounded-xl" />
        </div>
    )
}
