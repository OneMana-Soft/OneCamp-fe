"use client";

/**
 * The green room (design v3, hub.md C1–C3): what you will look and sound like
 * before you join, who is already there, and which devices you are using.
 * Meet's green room in our material: the preview large on the left, the
 * column on the right.
 */

import { avatarSeed, personHue } from "@/lib/utils/getAvatarColor";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LocalTrack, LocalVideoTrack } from "livekit-client";
import { once } from "@/lib/lazy/once";
import { Captions, ChevronDown, Headphones, Lock, Mic, MicOff, Video, VideoOff, Volume2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import dynamic from "next/dynamic";

// Backgrounds and sound on the preview, a piece of its own: none of a call's
// first load. Until it arrives, a still button keeps its place.
const GreenRoomEffects = dynamic(() => import("@/components/call/effects/GreenRoomEffects"), {
  ssr: false,
  loading: () => <span aria-hidden className="grid size-12 place-items-center rounded-[12px] bg-[#2A2B30] @3xl:size-11" />,
});
import { TooltipProvider } from "@/components/ui/tooltip";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { cn } from "@/lib/utils/helpers/cn";
import { GREEN_ROOM_GROUND, MicMeter, NamePlate, StageFace, callScreenHeight, placeInSentence } from "./CallStage";
import { CONTROL_KEYS, CONTROL_LABELS, DockButton } from "./DockButton";
import { SPEAKING_THRESHOLD, levelSource, type LevelSource } from "./callLevels";
import { readDevicePrefs, writeDevicePref, type DevicePrefs } from "./callDevices";
import { callKeyAction } from "./callKeys";
import { callsUnavailableHere } from "./callErrors";
import { mediaFailure, mediaFailureKind } from "@/lib/media/mediaFailure";
import { mediaAsker, type MediaAsk } from "@/lib/media/askTogether";
import { cameraConstraints, micConstraints } from "./greenRoomCamera";
import { isLive, type GreenRoomTracks } from "./greenRoomHandOver";
import { captionsWhereText, type CallTranscription } from "./callState";

export interface PreJoinPerson {
  id: string;
  name: string;
}

// LiveKit's client, for the effects on the preview: none of a green room's
// first load (a guest's room page carried it before anything was clicked).
// The camera doesn't wait for it: the preview shows the browser's own track
// as soon as it opens, and LiveKit takes that same track when it comes. A
// failed load is forgotten (once), so the next ask tries again.
const loadLiveKit = once(() => import("./greenRoomLiveKit"));

const NO_PREFS: DevicePrefs = {};

interface PreJoinProps {
  /** Join, with the camera and microphone the green room has open for the call to send (greenRoomHandOver). */
  onJoin: (values: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string; tracks?: GreenRoomTracks }) => void;
  username: string;
  // When true, the user can type their display name (used by the guest join
  // flow, where there is no account). Join stays disabled until non-empty.
  nameEditable?: boolean;
  // Optional override for the primary button label.
  joinLabel?: string;
  // Where the call is, after "Call" ("in #engineering", "with Maya Chen"), said above the title, or
  // a call's own name as it is ("Maya Chen's room", at a link: calls HU13), so
  // nobody joins a call without knowing which one it is.
  place?: string;
  // A way out before joining. Without it the page offered only "Join".
  onCancel?: () => void;
  // In a side pane (split view): fill the pane, not the screen.
  embedded?: boolean;
  /** Whose colour the camera-off face wears: the person's id where there is one. */
  hueId?: string;
  /**
   * Who is in the call already, when it is known. Undefined means unknown,
   * and the line is left out rather than claiming the room is empty.
   */
  inCall?: PreJoinPerson[];
  /** The call is live, though who is in it is not known (a channel's ch_call_active). */
  live?: boolean;
  /**
   * Who is recording, when the call is being recorded (CALL-BUG-12). Said
   * above Join, so nobody joins a recording without being told.
   */
  recordingBy?: string | null;
  /** The call is being recorded, whether or not who started it is known. */
  recording?: boolean;
  /** The call's captions, when they are on: who turned them on and where speech goes (CALL-BUG-2). */
  transcription?: CallTranscription;
  /** Joining is under way: the button holds its width and says so. */
  joining?: boolean;
  /** Why joining failed, said under the button. */
  joinError?: string;
  /**
   * Why the call won't let this person in now, before they press Join: it is
   * locked, or someone running it put them out (Call Control). Join is off
   * while it stands.
   */
  refusal?: string;
  /** The call's own page, for "Open the call in your browser" where this app can't make calls (the Linux desktop app). */
  openUrl?: string;
  /** Another way in, under Join: a guest page's "Join as yourself" for someone in the workspace (calls HU13). */
  extra?: React.ReactNode;
  /**
   * Another first way in, drawn in place of the name and Join with the
   * choices made here: a guest link's "Join as Kai Lin" for someone signed
   * in to the workspace (calls HU13). Nothing drawn keeps the name and Join.
   */
  instead?: (choice: { audioEnabled: boolean; videoEnabled: boolean }) => React.ReactNode;
}

/** What the preview says when there is no picture. Pure. */
export function previewMessage(state: { videoEnabled: boolean; hasTrack: boolean; problem: string | null }): string | null {
  if (state.problem) return state.problem
  if (state.hasTrack) return null
  // The camera is still opening: "Camera is off" said the opposite of what
  // was happening for the second or two it takes.
  return state.videoEnabled ? "Starting your camera…" : "Camera is off"
}

/** "Maya and Jonas are in the call", "Maya, Jonas and 2 others…", or the empty room. Pure. */
export function whoIsHere(people: PreJoinPerson[] | undefined, live = false): string | null {
  if (!people) return live ? "Someone is in the call" : null
  const first = (n: string) => n.split(" ")[0] || n
  if (people.length === 0) return "No one's here yet. You'll be the first."
  if (people.length === 1) return `${first(people[0].name)} is in the call`
  if (people.length === 2) return `${first(people[0].name)} and ${first(people[1].name)} are in the call`
  return `${first(people[0].name)}, ${first(people[1].name)} and ${people.length - 2} ${people.length - 2 === 1 ? "other" : "others"} are in the call`
}

type CameraProblem = { kind: "denied" | "busy"; message: string };

export function PreJoin({
  onJoin,
  username,
  nameEditable = false,
  joinLabel = "Join now",
  place,
  onCancel,
  embedded = false,
  hueId,
  inCall,
  live = false,
  recordingBy,
  recording = false,
  transcription,
  joining = false,
  joinError,
  refusal,
  openUrl,
  extra,
  instead,
}: PreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [name, setName] = useState(username);
  // The camera as the browser opened it, shown at once, and LiveKit's track
  // over that same camera once its client comes (the effects need it).
  const [camera, setCamera] = useState<{ track: MediaStreamTrack; constraints: MediaTrackConstraints } | undefined>(undefined);
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | undefined>(undefined);
  // What Join handed the call (greenRoomHandOver): from then the call stops
  // them, so the clean-ups here leave them be. A join that never got a call
  // (joining ends with the green room still here) gives them back.
  const [given] = useState(() => new Set<MediaStreamTrack>());
  useEffect(() => {
    if (!joining) given.clear()
  }, [joining, given]);
  // Whether this green room is still here to take them back (greenRoomOpen).
  const [roomOpen] = useState(() => ({ current: true }));
  useEffect(() => {
    roomOpen.current = true
    return () => {
      roomOpen.current = false
    }
  }, [roomOpen]);
  // Set when the camera could not be opened (refused, busy, missing), so the
  // preview says why instead of quietly showing "Camera is off".
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  // Read after the first draw (the page is drawn on the server too). The
  // camera and the microphone wait for them, so the room opens the devices
  // picked before in its first ask, not the browser's and then those.
  const [prefs, setPrefs] = useState<DevicePrefs | null>(null);
  useEffect(() => setPrefs(readDevicePrefs()), []);
  const prefsRead = prefs !== null;
  const cameraId = prefs?.videoinput;
  // The camera and the meter's microphone, asked for together as the room
  // opens: one request, one prompt (lib/media/askTogether).
  const [ask] = useState(mediaAsker);
  // The Linux desktop app has no WebRTC: a Join there could only fail.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  useEffect(() => setUnavailable(callsUnavailableHere()), []);

  // Whether the call can join on one peer connection, asked now so Join needn't wait.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (url) void import("@/lib/calls/onePeerConnection").then((m) => m.onePeerConnection(url)).catch(() => undefined);
  }, []);

  // The account's name arrives a moment after the page; until it is edited,
  // the field follows it.
  useEffect(() => {
    if (!nameEditable) setName(username)
  }, [username, nameEditable])

  useEffect(() => {
    if (!prefsRead || !videoEnabled) return
    let cancelled = false
    let opened: MediaStreamTrack | undefined
    const constraints = cameraConstraints(cameraId)
    ask("video", constraints).then(
      (track) => {
        if (cancelled) {
          track.stop()
          return
        }
        opened = track
        setCamera({ track, constraints })
      },
      (e: unknown) => {
        if (cancelled) return
        console.error("Failed to acquire video track", e);
        // The app's one set of words for a refusal (lib/media); the denied
        // state also offers how to allow the camera.
        const f = mediaFailure("camera", e);
        setCameraProblem({ kind: mediaFailureKind(e) === "denied" ? "denied" : "busy", message: `${f?.title ?? "Your camera couldn't start"}. You can join with audio.` });
        setVideoEnabled(false);
      },
    )
    return () => {
      cancelled = true
      if (opened && !given.has(opened)) opened.stop()
      setCamera(undefined)
    }
  }, [ask, prefsRead, videoEnabled, cameraId, cameraAttempt, given]);

  // LiveKit's track over the open camera, once its client comes: the effects
  // need it. A client that doesn't come leaves the picture as it is; opening
  // the effects asks for it again, and the call asks as it starts.
  const [clientAttempt, setClientAttempt] = useState(0);
  useEffect(() => {
    if (!camera) return
    let cancelled = false
    let wrapped: LocalVideoTrack | undefined
    loadLiveKit().then(
      ({ liveKitCamera }) => {
        if (cancelled) return
        wrapped = liveKitCamera(camera.track, camera.constraints)
        setVideoTrack(wrapped)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
      // With its effect's processor; the camera goes with it only when the
      // camera itself is going (the effect above stops it then too).
      if (wrapped && !given.has(camera.track)) wrapped.stop()
      setVideoTrack(undefined)
    }
  }, [camera, clientAttempt, given]);
  const askClientAgain = useCallback(() => {
    if (!videoTrack) setClientAttempt((n) => n + 1)
  }, [videoTrack]);

  const { source: mic, track: micTrack } = useMicLevel(ask, prefs, given);
  const speaking = useOver(mic, SPEAKING_THRESHOLD);

  const toggleVideo = () => {
    setCameraProblem(null);
    setVideoEnabled(!videoEnabled);
  };
  const retryCamera = () => {
    setCameraProblem(null);
    setVideoEnabled(true);
    setCameraAttempt((n) => n + 1);
  };
  const toggleAudio = () => setAudioEnabled(!audioEnabled);
  // M and V, as the two buttons' tooltips teach (CALL-BUG-13): they only
  // worked inside the call. Never while typing a guest's name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = callKeyAction(e, ["mic", "camera"]);
      if (!action) return;
      e.preventDefault();
      if (action === "mic") setAudioEnabled((on) => !on);
      else {
        setCameraProblem(null);
        setVideoEnabled((on) => !on);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pick = (kind: keyof DevicePrefs, id: string) => {
    writeDevicePref(kind, id);
    setPrefs((p) => ({ ...(p ?? NO_PREFS), [kind]: id }));
  };

  // Join hands the call what is open and on, so it asks the browser for
  // nothing more and the camera's light never goes off and on.
  const give = (): GreenRoomTracks => {
    const tracks: GreenRoomTracks = {}
    if (videoEnabled && camera && isLive(camera.track)) tracks.camera = { ...camera, liveKit: videoTrack }
    if (audioEnabled && isLive(micTrack)) tracks.mic = { track: micTrack, constraints: micConstraints(prefs?.audioinput) }
    given.clear()
    if (tracks.camera) given.add(tracks.camera.track)
    if (tracks.mic) given.add(tracks.mic.track)
    tracks.greenRoomOpen = () => roomOpen.current
    return tracks
  }

  const showing = camera && videoEnabled
  const message = previewMessage({ videoEnabled, hasTrack: !!showing, problem: cameraProblem?.message ?? null })
  const self = name || username || "You"
  // Another first way in, in place of the name and Join (calls HU13).
  const lead = instead?.({ audioEnabled, videoEnabled }) || null
  const selfId = hueId ?? self
  const here = whoIsHere(inCall, live)
  const nameMissing = nameEditable && name.trim() === ""
  const mutedWhileSpeaking = !audioEnabled && speaking

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn("flex w-full items-center justify-center px-4 py-8 @container", GREEN_ROOM_GROUND, callScreenHeight(embedded))}
        data-prejoin=""
      >
        <div className="relative grid w-full max-w-[1040px] items-center gap-6 md:grid-cols-[1.6fr_1fr] md:gap-10">
          {/* The preview */}
          <div className="dark relative aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-[#0F1012] shadow-e4 md:aspect-video md:rounded-[16px]" data-preview="">
            {showing ? (
              <CameraPreview camera={camera.track} track={videoTrack} />
            ) : cameraProblem?.kind === "denied" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" data-camera-state="denied">
                <VideoOff className="size-6 text-[#FF8086]" aria-hidden />
                <p className="max-w-[22rem] text-ui text-ink-2 text-pretty" role="status">{message}</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="text-ui-sm font-medium text-brand-text underline-offset-[3px] hover:underline">How to allow the camera</button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-ui-sm">
                    <ol className="list-decimal space-y-1 pl-4 text-ink-2">
                      <li>Click the camera or lock icon at the left of the address bar.</li>
                      <li>Set Camera to Allow for this site.</li>
                      <li>Come back here and press Try again.</li>
                    </ol>
                    <Button size="xs" variant="ghost" className="mt-2" onClick={retryCamera}>Try again</Button>
                  </PopoverContent>
                </Popover>
              </div>
            ) : cameraProblem?.kind === "busy" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" data-camera-state="busy">
                <VideoOff className="size-6 text-ink-3" aria-hidden />
                <p className="max-w-[22rem] text-ui text-ink-2 text-pretty" role="status">{message}</p>
                <Button size="sm" variant="ghost" onClick={retryCamera}>Try again</Button>
              </div>
            ) : videoEnabled ? (
              // Starting: your avatar on your hue's dark ground, a shimmer across the frame.
              <div className={cn(HUE_CLASS[personHue(self)], "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(60%_70%_at_50%_45%,var(--hue-tint),#0F1012)]")} data-camera-state="starting">
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.05)_50%,transparent_70%)] bg-[length:200%_100%] motion-safe:animate-[text-shimmer_1.5s_linear_infinite]" />
                <IdentityMark variant="avatar" size={64} id={avatarSeed(self)} label={self} />
                <p className="text-ui-sm text-[#A8ABB1]" role="status">{message}</p>
              </div>
            ) : (
              <>
                <StageFace identity={selfId} name={self} fixedSize={96} />
                <span className="sr-only" role="status">{message}</span>
              </>
            )}

            {/* The two controls, on a solid pill over the preview: the dock's own buttons. */}
            <div className="absolute bottom-4 left-1/2 z-[3] flex -translate-x-1/2 gap-1.5 rounded-[28px] bg-[rgb(11_12_14/0.72)] p-1.5" data-prejoin-controls="">
              <DockButton
                label={audioEnabled ? CONTROL_LABELS.mute : CONTROL_LABELS.unmute}
                shortcut={CONTROL_KEYS.mic}
                state={audioEnabled ? "on" : "off"}
                pressed={audioEnabled}
                icon={audioEnabled ? <Mic /> : <MicOff />}
                onClick={toggleAudio}
              />
              <DockButton
                label={videoEnabled ? CONTROL_LABELS.cameraOff : CONTROL_LABELS.cameraOn}
                shortcut={CONTROL_KEYS.camera}
                state={videoEnabled ? "on" : "off"}
                pressed={videoEnabled}
                icon={videoEnabled ? <Video /> : <VideoOff />}
                onClick={toggleVideo}
              />
              <GreenRoomEffects preview={videoTrack} onOpen={askClientAgain} />
            </div>
            <NamePlate name={self} muted={!audioEnabled} className="max-md:hidden">
              {audioEnabled ? <MicMeter source={mic} className="ml-0.5 h-3 w-4" /> : null}
            </NamePlate>
          </div>

          {/* The column */}
          <div className="hub-rise flex flex-col">
            {mutedWhileSpeaking ? (
              <p role="status" className="mb-3 flex h-7 w-fit items-center gap-2 rounded-[8px] bg-camp-sun-tint px-2.5 text-ui-sm text-camp-sun-ink">
                You&apos;re muted. Unmute to be heard. <kbd className="kbd">{CONTROL_KEYS.mic}</kbd>
              </p>
            ) : null}
            {/* Held open before the call's name arrives, so the column doesn't move.
                Words, so ink-2: ink-3 holds only 3:1, and over the phone's glow
                it read as pale grey. */}
            <p className="min-h-4 text-ui-sm font-medium leading-4 text-ink-2" data-call-place="">
              {place ? (placeInSentence(place) !== place ? `Call ${place}` : place) : "\u00a0"}
            </p>
            <h1 className="mt-1.5 text-title-1 font-semibold text-balance">Ready to join?</h1>

            {here ? (
              <div className="mt-3.5 flex items-center gap-2.5 text-ui text-ink-2" data-whos-here="">
                {inCall && inCall.length > 0 ? (
                  <span className="flex">
                    {inCall.slice(0, 3).map((p, i) => (
                      <IdentityMark key={p.id} variant="avatar" size={24} id={avatarSeed(p.name)} label={p.name} className={cn("ring-2 ring-sheet", i > 0 && "-ml-1.5")} />
                    ))}
                  </span>
                ) : null}
                {(inCall && inCall.length > 0) || live ? <span className="hub-live-dot" aria-hidden /> : null}
                <span>{here}</span>
              </div>
            ) : null}

            <Devices prefs={prefs ?? NO_PREFS} onPick={pick} mic={audioEnabled ? mic : SILENT} />

            {nameEditable && !lead && (
              // A label above the field, not a placeholder standing in for one.
              <div className="mt-4 flex flex-col gap-1.5">
                <label htmlFor="prejoin-name" className="text-ui-sm font-medium">Your name</label>
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

            {/* What the call is doing, said before Join rather than after:
                people learned of a recording from the pill, already on it. */}
            {recordingBy || recording || transcription?.on || refusal ? (
              <div className="mt-4 flex flex-col gap-2" data-call-notices="">
                {refusal ? (
                  <p role="note" className="flex items-start gap-2 rounded-[10px] bg-sunken px-3 py-2 text-ui-sm text-foreground ring-1 ring-inset ring-line" data-refusal-notice="">
                    <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    <span>{refusal}</span>
                  </p>
                ) : null}
                {recordingBy || recording ? (
                  <p role="note" className="flex items-start gap-2 rounded-[10px] bg-sunken px-3 py-2 text-ui-sm text-foreground ring-1 ring-inset ring-line" data-recording-notice="">
                    <span aria-hidden className="mt-[5px] size-2 shrink-0 rounded-[4px] bg-destructive" />
                    <span>{recordingBy ? `This call is being recorded by ${recordingBy}.` : "This call is being recorded."} Joining puts you in the recording.</span>
                  </p>
                ) : null}
                {transcription?.on ? (
                  <p role="note" className="flex items-start gap-2 rounded-[10px] bg-sunken px-3 py-2 text-ui-sm text-foreground ring-1 ring-inset ring-line" data-captions-notice="">
                    <Captions aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    <span>
                      {transcription.by ? `Captions are on, turned on by ${transcription.by}. ` : "Captions are on. "}
                      <span className="text-ink-2">{captionsWhereText(transcription)}</span>
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {unavailable ? (
              <div className="mt-4" data-calls-unavailable="">
                <p role="note" className="text-ui-sm text-ink-2 text-pretty">{unavailable}</p>
                {/* The desktop app hands a new window's address to the system browser. */}
                <Button size="lg" className="mt-3 w-full" onClick={() => window.open(openUrl || window.location.href, "_blank", "noopener")}>
                  Open the call in your browser
                </Button>
              </div>
            ) : lead ? (
              lead
            ) : (
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={nameMissing || !!refusal} busy={joining}
                onClick={() => onJoin({ audioEnabled, videoEnabled, displayName: name.trim(), tracks: give() })}
              >
                {joining ? "Joining…" : joinLabel}
              </Button>
            )}
            {joinError ? (
              <p role="alert" className="mt-2 text-meta text-danger-ink">Couldn&apos;t join: {joinError}</p>
            ) : null}
            {onCancel && (
              <Button variant="ghost" className="mt-1.5 w-full" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {extra}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * The device check (C2): microphone with its live meter, camera, and speaker
 * with a test chime, on a sunken card. The choices are remembered for the
 * call (callDevices).
 */
function Devices({ prefs, onPick, mic }: { prefs: DevicePrefs; onPick: (kind: keyof DevicePrefs, id: string) => void; mic: LevelSource }) {
  const devices = useDevices()
  const [testing, setTesting] = useState(false)
  const test = useCallback(() => {
    setTesting(true)
    void playChime(prefs.audiooutput).finally(() => setTimeout(() => setTesting(false), 1200))
  }, [prefs.audiooutput])
  // One grid for the three rows: the names start on one line, whatever
  // each row carries at its end (the meter, Test, nothing). They floated
  // right-aligned at three different places.
  const row = "grid h-10 grid-cols-[16px_minmax(0,84px)_minmax(0,1fr)_auto] items-center gap-2 px-2 text-ui-sm text-ink-2"
  return (
    <div className="mt-4 rounded-[12px] bg-sunken p-1.5 ring-1 ring-inset ring-line dark:bg-white/[0.025]" data-devices="">
      <div className={row} data-device-row="">
        <Mic className="size-4 text-ink-3" aria-hidden />
        <span className="truncate">Microphone</span>
        <DeviceSelect label="Microphone" devices={devices.audioinput} value={prefs.audioinput} onChange={(id) => onPick("audioinput", id)} />
        <MicMeter source={mic} />
      </div>
      <div className={row} data-device-row="">
        <Video className="size-4 text-ink-3" aria-hidden />
        <span className="truncate">Camera</span>
        <DeviceSelect label="Camera" devices={devices.videoinput} value={prefs.videoinput} onChange={(id) => onPick("videoinput", id)} />
        <span aria-hidden />
      </div>
      <div className={row} data-device-row="">
        <Headphones className="size-4 text-ink-3" aria-hidden />
        <span className="truncate">Speaker</span>
        <DeviceSelect label="Speaker" devices={devices.audiooutput} value={prefs.audiooutput} onChange={(id) => onPick("audiooutput", id)} />
        {/* "Test" keeps its width while the chime plays: the icon says it. */}
        <Button size="xs" variant="ghost" onClick={test} disabled={testing} aria-label={testing ? "Playing the test sound" : "Test the speaker"}>
          <Volume2 className={cn(testing && "motion-safe:animate-pulse")} aria-hidden />
          Test
        </Button>
      </div>
    </div>
  )
}

/** A device as a ghost select: the name, truncated, with its chevron. */
function DeviceSelect({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void }) {
  const current = devices.find((d) => d.deviceId === value) ?? devices[0]
  return (
    <span className="relative flex min-w-0 items-center">
      <select
        aria-label={label}
        value={current?.deviceId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 cursor-pointer appearance-none truncate rounded-[6px] bg-transparent py-1 pr-6 pl-1.5 text-left text-ui-sm text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
      >
        {devices.length === 0 ? <option value="">Default</option> : null}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || "Default"}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-1.5 size-3.5 text-ink-3" />
    </span>
  )
}

/** The devices the browser reports, by kind; empty where it cannot say. */
function useDevices(): Record<"audioinput" | "videoinput" | "audiooutput", MediaDeviceInfo[]> {
  const [list, setList] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
    if (!md?.enumerateDevices) return
    let live = true
    const read = () => md.enumerateDevices().then((d) => live && setList(d)).catch(() => undefined)
    void read()
    md.addEventListener?.("devicechange", read)
    return () => {
      live = false
      md.removeEventListener?.("devicechange", read)
    }
  }, [])
  return {
    audioinput: list.filter((d) => d.kind === "audioinput"),
    videoinput: list.filter((d) => d.kind === "videoinput"),
    audiooutput: list.filter((d) => d.kind === "audiooutput"),
  }
}

/**
 * The microphone's level, 0 to 1, sampled at most 30 times a second. The
 * stream stays open while muted, so the green room can say "you're muted"
 * when you speak; nothing is sent anywhere. The samples go to what listens
 * (the meters, the muted line), not into state: in state, every one drew
 * the whole green room again (greenRoomRenders.test.tsx).
 */
/** The meter: the microphone's level, and its track while it is open. A track handed to the call (`given`) is the call's to stop. */
function useMicLevel(ask: MediaAsk, prefs: DevicePrefs | null, given: ReadonlySet<MediaStreamTrack>): { source: LevelSource; track: MediaStreamTrack | undefined } {
  const [source] = useState(levelSource)
  const [track, setTrack] = useState<MediaStreamTrack | undefined>(undefined)
  const prefsRead = prefs !== null
  const deviceId = prefs?.audioinput
  useEffect(() => {
    const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
    if (!prefsRead || !AC) return
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let stopped = false
    let lastAt = 0
    ask("audio", micConstraints(deviceId))
      .then((track) => {
        if (stopped) {
          track.stop()
          return
        }
        const s = new MediaStream([track])
        setTrack(track)
        stream = s
        ctx = new AC()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(s).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        const tick = (t: number) => {
          if (stopped) return
          if (t - lastAt >= 33) {
            lastAt = t
            analyser.getFloatTimeDomainData(buf)
            let sum = 0
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
            source.write(Math.min(1, Math.sqrt(sum / buf.length) * 2))
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => undefined)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => {
        if (!given.has(t)) t.stop()
      })
      setTrack(undefined)
      void ctx?.close().catch(() => undefined)
      source.write(0)
    }
  }, [ask, prefsRead, deviceId, source, given])
  return { source, track }
}

/** A muted microphone's meter: no samples, no bars. */
const SILENT: LevelSource = levelSource()

/** Whether a level is at or over a line: what listens to it draws only when that flips. */
function useOver(source: LevelSource, line: number): boolean {
  return useSyncExternalStore(source.listen, () => source.read() >= line, () => false)
}

/** A 1.2s two-note chime through the chosen speaker, where the browser can choose one. */
async function playChime(sinkId?: string): Promise<void> {
  const AC = typeof window !== "undefined" ? window.AudioContext : undefined
  if (!AC) return
  const ctx = new AC()
  try {
    const withSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    if (sinkId && withSink.setSinkId) await withSink.setSinkId(sinkId).catch(() => undefined)
    const now = ctx.currentTime
    ;[659.25, 987.77].forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = f
      gain.gain.setValueAtTime(0, now + i * 0.18)
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 1.02)
    })
    await new Promise((r) => setTimeout(r, 1250))
  } finally {
    void ctx.close().catch(() => undefined)
  }
}

// The camera in one <video>, as soon as it opens: the browser's track first,
// then LiveKit's over it. LiveKit's attach finds that same track already
// shown and leaves the picture be; with an effect on, it shows the track it
// sends instead. Attached once per track, and let go when it changes: a
// callback ref here attached the track again on every render of the page.
function CameraPreview({ camera, track }: { camera: MediaStreamTrack; track: LocalTrack | undefined }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (track) {
      track.attach(el)
      return () => {
        track.detach(el)
      }
    }
    const shown = el.srcObject instanceof MediaStream && el.srcObject.getVideoTracks().includes(camera)
    if (!shown) el.srcObject = new MediaStream([camera])
    void el.play().catch(() => undefined)
  }, [camera, track])
  // Fades in when the track is ready.
  return <video ref={ref} muted playsInline className="hub-fade-in h-full w-full -scale-x-100 object-cover" />
}
