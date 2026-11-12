"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useConnectionState,
  LayoutContextProvider,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track, RoomEvent, RemoteParticipant, DataPacket_Kind, ConnectionState, DisconnectReason, type Participant, type Room, type LocalTrackPublication } from "livekit-client";
import { takeBoardHandoff } from "@/lib/calls/boardHandoff";
import { isLive, type GreenRoomTracks } from "./greenRoomHandOver";
import { liveKitCamera, liveKitMic } from "./greenRoomLiveKit";
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, type CSSProperties, type ComponentType, type MutableRefObject, type ReactNode } from "react";
import { VideoControls, showCallFailure } from "./VideoControls";
import type { Knock } from "@/lib/calls/lobby";
import type { InBreakout } from "@/lib/calls/breakouts";
import { panelPeople } from "@/lib/calls/breakoutRooms";
import { CallConnecting, CallReconnecting, CallStatusRow, CAPTIONS_BOTTOM, CaptionsOverlay, CaptionsPill, LockedPill, PlacePill, RecordingPill, TOP_ROW_END } from "./CallStage";
import { CaptionsNotice } from "./CallNotice";
import { StageTile } from "./StageTile";
import { captureTiles, flipTiles, type TileRects } from "./stageMotion";
import { PLACE_FOCUS, STAGE_PLACE, StageFocus, StageGrid, StageMore, useContentBox } from "./StageGrid";
import CallerRinging, { CallerRingPlace, RING_PLACE, useCallerRing } from "./CallerRinging";
import { boardKey, presentationOrder, roomStageLayout, stageKey, type StageKey } from "@/lib/calls/stageLayout";
import { useCallMetadata, useCallPart, useStageSpeaker } from "./stageTracks";
import { readDevicePrefs } from "./callDevices";
import { callRoomOptions } from "./roomOptions";
import { callMediaFailure, connectFailureOf, type ConnectFailure } from "./callErrors";
import {
  CALL_TOPIC,
  captionsConfirmText,
  readCallMetadata,
  readRemovalPacket,
  speechLanguage,
  type CallRemoval,
} from "./callState";
import { FrontendTranscriber, type TranscriberState } from "./FrontendTranscriber";
import { InCallAIPanel } from "./InCallAIPanel";
import { RecordingNotice, recordingConfirm, sameRecording, seenAfter } from "./RecordingNotice";
import dynamic from "next/dynamic";

// Backgrounds and sound, a piece of its own: the effects chosen on this device,
// put on as the camera and microphone publish, and the panel. None of a
// call's first load.
const CallEffects = dynamic(() => import("@/components/call/effects/CallEffects"), { ssr: false });
// Who is in the call, with the host's tools, loaded when People is first opened.
const CallPeoplePanel = dynamic(() => import("./CallPeoplePanel"), { ssr: false });
// The call's chat (CALLS-3b), loaded when Chat is first opened.
const CallChatPanel = dynamic(() => import("./CallChatPanel"), { ssr: false });
const CallActivitiesPanel = dynamic(() => import("./CallActivitiesPanel"), { ssr: false });
const CallBreakoutsPanel = dynamic(() => import("./CallBreakoutsPanel"), { ssr: false });
const CallBreakoutBar = dynamic(() => import("./CallBreakoutBar"), { ssr: false });
// The board on the stage (calls package B): its picker and its canvas, each
// loaded when first wanted, so no call route's first load carries a board.
const BoardPicker = dynamic(() => import("@/components/board/boardPicker"), { ssr: false });
const CallBoardStage = dynamic(() => import("./CallBoardStage"), { ssr: false });
const CallGuestBoardStage = dynamic(() => import("./CallGuestBoardStage"), { ssr: false });
import { callThreadTargetOf } from "@/lib/calls/callThread";
import { useCallPeople } from "./callPeople";
import { useKeptThroughMoves, type KeptThroughMoves } from "./keptThroughMoves";
import { FloatingReactions, useCallReactions } from "./callReactions";
import { targetOf, useControlNotices, useHostActions, useKnockBar } from "./callHosting";
import { useActivitiesLight } from "./useActivitiesLight";
import { qualityKey, useQualityVerdicts } from "./callQualityNotes";
import { useHands } from "./useHands";
import { useCallAnnouncements } from "./useCallAnnouncements";
import { HandsQueueContext } from "./handsQueue";
import { CallSelfContext, callSelfOf } from "./callSelf";
import { isCompanion, stageTracksOf } from "@/lib/calls/companion";
import { SHARE_PUBLISH } from "@/lib/calls/shareCapture";
// Who waits to join, above the dock (CALLS-2): loaded with the first knock.
const KnockBar = dynamic(() => import("./KnockBar").then((m) => m.KnockBar), { ssr: false });
import { useInCallAgent } from "./useInCallAgent";
import { hearingOf } from "./inCallHearing";
import { cn } from "@/lib/utils/helpers/cn"
import { readCaption } from "@/lib/calls/signals"
import { boardControls, heldFor, partOf, personActions, runsCall, type PersonAction } from "@/lib/calls/control"
import { joinHeldNotice, mayPublish } from "./callHolds"
import { useConfirm } from "@/hooks/useConfirm"
import { callToast, STAGE_INSET } from "./callSurface"
import { useRootPlace } from "./rootPlace"
import { useTellHeight } from "@/hooks/useTellHeight"
import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"
import { setCallTranscription } from "@/services/callControlService"
import { connectedRoomName, NOT_CONNECTED_YET } from "./connectedRoom"
import { CallInkContext, ShareInk, useCallInk } from "./callInk"
import { useCallHues } from "./callHues"
import { StoreProvider } from "@/components/providers/StoreProvider"

/**
 * How a call ended for this screen. Leaving says nothing; being removed says
 * why, when the server did; a call that never connected says which kind of
 * failure kept it out (CALL-BUG-23).
 */
export interface CallEnd {
  removed?: CallRemoval;
  failed?: ConnectFailure;
  /** The call went to another device of theirs (Switch here there, meet-04): LiveKit's DUPLICATE_IDENTITY. */
  moved?: true;
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
  // In by a call's invite (calls HU13): a member, but nothing of the
  // conversation reaches them, so no assistant (it reads the conversation).
  inviteOnly?: boolean;
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
   * The camera and microphone the green room handed over at Join
   * (greenRoomHandOver): the call sends them as they are, so Join asks the
   * browser for nothing more and the camera's light never goes off and on.
   */
  tracks?: GreenRoomTracks;
  /**
   * Present only (meet-04): the screen picked in the green room's press, sent
   * once connected; the call ends when it stops. A companion's call only.
   */
  screen?: MediaStream;
  /** A companion's mode beside the place pill: the member pages' lazy part. */
  companionMode?: ComponentType<{ present: boolean }>;
  /**
   * The call's id in Call State, for what whoever runs it does to it (Call
   * Control). A guest's call has none: a guest runs nothing.
   */
  sessionId?: string;
  /**
   * Who waits in the lobby (CALLS-2), from the call's read (useCallSession's
   * waiting), for whoever may let them in. Required, so no page that mounts
   * the call can leave it out (V-82: the member door did, and an event
   * call's organiser never saw anyone waiting). A guest, who lets nobody
   * in, passes undefined.
   */
  lobby: Knock[] | undefined;
  /** Controls of the page's own beside the call's status pills: its Invite, which People offers at its head too. */
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
 * Speaker and grid draw in one frame (hub.md C4): 12px round the tiles
 * (STAGE_INSET), the pills' 48px clear at the top, and the dock kept clear at the bottom (the
 * phone's full-width bar, 84px for the floating dock). Speaker and grid used
 * different insets once, so every tile moved 8px on a switch. At every width
 * the tiles, or what's presented, also end above the captions
 * (--call-captions-room), so they never cover a name: on a wide stage the
 * fourth of four tiles has its name mid-stage, where the captions are.
 */
export const STAGE_FRAME =
  `${STAGE_INSET} pt-12 pb-[max(6rem,var(--call-captions-room,0px))] @3xl:pb-[max(84px,var(--call-captions-room,0px))] @7xl:pb-[max(100px,var(--call-captions-room,0px))]`

/** A track's place on the stage, as its tile's data-flip-key (stageLayout). */
const trackKey = (t: TrackReferenceOrPlaceholder) => stageKey(t.participant.identity, t.source);
/** How far the tiles end from the window's right edge: an open side column's width. */
const stageRight = (box: DOMRect) => window.innerWidth - box.right
/** How far the stage ends above the window's foot (the captions' floor). */
const stageFoot = (box: DOMRect) => window.innerHeight - box.bottom
/** The tallest the captions have been while on, so the tiles step up once, not with each line or pause. Pure. */
export const captionsHigh = (high: number, px: number) => (px > 0 ? Math.max(high, Math.round(px)) : 0)
/** Where the stage's top row (its pills) ends on the page. */
const topRowEnd = (box: DOMRect) => box.top + TOP_ROW_END

/**
 * The app's face on the stage. LiveKit's theme sets the system UI font on
 * everything under data-lk-theme, so names, the place pill, the dock and the
 * in-call AI panel were drawn in the system face, the only place in the app
 * that is not Inter (V3 3.6). Its own variable takes ours.
 */
export const STAGE_TYPE = "[--lk-font-family:var(--font-sans)]"

/** Nobody waiting to join, for the announcer. */
const NO_KNOCKS: Knock[] = [];

/** How long an end waits for the word on why: a failed connect's error, a share hold's permission. */
const FAILURE_WAIT_MS = 400

/**
 * The call. It reads the app's store (useConfirm), which a guest's call page
 * (r/[slug], guest/m) doesn't have: the call brings it (StoreProvider).
 */
export function VideoConference(props: VideoConferenceProps) {
  return (
    <StoreProvider>
      <Conference {...props} />
    </StoreProvider>
  );
}

function Conference({
  token,
  serverUrl,
  onDisconnect,
  toggleRecording,
  isAdmin,
  guest = false,
  inviteOnly = false,
  place,
  embedded = false,
  audio = true,
  video = true,
  tracks,
  screen,
  companionMode: Mode,
  sessionId,
  lobby,
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
  // The handed tracks go with the first room only: a move's room opens its own.
  const [initial, setInitial] = useState<PublishChoice>(() => ({ audio, video, tracks }));
  // What a move to or from a breakout room keeps: the call's clock, the
  // captions choices, and everyone seen in the call (keptThroughMoves).
  const kept = useKeptThroughMoves();
  // The breakout room you're in (calls package C), with your mic and camera.
  const [hop, setHop] = useState<(InBreakout & { token: string }) | null>(null);
  // Who the call's token says you are: your own tile shows it until LiveKit names your part (callSelf).
  const roomToken = hop?.token ?? token;
  const self = useMemo(() => callSelfOf(roomToken), [roomToken]);
  // Another device of someone in the call (meet-04), as the server named it:
  // no microphone, camera or sound (the server's grant leaves the first two out).
  const companion = isCompanion(self?.identity);
  // Each room's own disconnect is told apart by its generation: the room a
  // move leaves says nothing, while the room you're in reports as ever.
  const genRef = useRef(0);
  const [gen, setGen] = useState(0);
  const onHop = useCallback((to: (InBreakout & { token: string }) | null, carry: { audio: boolean; video: boolean }) => {
    genRef.current += 1;
    setGen(genRef.current);
    setInitial(carry);
    setHop(to);
  }, []);

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
      // Switch here on another device of theirs: this one says so, and never joins again by itself.
      else if (reason === DisconnectReason.DUPLICATE_IDENTITY) report({ moved: true });
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
      data-work-surface={embedded ? undefined : ""}
    >
      <LiveKitRoom
        key={gen}
        // Nothing is turned on by LiveKit itself: the green room's choice is
        // published once connected (usePublishChoice), each device on its
        // own, so a refusal can name the device.
        audio={false}
        video={false}
        options={options}
        token={roomToken}
        serverUrl={serverUrl}
        onDisconnected={(reason?: DisconnectReason) => gen === genRef.current && handleDisconnected(reason)}
        onError={handleError}
        onConnected={handleConnected}
        connect={shouldConnect}
        className="h-full w-full"
      >
        <CallSelfContext.Provider value={self}>
        <LayoutContextProvider>
            <MyVideoConference
              onDisconnect={report}
              parentToggleRecording={toggleRecording}
              isAdmin={isAdmin}
              guest={guest}
              inviteOnly={inviteOnly}
              place={place}
              initial={initial}
              sessionId={sessionId}
              callToken={guest ? token : undefined}
              lobby={lobby}
              removalRef={removalRef}
              endedByRef={endedByRef}
              extraStatus={extraStatus}
              config={transcriptionConfig}
              onChatToggle={onChatToggle}
              isChatOpen={isChatOpen}
              inRoom={hop}
              onHop={onHop}
              kept={kept}
              companion={companion}
              screen={screen}
              mode={companion && Mode ? <Mode present={!!screen} /> : null}
            />
            {companion ? null : <RoomAudioRenderer />}
        </LayoutContextProvider>
        </CallSelfContext.Provider>
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
 * your microphone. What the call holds for you (meet-12) isn't tried: your
 * permission from the call server already leaves it out, before the room has
 * been told your part, and you're told why.
 */
/** The green room's choice for the call, with the tracks it handed over, if any. */
export interface PublishChoice {
  audio: boolean;
  video: boolean;
  tracks?: GreenRoomTracks;
}

export function usePublishChoice(room: Room, connected: boolean, initial: PublishChoice) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !connected) return;
    done.current = true;
    const lp = room.localParticipant;
    const runsIt = runsCall(partOf(lp.attributes).role);
    const micHeld = initial.audio && !mayPublish(lp.permissions, Track.sourceToProto(Track.Source.Microphone));
    const cameraHeld = initial.video && !mayPublish(lp.permissions, Track.sourceToProto(Track.Source.Camera));
    const joinMuted = initial.audio && !micHeld && readCallMetadata(room.metadata).muteOnEntry && !runsIt;
    // What the green room handed over and is still open is sent as it is
    // (greenRoomHandOver); otherwise the call opens its own, as before.
    const { camera, mic } = initial.tracks ?? {};
    const sendMic = initial.audio && !micHeld && !joinMuted;
    const sendCamera = initial.video && !cameraHeld;
    if (sendMic) {
      const on = mic && isLive(mic.track) ? lp.publishTrack(liveKitMic(mic.track, mic.constraints), { source: Track.Source.Microphone }) : lp.setMicrophoneEnabled(true);
      on.catch((e: unknown) => {
        mic?.track.stop();
        showCallFailure(callMediaFailure("microphone", e));
      });
    } else mic?.track.stop();
    if (joinMuted) {
      callToast({ title: "You joined muted", description: "The people running this call have everyone join muted. Unmute when you want to speak." });
    }
    if (micHeld || cameraHeld) callToast({ ...joinHeldNotice(micHeld, cameraHeld), tone: "info" });
    if (sendCamera) {
      const handed = camera && isLive(camera.track) ? (camera.liveKit ?? liveKitCamera(camera.track, camera.constraints)) : undefined;
      const on = handed ? lp.publishTrack(handed, { source: Track.Source.Camera }) : lp.setCameraEnabled(true);
      on.catch((e: unknown) => {
        handed?.stop();
        showCallFailure(callMediaFailure("camera", e));
      });
    } else {
      camera?.liveKit?.stop();
      camera?.track.stop();
    }
  }, [room, connected, initial]);
}

/**
 * Present only (meet-04): the screen picked in the green room's press, sent
 * once connected as the call's screen share, a tab's sound with it. The call
 * ends when the share stops (the browser's bar, the dock). A share hold, at
 * joining or put on later, has no attendee to let through: it says why.
 */
function usePresentOnly(room: Room, connected: boolean, screen: MediaStream | undefined, end: ((e?: CallEnd) => void) | undefined) {
  const endRef = useRef(end);
  endRef.current = end;
  const sent = useRef(false);
  useEffect(() => {
    if (!screen || !connected) return;
    const lp = room.localParticipant;
    const leave = () => endRef.current?.();
    const held = () => !mayPublish(lp.permissions, Track.sourceToProto(Track.Source.ScreenShare));
    const heldEnd = () => endRef.current?.({ removed: { reason: "share_held" } });
    const [video] = screen.getVideoTracks();
    if (!video || held()) {
      screen.getTracks().forEach((t) => t.stop());
      if (video) heldEnd();
      else leave();
      return;
    }
    video.addEventListener("ended", leave);
    let wait: number | undefined;
    const unpublished = (pub: LocalTrackPublication) => {
      if (pub.source !== Track.Source.ScreenShare || wait) return;
      if (held()) heldEnd();
      else wait = window.setTimeout(leave, FAILURE_WAIT_MS);
    };
    const permissions = () => {
      if (!wait || !held()) return;
      window.clearTimeout(wait);
      heldEnd();
    };
    room.on(RoomEvent.LocalTrackUnpublished, unpublished);
    room.on(RoomEvent.ParticipantPermissionsChanged, permissions);
    if (!sent.current) {
      sent.current = true;
      lp.publishTrack(video, { source: Track.Source.ScreenShare }).catch((e: unknown) => {
        showCallFailure(callMediaFailure("screen", e));
        screen.getTracks().forEach((t) => t.stop());
        leave();
      });
      for (const sound of screen.getAudioTracks()) lp.publishTrack(sound, { source: Track.Source.ScreenShareAudio, ...SHARE_PUBLISH }).catch(() => sound.stop());
    }
    return () => {
      window.clearTimeout(wait);
      video.removeEventListener("ended", leave);
      room.off(RoomEvent.LocalTrackUnpublished, unpublished);
      room.off(RoomEvent.ParticipantPermissionsChanged, permissions);
    };
  }, [room, connected, screen]);
}

/** The room's metadata as the call's state: recording and captions, kept current. */
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
  inviteOnly = false,
  place,
  initial,
  sessionId,
  callToken,
  lobby,
  removalRef,
  endedByRef,
  extraStatus,
  config = {},
  onChatToggle,
  isChatOpen,
  inRoom,
  onHop,
  kept,
  companion = false,
  screen,
  mode,
}: {
  onDisconnect?: (end?: CallEnd) => void;
  parentToggleRecording?: (isRecording: boolean) => Promise<unknown> | void;
  isAdmin: boolean;
  guest?: boolean;
  inviteOnly?: boolean;
  place?: string;
  initial: PublishChoice;
  sessionId?: string;
  /** A guest's own call token, which proves who they are for their hand and feedback. */
  callToken?: string;
  lobby?: Knock[];
  removalRef: MutableRefObject<CallRemoval | null>;
  endedByRef: MutableRefObject<string | null | undefined>;
  extraStatus?: ReactNode;
  config?: CallTranscriptionConfig;
  onChatToggle?: () => void;
  isChatOpen?: boolean;
  /** The breakout room you're in, or null in the call's main room. */
  inRoom: InBreakout | null;
  onHop: (to: (InBreakout & { token: string }) | null, carry: { audio: boolean; video: boolean }) => void;
  /** What a move keeps, held by the call around this view (keptThroughMoves). */
  kept: KeptThroughMoves;
  /** Another device of someone in the call (meet-04): no microphone, camera, captions of its own or breakout rooms. */
  companion?: boolean;
  /** Present only's screen, sent once connected (usePresentOnly). */
  screen?: MediaStream;
  mode?: ReactNode;
}) {
  const tracks = stageTracksOf(useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  ).filter(t => t.participant.identity !== 'transcriber-bot'));

  const room = useRoomContext();
  // Each person's colour in the call (V-190): a caption's name matches their tile and their ink.
  const callHue = useCallHues();
  // The call's state, from the room's metadata (the server writes it):
  // whether it is recorded, captioned, locked, and who is in the spotlight
  // (callState).
  const meta = useCallMetadata(room);

  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  // What you pinned on the stage for yourself (Stage Layout): a share or a
  // board that begins takes the stage from it.
  const [pin, setPin] = useState<StageKey | null>(null);
  // The grid's page, from 0: past the last, stageLayout shows the last.
  const [page, setPage] = useState(0);

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

  // Who speaks, held a beat before the stage follows them (stageTracks).
  const activeSpeakerTrack = useStageSpeaker(tracks);

  // Whoever the people running the call put in the spotlight is everyone's
  // stage, unless something is presented or you pinned someone yourself
  // (stageLayout).
  const spotlightIdentity = meta.spotlight?.identity;
  useEffect(() => {
    if (spotlightIdentity) setLayout('speaker');
  }, [spotlightIdentity]);

  const connection = useConnectionState(room);
  const reconnecting = connection === ConnectionState.Reconnecting;
  // A companion sends no microphone or camera, whatever the page handed in.
  const choice = useMemo(() => (companion ? { audio: false, video: false } : initial), [companion, initial]);
  usePublishChoice(room, connection === ConnectionState.Connected, choice);
  usePresentOnly(room, connection === ConnectionState.Connected, companion ? screen : undefined, onDisconnect);
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
  const { noticeDismissed, setNoticeDismissed, notMe, setNotMe, hiddenFor, setHiddenFor } = kept;
  const noticeOpen = session !== null && !iTurnedThemOn && noticeDismissed !== session;
  // Set after the notice has rendered: nothing this person says is sent
  // before they have been shown where it goes.
  const [seenSession, setSeenSession] = useState<number | null>(null);
  useEffect(() => {
    setSeenSession(session);
  }, [session]);
  // "Stop captioning me" (notMe): this person's own browser stops listening.
  // Hidden captions come back with the next session of them.
  const captionsHidden = session !== null && hiddenFor === session;
  const where = transcription.where ?? config.where ?? (config.mode === "frontend" ? "browser" : undefined);
  const browserCaptions = where === "browser";
  const keepsTranscript = transcription.on ? transcription.kept !== false : !room.name.startsWith("meet-");
  const recogniserActive = !guest && session !== null && seenSession === session && !notMe && browserCaptions;
  const showCaptions = transcription.on && !captionsHidden;

  const switchCaptions = useCallback(
    async (on: boolean) => {
      // Confirmed while the call still connects: sent once it has, and so has its name (V-30).
      const roomName = await connectedRoomName(room);
      if (!roomName) throw new Error(NOT_CONNECTED_YET);
      try {
        await setCallTranscription(roomName, on);
      } catch (e) {
        const code = apiErrorCode(e);
        throw new Error(
          code === "transcription_disabled"
            ? "Captions are turned off for this workspace. An admin can turn them on under Call transcription."
            : code === "not_in_call"
              ? NOT_CONNECTED_YET
              : apiErrorMessage(e, "Captions didn't change. Try again."),
        );
      }
    },
    [room],
  );
  const onCaptions = () => {
    if (transcription.on) {
      setHiddenFor((h) => (h === session ? null : session));
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
  // One side column at a time: the in-call AI, who is in the call, the call's chat, backgrounds and sound, or polls and Q&A.
  const [side, setSide] = useState<"ai" | "people" | "chat" | "effects" | "activities" | "breakouts" | null>(null);
  const aiPanelOpen = side === "ai";
  const peopleOpen = side === "people";
  const chatOpen = side === "chat";
  const effectsOpen = side === "effects";
  const activitiesOpen = side === "activities";
  const breakoutsOpen = side === "breakouts";
  const toggleSide = useCallback((which: "ai" | "people" | "chat" | "effects" | "activities" | "breakouts") => setSide((s) => (s === which ? null : which)), []);
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

  // What the in-call AI hears (CALLS-05): this screen's lines since it came in; or, when it came in after a
  // kept transcript began, the call's kept lines from the start, which the server reads when a question carries none.
  const [cameIn] = useState(() => Date.now());
  const hearing = hearingOf(transcription, cameIn, captionsAvailable ? onCaptions : undefined);
  const transcriptForAI = useCallback(() => (hearing.kept ? "" : getTranscriptBuffer()), [hearing.kept, getTranscriptBuffer]);
  // Multiplayer in-call AI agent — owns the shared Q&A conversation and the
  // LiveKit data-channel broadcast, so the conversation survives the panel
  // being closed and every participant sees the same answers.
  const inCallAgent = useInCallAgent(room.name, transcriptForAI);

  // Who is in the call, and the reactions on the stage (step 3, part 2).
  const people = useCallPeople();
  const reactions = useCallReactions(room);
  // Annotation on Call Signals (meet-14, zoom-03): ink over a screen someone shares, drawn on the stage.
  const ink = useCallInk(room);

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
  const { recordingSeen, setRecordingSeen } = kept;
  const toggleRecording = async (): Promise<boolean> => {
      if (isRecordingActionLoading || !parentToggleRecording) return false;

      setIsRecordingActionLoading(true);
      // Started here, from before it is asked for: the recording's metadata can reach this screen before the
      // start's answer does, and its starter is never told they started it (CALLS-07).
      const before = recordingSeen;
      if (!isRecording) setRecordingSeen({ key: "", mine: true });
      try {
          await parentToggleRecording(isRecording);
          // Wait a bit for metadata to propagate
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
      } catch (e) {
          if (!isRecording) setRecordingSeen(before);
          showCallFailure({
              title: isRecording ? "Couldn't stop the recording" : "Couldn't start the recording",
              description: apiErrorMessage(e, "Try again in a moment."),
          });
          return false;
      } finally {
          setIsRecordingActionLoading(false);
      }
  };
  // Record asks first, as captions do, and everyone else is told who started it, once per recording; whoever
  // started it isn't (it came on while their start was answering). Stop asks nothing (CALLS-07).
  const askToRecord = () => {
      if (isRecording) return void toggleRecording();
      confirm({ ...recordingConfirm(place), onConfirm: toggleRecording });
  };
  // The server writes a recording in two steps, who started it and then its egress id: what was read or started
  // here before the id landed is carried over to it, and forgotten if the recording ends first (seenAfter).
  const recordingKey = meta.recording.egressId ?? "";
  const wasRecording = useRef(isRecording);
  useEffect(() => {
      const was = wasRecording.current;
      wasRecording.current = isRecording;
      setRecordingSeen((seen) => seenAfter(seen, isRecording, was, recordingKey));
  }, [isRecording, recordingKey, setRecordingSeen]);
  const thisRecording = isRecording && sameRecording(recordingSeen, recordingKey);
  const recordingNoticeOpen = isRecording && !isRecordingActionLoading && !thisRecording;
  // Its starter reads "started by you", as Meet and Teams say it, shown and read out alike.
  const recordingBy = thisRecording && recordingSeen?.mine ? "you" : meta.recording.by;

  // Running the call (Call Control): your part as the server told the room,
  // and what you may do to the others and to the call. A guest runs nothing.
  const myPart = useCallPart(localParticipant);
  const hosting = useHostActions(guest ? undefined : sessionId);
  // The board this tab started the call from (miro-27, lib/calls/boardHandoff): once in, read once for this room
  // alone, within two minutes, and put up through Call Control, whose server checks again (a refusal is said by act).
  const inCall = connection === ConnectionState.Connected;
  const actInCall = hosting.act;
  useEffect(() => {
    if (!inCall || !hosting.enabled) return;
    const handed = takeBoardHandoff(room.name);
    if (handed) void actInCall("present_board", { board: handed });
  }, [inCall, hosting.enabled, actInCall, room.name]);
  useControlNotices(room, endedByRef);
  const me = useMemo(
    () => (hosting.enabled ? { ...myPart, identity: localParticipant.identity } : undefined),
    [hosting.enabled, myPart, localParticipant.identity],
  );
  // Breakout rooms (calls package C), for whoever may run them.
  const runsBreakouts = !!me?.can.has("breakouts");
  // Everyone seen in the call, so the rooms panel names people once they have
  // gone to a room (they are no longer in yours).
  const { seen } = kept;
  useEffect(() => {
    for (const p of people) if (!p.you) seen.set(p.identity, { identity: p.identity, name: p.name });
  }, [people, seen]);
  const breakoutPeople = useMemo(
    () => panelPeople(people.filter((p) => !p.you).map((p) => ({ identity: p.identity, name: p.name })), seen, meta.breakouts, localParticipant.identity),
    [people, seen, meta.breakouts, localParticipant.identity],
  );
  const spotlit = meta.spotlight?.identity;
  const actionsFor = useCallback((p: Participant) => (me ? personActions(me, targetOf(p), spotlit, meta.held) : []), [me, spotlit, meta.held]);
  // What the people running the call hold for you now (meet-12): your controls say why, guests' too.
  const myHeld = useMemo(() => heldFor(meta.held, myPart), [meta.held, myPart]);
  // The board on the stage (calls package B): what you may do about it, by
  // the server's own rules, and whose it is. A guest opens it through their
  // own call token, never a member's session.
  const boardOn = guest && !callToken ? undefined : meta.board;
  const boardRules = useMemo(() => (me ? boardControls(me, meta.board, meta.held) : undefined), [me, meta.board, meta.held]);
  const presenterName = meta.board ? (people.find((p) => p.identity === meta.board?.by)?.name ?? "Someone") : "";
  const guestsInCall = people.some((p) => p.guest);
  const [pickingBoard, setPickingBoard] = useState(false);
  const onAction = useCallback(
    (a: PersonAction, p?: Participant) => {
      const t = p ? targetOf(p) : undefined;
      hosting.run(a, t ? { identity: t.identity, name: t.name, guest: t.guest } : undefined);
    },
    [hosting],
  );
  const tileActions = me ? { actionsFor, onAction: (a: PersonAction, p: Participant) => onAction(a, p) } : {};
  // Who waits in the lobby, for whoever may let them in (CALLS-2).
  const knocks = me?.can.has("admit") ? lobby : undefined;
  // Each change said once to a screen reader: joins, leaves, hands, knocks, who started recording, a recording or captions stopping (meet-18).
  useCallAnnouncements(useMemo(() => ({ people, knocks: knocks ?? NO_KNOCKS, recording: isRecording, recordingBy: recordingBy === "you" ? "You" : recordingBy, captions: transcription.on }), [people, knocks, isRecording, recordingBy, transcription.on]));
  const knockBar = useKnockBar(knocks, peopleOpen);
  // The bar's height, which the stage gives up so the bar never covers a tile.
  const [knockBarHeight, setKnockBarHeight] = useState(0);
  // The room a bar over the dock takes: tiles and captions stay above it.
  const barRoom = knockBarHeight ? knockBarHeight + 8 : 0;
  // At every width the tiles end 8px above the captions, by STAGE_FRAME's room.
  const captionsBox = useRef<HTMLDivElement>(null);
  const [captionsHeight, setCaptionsHeight] = useState(0);
  const tellCaptions = useCallback((px: number) => setCaptionsHeight((high) => captionsHigh(high, px)), []);
  useTellHeight(captionsBox, tellCaptions, showCaptions);

  // Your hand and feedback (CALLS-3a): a member through their session, a
  // guest through their own call token. The queue every screen draws.
  const asker = useMemo(() => (guest ? (callToken ? { callToken } : undefined) : sessionId ? { sessionId } : undefined), [guest, callToken, sessionId]);
  // Breakout rooms: Join, pick, Back, and the server's word to move.
  const breakoutBar = (hidden: boolean) =>
    asker && !companion && (meta.breakouts || inRoom) ? (
      <CallBreakoutBar
        hidden={hidden}
        room={room}
        breakouts={meta.breakouts}
        identity={localParticipant.identity}
        runsCall={runsCall(myPart.role)}
        inRoom={inRoom}
        asker={asker}
        language={config.language}
        onHop={onHop}
        onHeight={setKnockBarHeight}
      />
    ) : null;
  // The call's chat (CALLS-3b): a conversation's call has one, for everyone in
  // it. The dock's Chat opens it; a member reaches the conversation from it.
  // Where it has none (a meeting), Chat opens the conversation as before.
  const chatTarget = useMemo(() => callThreadTargetOf({ room: room.name, guest, sessionId, callToken }), [room.name, guest, sessionId, callToken]);
  const dockChat = chatTarget ? { onToggle: () => toggleSide("chat"), open: chatOpen } : onChatToggle ? { onToggle: onChatToggle, open: !!isChatOpen } : undefined;
  const hands = useHands(localParticipant, asker);
  // Polls and Q&A (calls package A), for everyone in every call: the dock lights while its panel is shut and something new is there.
  const activitiesLit = useActivitiesLight(room, activitiesOpen, myPart.can.has("activities"));
  // Why the call stutters for each person, for whoever runs it, while People is open (calls A5).
  const quality = useQualityVerdicts(qualityKey(sessionId, peopleOpen, !!me && me.can.size > 0));
  // Call Quality Telemetry (calls A5, #56): the call's own stats, sent as
  // you; loaded once you're in it, never with the call's first load.
  useEffect(() => {
    if (!asker) return;
    let live = true;
    let stop: (() => void) | undefined;
    void import("./callQuality").then((m) => {
      if (live) stop = m.watchQuality(room, asker);
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [room, asker]);

  // How long this person has been in the call, for the place pill: from
  // their first join, whichever room they are in now.
  const joinedAt = kept.joinedAt;

  // The stage (Stage Layout, A4, #54): what is presented, in the order it
  // began, and what the stage draws of everyone in the room its frame leaves
  // (stageLayout). A share or a board that begins takes the stage from your
  // pin, and from the grid.
  const tilesRef = useRef<HTMLDivElement>(null);
  const stageBox = useContentBox(tilesRef);
  const board = boardOn ? boardKey(boardOn.uuid) : null;
  const sharing = tracks.filter((t) => t.source === Track.Source.ScreenShare).map(trackKey);
  const [presented, setPresented] = useState<StageKey[]>([]);
  const presenting = presentationOrder(presented, board ? [...sharing, board] : sharing);
  useLayoutEffect(() => {
    if (presenting.order === presented) return;
    setPresented(presenting.order);
    if (presenting.began) {
      setPin(null);
      setLayout('speaker');
    }
  }, [presenting.order, presenting.began, presented]);
  const byKey = new Map(tracks.map((t) => [trackKey(t), t]));
  // Your call ringing them (slack-06 H2), while you are alone in it: the ring has a place of its own, in the stage's
  // focus where the one you call will be, and your tile keeps one beside it, as in a call of two (DESIGN-BUILD-118 F2).
  // A board or a share put up while it rings takes the focus, and the ring keeps the strip's first place (stageLayout;
  // V-779: the ring overrode your pin, so a board call that rang a person never showed the board).
  const alone = useMemo(() => (!guest && people.every((p) => p.you) ? people.map((p) => p.identity) : null), [guest, people]);
  const ringing = useCallerRing(sessionId, alone);
  const ringPlace = ringing ? <CallerRinging shown={ringing} /> : null;
  // The room's stage, as this screen looks at it: the recording builds its own the same way (roomStageLayout). The
  // ring is this screen's own place, never the room's, so the recording leaves it out: a view's, after its pin.
  const stage = roomStageLayout(
    {
      cameras: tracks.filter((t) => t.source === Track.Source.Camera).map(trackKey),
      presenting: presenting.order,
      board,
      spotlight: spotlightIdentity,
      speaker: activeSpeakerTrack ? trackKey(activeSpeakerTrack) : null,
    },
    { pin, ring: ringing ? RING_PLACE : null, mode: layout, viewport: stageBox, page },
  );
  // A tile pressed in the grid goes on the stage, pinned; on the stage,
  // pressing your pin again lets it go.
  const show = (key: StageKey) => {
    setPin(key);
    setLayout('speaker');
  };
  const togglePin = (key: StageKey) => setPin((p) => (p === key ? null : key));
  // A place in the strip pressed puts what it shows on the stage, and what the stage held takes a place in the strip:
  // the focus follows to that place, so the next Enter swaps them back (the pressed place is gone, and the focus fell
  // to <body>: DESIGN-BUILD-127 F1b). Each strip place carries its key (data-strip-place).
  const refocus = useRef<StageKey | null>(null);
  const fromStrip = (put: () => void) => {
    refocus.current = stage.focus.keys.length === 1 ? stage.focus.keys[0] : null;
    put();
  };

  // The stage's reflow: tiles slide to their new places when the set of
  // tiles or the layout changes (stageMotion). Nothing slides into the
  // stage's first drawing, before it is measured.
  const stageRef = useRef<HTMLDivElement>(null);
  const lastRects = useRef<TileRects>(new Map());
  const measured = stageBox.w > 0 && stageBox.h > 0;
  const tileKey = `${layout}|${stage.focus.keys.join(",")}|${stage.grid?.keys.join(",") ?? ""}|${stage.strip.keys.join(",")}|${stage.strip.more}`;
  useLayoutEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    if (!measured) {
      lastRects.current = new Map();
      return;
    }
    flipTiles(stageEl, lastRects.current);
    lastRects.current = captureTiles(stageEl);
  }, [tileKey, measured]);
  useLayoutEffect(() => {
    const key = refocus.current;
    refocus.current = null;
    if (key) stageRef.current?.querySelector<HTMLElement>(`[data-strip-place="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }, [tileKey]);
  // The app's toasts stay over the stage, clear of the side column: a notice
  // covered the chat's held line at 1280 (DESIGN-BUILD-18, 26 Oct).
  useRootPlace("--call-stage-right", tilesRef, stageRight);
  useRootPlace("--call-stage-foot", stageRef, stageFoot);
  // On a phone, while a sheet covers the dock, they come in 12px under the top
  // row (app/phone.css C9): under the bar, one covered the place pill (DESIGN-BUILD-20).
  const callRef = useRef<HTMLDivElement>(null);
  useRootPlace("--call-top", callRef, topRowEnd);

  // What each place on the stage draws: a person's camera or screen, or the
  // board. A guest opens the board through their own call token.
  const boardStage = boardOn ? (
    guest && callToken ? (
      <CallGuestBoardStage
        board={boardOn}
        presenter={presenterName}
        callToken={callToken}
        me={{ identity: localParticipant.identity, name: localParticipant.name || localParticipant.identity }}
      />
    ) : (
      <CallBoardStage
        board={boardOn}
        presenter={presenterName}
        controls={boardRules ?? { present: null, stop: false, run: false, mine: false }}
        guestsInCall={guestsInCall}
        act={hosting.act}
      />
    )
  ) : null;
  // The board as a place in the strip or the grid: a button that puts it on the stage.
  const boardPlace = (className: string, style?: CSSProperties) => (
    <button
      type="button"
      key={board ?? "board"}
      style={style}
      aria-label="Show the board"
      data-strip-place={board ?? undefined}
      className={cn(STAGE_PLACE, "grid place-items-center gap-1 p-2 text-center text-ui-sm text-[#EEEEF0]", PLACE_FOCUS, className)}
      onClick={() => {
        if (board) fromStrip(() => show(board));
      }}
    >
      <span className="line-clamp-2">{presenterName}&apos;s board</span>
    </button>
  );
  const onStage = (key: StageKey) => {
    if (key === board) return boardStage;
    if (key === RING_PLACE) return ringPlace;
    const track = byKey.get(key);
    if (!track) return null;
    // A shared screen on the stage carries its ink, on the share's own frame (callInk).
    const dims = track.source === Track.Source.ScreenShare ? track.publication?.dimensions : undefined;
    const layer =
      track.source === Track.Source.ScreenShare ? (
        <CallInkContext.Provider value={ink}>
          <ShareInk share={key} name={track.participant.name || track.participant.identity} frame={dims ? { w: dims.width, h: dims.height } : undefined} />
        </CallInkContext.Provider>
      ) : undefined;
    return <StageTile trackRef={track} size="lg" contain pinned={pin === key} onPin={() => togglePin(key)} layer={layer} {...tileActions} />;
  };
  const inGrid = (key: StageKey) => {
    if (key === board) return boardPlace("h-full w-full");
    if (key === RING_PLACE) return ringPlace;
    const track = byKey.get(key);
    return track ? <StageTile trackRef={track} onParticipantClick={() => show(key)} {...tileActions} /> : null;
  };
  // The strip beside the stage's focus: whoever fits, each a button that shows
  // them (the thumbnails were clickable divs the keyboard couldn't reach),
  // then "+N", which opens the grid of everyone. Beside a board on a phone's
  // width it would leave the board two thirds of the stage and cut every
  // name: the board fills the stage there, and the people are in People
  // (DESIGN-BUILD-23, 27 Oct; stageLayout leaves that strip empty). Under a
  // share on a phone's stage the strip is a row, so the share has the stage's
  // width (stageLayout, V-233), and under a board while your call rings, so
  // the ring stays in sight (V-779).
  const stripPlace = (key: StageKey, style: CSSProperties) => {
    if (key === board) return boardPlace("shrink-0", style);
    if (key === RING_PLACE) return ringing ? <CallerRingPlace key={key} shown={ringing} tile={stage.strip.tile} style={style} onShow={() => fromStrip(() => show(RING_PLACE))} /> : null;
    const track = byKey.get(key);
    if (!track) return null;
    const name = track.participant.name || track.participant.identity;
    return (
      <button
        type="button"
        key={key}
        aria-label={track.source === Track.Source.ScreenShare ? `Show ${name}'s screen` : `Show ${name}`}
        data-strip-place={key}
        className={cn("relative shrink-0 rounded-[14px] text-left", PLACE_FOCUS)}
        style={style}
        onClick={() => fromStrip(() => togglePin(key))}
      >
        <StageTile trackRef={track} size="sm" />
      </button>
    );
  };
  const stripMore = (style: CSSProperties) => (
    <StageMore
      more={stage.strip.more}
      style={style}
      onShow={() => {
        setLayout('grid');
        setPage(0);
      }}
    />
  );
  // A member in browser mode chooses for their own voice; a guest has no recogniser to stop.
  const captioningMe = !guest && browserCaptions ? !notMe : undefined;
  const toggleMe = !guest && browserCaptions ? () => setNotMe((v) => !v) : undefined;

  const handsQueue = useMemo(() => people.filter((p) => p.hand !== null).map((p) => p.identity), [people]);
  return (
    <HandsQueueContext.Provider value={handsQueue}>
    <div ref={callRef} className="relative flex h-full w-full flex-col">
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[50%] flex-wrap gap-1.5">
            <PlacePill place={place} since={joinedAt} />
            {mode}
        </div>
        <CallStatusRow>
            {extraStatus}
            {isRecording && <RecordingPill by={recordingBy ?? null} since={recordingSince} />}
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
        {(reconnecting || recordingNoticeOpen || noticeOpen) && (
            <div className="pointer-events-none absolute inset-x-3 top-12 z-30 flex flex-col items-center gap-2">
                {reconnecting && <CallReconnecting inline />}
                {recordingNoticeOpen && (
                    <RecordingNotice by={meta.recording.by} onDismiss={() => setRecordingSeen({ key: recordingKey, mine: false })} onLeave={() => (onDisconnect ? onDisconnect() : void room.disconnect())} />
                )}
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

        {/* Said once each time who waits changes, while the bar shows it. */}
        <div ref={stageRef} className={cn("relative flex flex-1 overflow-hidden transition-opacity duration-200", reconnecting && "opacity-70")} style={{ paddingBottom: barRoom || undefined, ["--call-captions-room" as string]: captionsHeight ? `calc(${CAPTIONS_BOTTOM} + ${captionsHeight + 8}px)` : undefined }}>
            {/* One frame for the grid and the focus, measured for stageLayout. */}
            <div ref={tilesRef} className={cn("h-full w-full", STAGE_FRAME)} data-stage-layout={stage.grid ? "grid" : "focus"}>
                {stage.grid ? (
                    <StageGrid grid={stage.grid} cell={inGrid} onPage={setPage} />
                ) : (
                    <StageFocus stage={stage} cell={onStage} place={stripPlace} more={stripMore} />
                )}
            </div>


            {/* Captions, read out as they change. */}
            {showCaptions && (
                <CaptionsOverlay
                    hueOf={callHue}
                    lift={barRoom}
                    boxRef={captionsBox}
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
                        lobby={knocks}
                        onLobbyAction={hosting.act}
                        invite={extraStatus}
                        quality={quality}
                        held={meta.held}
                        onHold={(what, held) => void hosting.setHold(what, held)}
                        hasChat={!!chatTarget}
                    />
                </div>
            )}

            {/* On a phone the chat covers the dock, as Meet's and Zoom's do, so its
                field is the screen's footer: under the dock it couldn't be reached. */}
            {chatOpen && chatTarget && (
                <div className="absolute inset-0 z-[calc(var(--z-fixed)+1)] @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <CallChatPanel
                        target={chatTarget}
                        onClose={() => setSide(null)}
                        conversation={onChatToggle ? { onOpen: onChatToggle, open: !!isChatOpen } : undefined}
                        held={myHeld.has("chat")}
                    />
                </div>
            )}

            {/* Like the chat, it covers the dock on a phone: its ask box is the screen's footer. */}
            {activitiesOpen && asker && (
                <div className="absolute inset-0 z-[calc(var(--z-fixed)+1)] @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <CallActivitiesPanel who={asker} room={room} onClose={() => setSide(null)} />
                </div>
            )}

            {breakoutsOpen && runsBreakouts && (
                <div className="absolute inset-0 z-[calc(var(--z-fixed)+1)] @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <CallBreakoutsPanel breakouts={meta.breakouts} people={breakoutPeople} onAct={hosting.act} onClose={() => setSide(null)} />
                </div>
            )}

            <CallEffects room={room} open={effectsOpen} onClose={() => setSide(null)} />

            {/* In-Call AI Assistant side panel. On desktop it docks to the
                right as a flex sibling (shrinking the video area); on a phone,
                like the chat, it covers the dock: its ask box is the screen's footer. */}
            {aiPanelOpen && !guest && !inviteOnly && (
                <div className="absolute inset-0 z-[calc(var(--z-fixed)+1)] @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
                    <InCallAIPanel
                        items={inCallAgent.items}
                        isStreaming={inCallAgent.isStreaming}
                        onAsk={inCallAgent.ask}
                        onCancel={inCallAgent.cancel}
                        onClose={() => setSide(null)}
                        onRetry={inCallAgent.retry}
                        hearing={hearing}
                    />
                </div>
            )}
        </div>
        <VideoControls
            onDisconnect={onDisconnect ? () => onDisconnect() : undefined}
            companion={companion}
            layout={layout}
            onLayoutChange={(newLayout) => {
                setLayout(newLayout);
            }}
            onToggleRecording={isAdmin && parentToggleRecording ? askToRecord : undefined}
            isRecording={isRecording}
            isRecordingLoading={isRecordingActionLoading}
            recordingSince={recordingSince}
            onToggleCaptions={captionsAvailable ? onCaptions : undefined}
            showCaptions={showCaptions}
            captionsOff={!transcription.on}
            onToggleAI={guest || inviteOnly ? undefined : () => toggleSide("ai")}
            isAIOpen={aiPanelOpen}
            aiUnreadCount={aiUnread}
            people={{ count: people.length, open: peopleOpen, onToggle: () => toggleSide("people"), waiting: knocks?.length }}
            notice={
              knockBar.show && knocks ? (
                <>
                {breakoutBar(true)}
                <KnockBar
                  waiting={knocks}
                  onAdmit={(k) => hosting.act("admit", { ticket: k.ticket, name: k.name })}
                  onAdmitAll={() => hosting.act("admit_all")}
                  onSeeWho={() => setSide("people")}
                  onHide={knockBar.hide}
                  onHeight={setKnockBarHeight}
                />
                </>
              ) : breakoutBar(false)
            }
            effects={companion ? undefined : { open: effectsOpen, onToggle: () => toggleSide("effects") }}
            onReact={reactions.send}
            hand={hands.toggleHand ? { raised: hands.raisedAt !== null, onToggle: hands.toggleHand } : undefined}
            feedback={hands.setFeedback ? { current: hands.feedback, onSet: hands.setFeedback } : undefined}
            onChatToggle={dockChat?.onToggle}
            isChatOpen={dockChat?.open}
            activities={asker ? { open: activitiesOpen, onToggle: () => toggleSide("activities"), lit: activitiesLit } : undefined}
            breakouts={runsBreakouts ? { open: breakoutsOpen, onToggle: () => toggleSide("breakouts") } : undefined}
            onEndForAll={me?.can.has("end") ? hosting.endForEveryone : undefined}
            held={myHeld}
            board={
              boardRules?.present
                ? {
                    present: boardRules.present,
                    busyBy: presenterName,
                    presenting: boardRules.mine,
                    onPresent: () => setPickingBoard(true),
                    onStop: () => void hosting.act("stop_board"),
                  }
                : undefined
            }
        />
        {pickingBoard && (
          <BoardPicker onPick={(board) => void hosting.act("present_board", { board })} onNew={() => void hosting.act("new_board")} onClose={() => setPickingBoard(false)} />
        )}
        {!guest && !companion && (
            <FrontendTranscriber
                onTranscript={handleTranscript}
                onStatus={setCaptionState}
                active={recogniserActive}
                persist={keepsTranscript}
                language={speechLanguage(config.language)}
            />
        )}
    </div>
    </HandsQueueContext.Provider>
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
