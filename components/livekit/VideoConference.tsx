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
import { Track, RoomEvent, RemoteParticipant, DataPacket_Kind, ConnectionState, DisconnectReason, type Participant, type Room } from "livekit-client";
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, type MutableRefObject, type ReactNode } from "react";
import { VideoControls, showCallFailure } from "./VideoControls";
import { CallConnecting, CallReconnecting, CallStatusRow, CaptionsNotice, CaptionsOverlay, CaptionsPill, LockedPill, PlacePill, RecordingPill } from "./CallStage";
import { StageTile } from "./StageTile";
import { captureTiles, flipTiles, type TileRects } from "./stageMotion";
import { readDevicePrefs } from "./callDevices";
import { callRoomOptions } from "./roomOptions";
import { callMediaFailure, connectFailureOf, type ConnectFailure } from "./callErrors";
import {
  CALL_TOPIC,
  captionsConfirmText,
  readCallMetadata,
  readRemovalPacket,
  speechLanguage,
  type CallMetadata,
  type CallRemoval,
} from "./callState";
import { FrontendTranscriber, type TranscriberState } from "./FrontendTranscriber";
import { InCallAIPanel } from "./InCallAIPanel";
import dynamic from "next/dynamic";

// Backgrounds and sound, a piece of its own: the effects chosen on this device,
// put on as the camera and microphone publish, and the panel. None of a
// call's first load.
const CallEffects = dynamic(() => import("@/components/call/effects/CallEffects"), { ssr: false });
// Who is in the call, with the host's tools, loaded when People is first opened.
const CallPeoplePanel = dynamic(() => import("./CallPeoplePanel"), { ssr: false });
import { useCallPeople } from "./callPeople";
import { FloatingReactions, useCallReactions } from "./callReactions";
import { targetOf, useCallPart, useControlNotices, useHostActions } from "./callHosting";
import { useInCallAgent } from "./useInCallAgent";
import { cn } from "@/lib/utils/helpers/cn"
import { readCaption } from "@/lib/calls/signals"
import { partOf, personActions, type PersonAction } from "@/lib/calls/control"
import { useConfirm } from "@/hooks/useConfirm"
import { callToast } from "./callSurface"
import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"
import { setCallTranscription } from "@/services/callService"

/**
 * How a call ended for this screen. Leaving says nothing; being removed says
 * why, when the server did; a call that never connected says which kind of
 * failure kept it out (CALL-BUG-23).
 */
export interface CallEnd {
  removed?: CallRemoval;
  failed?: ConnectFailure;
}

/**
 * The workspace's transcription settings (/config/client), handed in by a
 * member's page. A guest's page has none: /config is behind the session, and
 * a guest's call never makes an authed read.
 */
export interface CallTranscriptionConfig {
  mode?: "frontend" | "backend" | "off";
  where?: string;
  language?: string;
}

interface VideoConferenceProps {
  token: string;
  serverUrl: string;
  onDisconnect?: (end?: CallEnd) => void;
  /**
   * Starts (false) or stops (true) the recording. Return the request, so a
   * refusal can be said. Absent where this call can't be recorded from here
   * (an instant meeting, a guest): Record isn't shown, rather than spinning
   * for a second and doing nothing (CALL-BUG-9).
   */
  toggleRecording?: (isRecording: boolean) => Promise<unknown> | void;
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
  /**
   * The green room's choice (CALL-BUG-1). Joining muted means muted: the
   * call used to turn both on at connect whatever was chosen, and a token
   * that left them out refused it in silence.
   */
  audio?: boolean;
  video?: boolean;
  /**
   * The call's id in Call State, for what whoever runs it does to it (Call
   * Control). A guest's call has none: a guest runs nothing.
   */
  sessionId?: string;
  /** Controls of the page's own beside the call's status pills (an instant meeting's Invite). */
  extraStatus?: ReactNode;
  /** The call has connected: from now on, leaving is leaving, and it has a duration. */
  onConnected?: () => void;
  transcriptionConfig?: CallTranscriptionConfig;
  /**
   * The conversation the call belongs to, beside it (CallView's useCallChat):
   * the dock's Chat. An instant meeting and a guest's call have none.
   */
  onChatToggle?: () => void;
  isChatOpen?: boolean;
}


/**
 * Speaker and grid draw in one frame (hub.md C4): 12px round the tiles, the
 * pills' 48px clear at the top, and the dock kept clear at the bottom (the
 * phone's full-width bar, 84px for the floating dock). Speaker and grid used
 * different insets once, so every tile moved 8px on a switch.
 */
export const STAGE_FRAME = "px-3 pt-12 pb-24 @3xl:pb-[84px] @7xl:pb-[100px]"

/**
 * The app's face on the stage. LiveKit's theme sets the system UI font on
 * everything under data-lk-theme, so names, the place pill, the dock and the
 * in-call AI panel were drawn in the system face, the only place in the app
 * that is not Inter (V3 3.6). Its own variable takes ours.
 */
export const STAGE_TYPE = "[--lk-font-family:var(--font-sans)]"

/** How long a disconnect before connecting waits for the connect's error, which says why. */
const FAILURE_WAIT_MS = 400

export function VideoConference({
  token,
  serverUrl,
  onDisconnect,
  toggleRecording,
  isAdmin,
  guest = false,
  place,
  embedded = false,
  audio = true,
  video = true,
  sessionId,
  extraStatus,
  onConnected,
  transcriptionConfig,
  onChatToggle,
  isChatOpen,
}: VideoConferenceProps) {
  const [shouldConnect, setShouldConnect] = useState(false);

  useEffect(() => {
    if (token) {
        setShouldConnect(true)
    }
  }, [token]);

  // One peer connection where this LiveKit takes it (lib/calls/onePeerConnection):
  // asked while the green room was open, so it is known by Join; the call
  // waits a second for it at most, then joins on two. The room is made only
  // once it is known (below).
  const [onePc, setOnePc] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void import("@/lib/calls/onePeerConnection")
      .then((m) => m.onePeerConnection(serverUrl))
      .catch(() => false)
      .then((yes) => live && setOnePc(yes));
    return () => {
      live = false;
    };
  }, [serverUrl]);

  // The microphone, camera and speaker picked in the green room, as the
  // room's defaults, with adaptive stream and dynacast (roomOptions).
  const [prefs] = useState(() => (typeof window === "undefined" ? {} : readDevicePrefs()));
  const options = useMemo(() => callRoomOptions(prefs, undefined, !!onePc), [prefs, onePc]);
  // The choice at Join, held for the call: published once, when connected.
  const [initial] = useState(() => ({ audio, video }));

  // Why this person is being removed, when the server says so first.
  const removalRef = useRef<CallRemoval | null>(null);
  // Who ended the call for everyone, when the server says so first: null
  // says it was ended with no name, undefined that it wasn't.
  const endedByRef = useRef<string | null | undefined>(undefined);
  // A call that never connected is a failure, never "You left the call · 1
  // min" (CALL-BUG-23): connected is set only when LiveKit says so, and the
  // end is reported once, whichever of the error and the disconnect comes first.
  const connectedRef = useRef(false);
  const errorRef = useRef<unknown>(null);
  const reportedRef = useRef(false);
  const report = useCallback(
    (end?: CallEnd) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onDisconnect?.(end);
    },
    [onDisconnect],
  );
  const handleConnected = useCallback(() => {
    connectedRef.current = true;
    onConnected?.();
  }, [onConnected]);
  const handleDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) report({ removed: removalRef.current ?? { reason: "unknown" } });
      // The room went from under everyone: someone running it ended it.
      else if (reason === DisconnectReason.ROOM_DELETED && connectedRef.current) report({ removed: { reason: "ended", by: endedByRef.current ?? undefined } });
      // LiveKit says "disconnected" before the failed connect's error arrives
      // (a refused token read as the network): give the error a moment.
      else if (!connectedRef.current) window.setTimeout(() => report({ failed: connectFailureOf(errorRef.current, reason) }), FAILURE_WAIT_MS);
      else report();
    },
    [report],
  );
  // A connection refused or unreachable before it ever connected. A connect
  // cancelled because the person left first is not a failure: and their own
  // Leave goes through report too, so nothing said after it is shown.
  const handleError = useCallback(
    (e: Error) => {
      errorRef.current = e;
      const cancelled = (e as { reason?: number }).reason === 3 /* ConnectionErrorReason.Cancelled */;
      if (!connectedRef.current && !cancelled) report({ failed: connectFailureOf(e) });
    },
    [report],
  );

  // The room is made once, with its options settled: a change of options
  // makes LiveKit's room anew, and a room already connecting would join and
  // leave the call before the new one joined (one join, then a leave, for
  // the people in it to see).
  if (!token || onePc === undefined) {
    return <CallConnecting place={place} embedded={embedded} />;
  }

  return (
    <div
      className={`dark @container relative w-full overflow-hidden bg-[#0B0C0E] text-foreground before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(700px_480px_at_-80px_-100px,rgb(var(--glow)/0.10),transparent_68%)] ${STAGE_TYPE} ${embedded ? "h-full" : "h-full md:h-dvh"}`}
      data-lk-theme="default"
      data-call-stage=""
    >
      <LiveKitRoom
        // Nothing is turned on by LiveKit itself: the green room's choice is
        // published once connected (usePublishChoice), each device on its
        // own, so a refusal can name the device.
        audio={false}
        video={false}
        options={options}
        token={token}
        serverUrl={serverUrl}
        onDisconnected={handleDisconnected}
        onError={handleError}
        onConnected={handleConnected}
        connect={shouldConnect}
        className="h-full w-full"
      >
        <LayoutContextProvider>
            <MyVideoConference
              onDisconnect={report}
              parentToggleRecording={toggleRecording}
              isAdmin={isAdmin}
              guest={guest}
              place={place}
              initial={initial}
              sessionId={sessionId}
              removalRef={removalRef}
              endedByRef={endedByRef}
              extraStatus={extraStatus}
              config={transcriptionConfig}
              onChatToggle={onChatToggle}
              isChatOpen={isChatOpen}
            />
            <RoomAudioRenderer />
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

/**
 * The green room's choice, published once the call is connected: the
 * microphone and the camera each on their own, so a refusal says which and
 * why (CALL-BUG-1). Off means off: nothing is opened. In a call whose hosts
 * have people join muted, the microphone stays off and you are told so, with
 * Unmute to press: the people running it set it, never the server's hand on
 * your microphone.
 */
export function usePublishChoice(room: Room, connected: boolean, initial: { audio: boolean; video: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !connected) return;
    done.current = true;
    const lp = room.localParticipant;
    const { role } = partOf(lp.attributes);
    const runsIt = role === "host" || role === "cohost";
    const joinMuted = initial.audio && readCallMetadata(room.metadata).muteOnEntry && !runsIt;
    if (initial.audio && !joinMuted) lp.setMicrophoneEnabled(true).catch((e: unknown) => showCallFailure(callMediaFailure("microphone", e)));
    if (joinMuted) {
      callToast({ title: "You joined muted", description: "The people running this call have everyone join muted. Unmute when you want to speak." });
    }
    if (initial.video) lp.setCameraEnabled(true).catch((e: unknown) => showCallFailure(callMediaFailure("camera", e)));
  }, [room, connected, initial]);
}

/** The room's metadata as the call's state: recording and captions, kept current. */
function useCallMetadata(room: Room): CallMetadata {
  const [meta, setMeta] = useState(() => readCallMetadata(room.metadata));
  useEffect(() => {
    const update = () => setMeta(readCallMetadata(room.metadata));
    update();
    room.on(RoomEvent.RoomMetadataChanged, update);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, update);
    };
  }, [room]);
  return meta;
}

/** The server's word on why this person is being removed, kept for when the call drops. */
function useRemovalNotice(room: Room, removalRef: MutableRefObject<CallRemoval | null>) {
  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
      if (topic !== CALL_TOPIC) return;
      const removal = readRemovalPacket(payload, participant);
      if (removal) removalRef.current = removal;
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, removalRef]);
}

function MyVideoConference({
  onDisconnect,
  parentToggleRecording,
  isAdmin,
  guest = false,
  place,
  initial,
  sessionId,
  removalRef,
  endedByRef,
  extraStatus,
  config = {},
  onChatToggle,
  isChatOpen,
}: {
  onDisconnect?: (end?: CallEnd) => void;
  parentToggleRecording?: (isRecording: boolean) => Promise<unknown> | void;
  isAdmin: boolean;
  guest?: boolean;
  place?: string;
  initial: { audio: boolean; video: boolean };
  sessionId?: string;
  removalRef: MutableRefObject<CallRemoval | null>;
  endedByRef: MutableRefObject<string | null | undefined>;
  extraStatus?: ReactNode;
  config?: CallTranscriptionConfig;
  onChatToggle?: () => void;
  isChatOpen?: boolean;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  ).filter(t => t.participant.identity !== 'transcriber-bot');

  const room = useRoomContext();
  // The call's state, from the room's metadata (the server writes it):
  // whether it is recorded, captioned, locked, and who is in the spotlight
  // (callState).
  const meta = useCallMetadata(room);

  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [focusedTrack, setFocusedTrack] = useState<TrackReferenceOrPlaceholder | null>(null);
  const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);

  // Use a stable ID to prevent re-triggering effect on every render or manual focus change
  const screenShareId = screenShareTrack ? `${screenShareTrack.participant.identity}-${screenShareTrack.source}` : undefined;

  const { localParticipant } = useLocalParticipant();
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

  // Krisp Noise Filter is NOT supported on self-hosted LiveKit (requires
  // LiveKit Cloud): enabling it causes 404 errors on /settings. LiveKit's own
  // noise suppression and voice isolation run instead (roomOptions).

  useEffect(() => {
    if (screenShareTrack) {
        setFocusedTrack(screenShareTrack);
        setLayout('speaker');
    } else {
        setFocusedTrack(prev => (prev?.source === Track.Source.ScreenShare ? null : prev));
        // Don't auto-switch back to grid, let user decide or stay in speaker if they want
    }
  }, [screenShareId]);

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

  // Whoever the people running the call put in the spotlight is everyone's
  // stage, unless a screen is being shared or you pinned someone yourself.
  const spotlightIdentity = meta.spotlight?.identity;
  const spotlightTrack = !screenShareTrack && spotlightIdentity
    ? tracks.find((t) => t.participant.identity === spotlightIdentity && t.source === Track.Source.Camera) ?? null
    : null;
  useEffect(() => {
    if (spotlightIdentity) setLayout('speaker');
  }, [spotlightIdentity]);

  const effectiveFocusedTrack = focusedTrack ||
                                spotlightTrack ||
                                autoSelection ||
                                (tracks.length > 0 ? tracks[0] : null);

  const connection = useConnectionState(room);
  const reconnecting = connection === ConnectionState.Reconnecting;
  usePublishChoice(room, connection === ConnectionState.Connected, initial);
  useRemovalNotice(room, removalRef);

  const isRecording = meta.recording.on;
  // When this screen first saw the recording on, for the pill's clock.
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  useEffect(() => {
    setRecordingSince((was) => (isRecording ? (was ?? Date.now()) : null));
  }, [isRecording]);

  // --- Captions: one switch for the whole call (CALL-BUG-2) ---
  const transcription = meta.transcription;
  const confirm = useConfirm();
  // Each time captions come on is a session of its own: its notice, and
  // everyone's overlay shown again.
  const session = transcription.on ? (transcription.since ?? 0) : null;
  const iTurnedThemOn = !!transcription.byId && transcription.byId === localParticipant.identity;
  const [noticeDismissed, setNoticeDismissed] = useState<number | null>(null);
  const noticeOpen = session !== null && !iTurnedThemOn && noticeDismissed !== session;
  // Set after the notice has rendered: nothing this person says is sent
  // before they have been shown where it goes.
  const [seenSession, setSeenSession] = useState<number | null>(null);
  useEffect(() => {
    setSeenSession(session);
  }, [session]);
  // "Stop captioning me": this person's own browser stops listening.
  const [notMe, setNotMe] = useState(false);
  const [captionsHidden, setCaptionsHidden] = useState(false);
  useEffect(() => {
    if (session !== null) setCaptionsHidden(false);
  }, [session]);
  const where = transcription.where ?? config.where ?? (config.mode === "frontend" ? "browser" : undefined);
  const browserCaptions = where === "browser";
  const keepsTranscript = transcription.on ? transcription.kept !== false : !room.name.startsWith("meet-");
  const recogniserActive = !guest && session !== null && seenSession === session && !notMe && browserCaptions;
  const showCaptions = transcription.on && !captionsHidden;

  const switchCaptions = useCallback(
    async (on: boolean) => {
      try {
        await setCallTranscription(room.name, on);
      } catch (e) {
        const code = apiErrorCode(e);
        throw new Error(
          code === "transcription_disabled"
            ? "Captions are turned off for this workspace. An admin can turn them on under Call transcription."
            : code === "not_in_call"
              ? "You aren't connected to the call yet. Try again in a moment."
              : apiErrorMessage(e, "Captions didn't change. Try again."),
        );
      }
    },
    [room],
  );
  const onCaptions = () => {
    if (transcription.on) {
      setCaptionsHidden((hidden) => !hidden);
      return;
    }
    if (guest) return;
    // Deliberate: the person turning them on reads first what it means for
    // everyone, and where everyone's speech goes.
    confirm({
      title: "Turn on captions for everyone?",
      description: captionsConfirmText({ where, kept: keepsTranscript }),
      confirmText: "Turn on captions",
      onConfirm: () => switchCaptions(true),
    });
  };
  const turnCaptionsOff = () => {
    switchCaptions(false).catch((e: Error) => showCallFailure({ title: "Couldn't turn captions off", description: e.message }));
  };
  const captionsAvailable = transcription.on || (!guest && config.mode !== "off");

  // Why no captions are appearing, so switching them on never leaves the user
  // staring at an empty screen wondering whether the feature is broken.
  const [captionState, setCaptionState] = useState<TranscriberState>({ status: "starting" });
  // One side column at a time: the in-call AI, who is in the call, or backgrounds and sound.
  const [side, setSide] = useState<"ai" | "people" | "effects" | null>(null);
  const aiPanelOpen = side === "ai";
  const peopleOpen = side === "people";
  const effectsOpen = side === "effects";
  const toggleSide = useCallback((which: "ai" | "people" | "effects") => setSide((s) => (s === which ? null : which)), []);
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
  // State for active transcripts: map participantIdentity -> { accumulated, lastFinalId, name, lastUpdate }
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
        // The speaker is whoever LiveKit says sent it; only the agent
        // speaks for others (lib/calls/signals). A packet once named anyone.
        const line = readCaption(payload, participant, topic);
        if (line) handleTranscript(line);
      };
  
      room.on(RoomEvent.DataReceived, onDataReceived);
      return () => {
          room.off(RoomEvent.DataReceived, onDataReceived);
      };
    }, [room, showCaptions]);

  // Multiplayer in-call AI agent — owns the shared Q&A conversation and the
  // LiveKit data-channel broadcast, so the conversation survives the panel
  // being closed and every participant sees the same answers.
  const inCallAgent = useInCallAgent(room.name, getTranscriptBuffer);

  // Who is in the call, and the reactions on the stage (step 3, part 2).
  const people = useCallPeople();
  const reactions = useCallReactions(room);

  // Unread indicator: count exchanges that arrived while the panel was closed
  // so we can badge the AI button (and clear it when the panel opens).
  const [aiSeenCount, setAiSeenCount] = useState(0);
  useEffect(() => {
    if (aiPanelOpen) setAiSeenCount(inCallAgent.items.length);
  }, [aiPanelOpen, inCallAgent.items.length]);
  const aiUnread = aiPanelOpen ? 0 : Math.max(0, inCallAgent.items.length - aiSeenCount);

  const [isRecordingActionLoading, setIsRecordingActionLoading] = useState(false);

  // A refusal is said, not swallowed: the button used to spin for a second
  // and go back as if nothing had been asked.
  const toggleRecording = async () => {
      if (isRecordingActionLoading || !parentToggleRecording) return;

      setIsRecordingActionLoading(true);
      try {
          await parentToggleRecording(isRecording);
          // Wait a bit for metadata to propagate
          await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
          showCallFailure({
              title: isRecording ? "Couldn't stop the recording" : "Couldn't start the recording",
              description: apiErrorMessage(e, "Try again in a moment."),
          });
      } finally {
          setIsRecordingActionLoading(false);
      }
  };

  // Running the call (Call Control): your part as the server told the room,
  // and what you may do to the others and to the call. A guest runs nothing.
  const myPart = useCallPart(localParticipant);
  const hosting = useHostActions(guest ? undefined : sessionId);
  useControlNotices(room, endedByRef);
  const me = useMemo(
    () => (hosting.enabled ? { ...myPart, identity: localParticipant.identity } : undefined),
    [hosting.enabled, myPart, localParticipant.identity],
  );
  const spotlit = meta.spotlight?.identity;
  const actionsFor = useCallback((p: Participant) => (me ? personActions(me, targetOf(p), spotlit) : []), [me, spotlit]);
  const onAction = useCallback(
    (a: PersonAction, p?: Participant) => {
      const t = p ? targetOf(p) : undefined;
      hosting.run(a, t ? { identity: t.identity, name: t.name, guest: t.guest } : undefined);
    },
    [hosting],
  );
  const tileActions = me ? { actionsFor, onAction: (a: PersonAction, p: Participant) => onAction(a, p) } : {};

  // How long this screen has been in the call, for the place pill.
  const [joinedAt] = useState(() => Date.now());

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
  // A member in browser mode chooses for their own voice; a guest has no recogniser to stop.
  const captioningMe = !guest && browserCaptions ? !notMe : undefined;
  const toggleMe = !guest && browserCaptions ? () => setNotMe((v) => !v) : undefined;

  return (
    <div className="relative flex h-full w-full flex-col">
        <PlacePill place={place} since={joinedAt} />
        <CallStatusRow>
            {extraStatus}
            {isRecording && <RecordingPill by={meta.recording.by ?? null} since={recordingSince} />}
            {meta.locked && <LockedPill by={meta.locked.by} />}
            {transcription.on && (
                <CaptionsPill
                    transcription={transcription}
                    captioningMe={captioningMe}
                    onToggleMe={toggleMe}
                    onTurnOff={guest ? undefined : turnCaptionsOff}
                />
            )}
        </CallStatusRow>
        {(reconnecting || noticeOpen) && (
            <div className="pointer-events-none absolute inset-x-3 top-12 z-30 flex flex-col items-center gap-2">
                {reconnecting && <CallReconnecting inline />}
                {noticeOpen && (
                    <CaptionsNotice
                        transcription={transcription}
                        onDismiss={() => setNoticeDismissed(session)}
                        captioningMe={captioningMe}
                        onToggleMe={toggleMe}
                    />
                )}
            </div>
        )}

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
                            {...tileActions}
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
                            <StageTile onParticipantClick={onParticipantClick} {...tileActions} />
                        </GridLayout>
                    </div>
            )}

            {/* Captions, read out as they change. */}
            {showCaptions && (
                <CaptionsOverlay
                    idleMessage={captionMessage(captionState, { notMe, browser: browserCaptions, guest })}
                    entries={Object.entries(activeTranscripts).map(([identity, data]) => ({ identity, name: data.name, text: data.accumulated || "" }))}
                />
            )}

            <FloatingReactions reactions={reactions.shown} />

            {peopleOpen && (
                <div className="absolute inset-0 z-30 @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <CallPeoplePanel
                        people={people}
                        onClose={() => setSide(null)}
                        me={me}
                        spotlit={spotlit}
                        settings={{ locked: !!meta.locked, muteOnEntry: meta.muteOnEntry }}
                        onAction={(a, p) => onAction(a, p?.participant)}
                        onMuteOnEntry={(on) => void hosting.setMuteOnEntry(on)}
                    />
                </div>
            )}

            <CallEffects room={room} open={effectsOpen} onClose={() => setSide(null)} />

            {/* In-Call AI Assistant side panel. On desktop it docks to the
                right as a flex sibling (shrinking the video area); on mobile it
                overlays full-screen. */}
            {aiPanelOpen && !guest && (
                <div className="absolute inset-0 z-30 @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <InCallAIPanel
                        items={inCallAgent.items}
                        isStreaming={inCallAgent.isStreaming}
                        onAsk={inCallAgent.ask}
                        onCancel={inCallAgent.cancel}
                        onClose={() => setSide(null)}
                    />
                </div>
            )}
        </div>
        <VideoControls
            onDisconnect={onDisconnect ? () => onDisconnect() : undefined}
            layout={layout}
            onLayoutChange={(newLayout) => {
                setLayout(newLayout);
            }}
            onToggleRecording={isAdmin && parentToggleRecording ? toggleRecording : undefined}
            isRecording={isRecording}
            isRecordingLoading={isRecordingActionLoading}
            recordingSince={recordingSince}
            onToggleCaptions={captionsAvailable ? onCaptions : undefined}
            showCaptions={showCaptions}
            captionsOff={!transcription.on}
            onToggleAI={guest ? undefined : () => toggleSide("ai")}
            isAIOpen={aiPanelOpen}
            aiUnreadCount={aiUnread}
            people={{ count: people.length, open: peopleOpen, onToggle: () => toggleSide("people") }}
            effects={{ open: effectsOpen, onToggle: () => toggleSide("effects") }}
            onReact={reactions.send}
            onChatToggle={onChatToggle}
            isChatOpen={isChatOpen}
            onEndForAll={me?.can.has("end") ? hosting.endForEveryone : undefined}
        />
        {!guest && (
            <FrontendTranscriber
                onTranscript={handleTranscript}
                onStatus={setCaptionState}
                active={recogniserActive}
                persist={keepsTranscript}
                language={speechLanguage(config.language)}
            />
        )}
    </div>
  );
}

// What to tell the user while the caption overlay has nothing to show. Every
// one of these used to render as an empty box, which is indistinguishable from
// a broken feature, and the recognizer errors were only visible in devtools.
export function captionMessage(state: TranscriberState, ctx: { notMe?: boolean; browser?: boolean; guest?: boolean } = {}): string {
    if (ctx.notMe) return "Your own speech isn't being captioned. Everyone else's appears here.";
    // The server transcribes (or this is a guest, who never runs a recogniser).
    if (ctx.guest || ctx.browser === false) return "Listening for speech…";
    switch (state.status) {
        case "disabled":
            return "Captions are turned off for this workspace.";
        case "unsupported":
            return "This browser can't caption what you say: Chrome or Edge can. Everyone else's speech still appears here.";
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
