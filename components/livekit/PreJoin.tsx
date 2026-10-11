"use client";

/**
 * The green room (design v3, hub.md C1–C3): what you will look and sound like
 * before you join, who is already there, and which devices you are using.
 * Meet's green room in our material: the preview large on the left, the
 * column on the right.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createLocalVideoTrack, type LocalTrack } from "livekit-client";
import { Headphones, Loader2, Mic, MicOff, Video, VideoOff, Volume2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { hueFor } from "@/lib/campHue";
import { cn } from "@/lib/utils/helpers/cn";
import { MicMeter, NamePlate, StageFace } from "./CallStage";
import { CONTROL_KEYS, CONTROL_LABELS, DockButton } from "./VideoControls";
import { SPEAKING_THRESHOLD } from "./callLevels";
import { readDevicePrefs, writeDevicePref, type DevicePrefs } from "./callDevices";

export interface PreJoinPerson {
  id: string;
  name: string;
}

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
  /**
   * Who is in the call already, when it is known. Undefined means unknown,
   * and the line is left out rather than claiming the room is empty.
   */
  inCall?: PreJoinPerson[];
  /** The call is live, though who is in it is not known (a channel's ch_call_active). */
  live?: boolean;
  /** Who is recording, when the call is being recorded. */
  recordingBy?: string | null;
  /** Joining is under way: the button holds its width and says so. */
  joining?: boolean;
  /** Why joining failed, said under the button. */
  joinError?: string;
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
  joining = false,
  joinError,
}: PreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [name, setName] = useState(username);
  const [videoTrack, setVideoTrack] = useState<LocalTrack | undefined>(undefined);
  // Set when the camera could not be opened (refused, busy, missing), so the
  // preview says why instead of quietly showing "Camera is off".
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [prefs, setPrefs] = useState<DevicePrefs>({});
  useEffect(() => setPrefs(readDevicePrefs()), []);

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
            deviceId: prefs.videoinput || "",
            resolution: { width: 1280, height: 720 },
          });
          if (cancelled) {
            track.stop()
            return
          }
          setVideoTrack(track);
          trackRef.current = track;
        } catch (e) {
          if (cancelled) return
          console.error("Failed to acquire video track", e);
          const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
          setCameraProblem(
            denied
              ? { kind: "denied", message: "OneCamp is not allowed to use your camera. Allow it in the browser, or join with audio." }
              : { kind: "busy", message: "Your camera could not be opened. It may be in use by another app. You can join with audio." },
          );
          setVideoEnabled(false);
        }
      } else if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = undefined;
        setVideoTrack(undefined);
      }
    };
    void enableVideo();
    return () => {
      cancelled = true
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = undefined;
      }
    };
  }, [videoEnabled, prefs.videoinput, cameraAttempt]);

  const level = useMicLevel(prefs.audioinput);

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
  const pick = (kind: keyof DevicePrefs, id: string) => {
    writeDevicePref(kind, id);
    setPrefs((p) => ({ ...p, [kind]: id }));
  };

  const showing = videoTrack && videoEnabled
  const message = previewMessage({ videoEnabled, hasTrack: !!showing, problem: cameraProblem?.message ?? null })
  const self = name || username || "You"
  const selfId = hueId ?? self
  const here = whoIsHere(inCall, live)
  const nameMissing = nameEditable && name.trim() === ""
  const mutedWhileSpeaking = !audioEnabled && level >= SPEAKING_THRESHOLD

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden bg-sheet px-4 py-8 @container",
          // The frame's campfire glow continues behind the green room.
          "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(700px_480px_at_-80px_-100px,rgb(var(--glow)/0.14),transparent_68%)]",
          embedded ? "min-h-full" : "min-h-dvh",
        )}
        data-prejoin=""
      >
        <div className="relative grid w-full max-w-[1040px] items-center gap-6 md:grid-cols-[1.6fr_1fr] md:gap-10">
          {/* The preview */}
          <div className="dark relative aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-[#0F1012] shadow-e4 md:aspect-video md:rounded-[16px]" data-preview="">
            {showing ? (
              <VideoTrackPreview track={videoTrack} />
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
              <div className={cn(HUE_CLASS[hueFor(selfId)], "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(60%_70%_at_50%_45%,var(--hue-tint),#0F1012)]")} data-camera-state="starting">
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.05)_50%,transparent_70%)] bg-[length:200%_100%] motion-safe:animate-[text-shimmer_1.5s_linear_infinite]" />
                <IdentityMark variant="avatar" size={64} id={selfId} label={self} />
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
            </div>
            <NamePlate name={self} muted={!audioEnabled} className="max-md:hidden">
              {audioEnabled ? <MicMeter level={level} className="ml-0.5 h-3 w-4" /> : null}
            </NamePlate>
          </div>

          {/* The column */}
          <div className="hub-rise flex flex-col">
            {mutedWhileSpeaking ? (
              <p role="status" className="mb-3 flex h-7 w-fit items-center gap-2 rounded-[8px] bg-camp-sun-tint px-2.5 text-ui-sm text-camp-sun-ink">
                You&apos;re muted. Unmute to be heard. <kbd className="kbd">{CONTROL_KEYS.mic}</kbd>
              </p>
            ) : null}
            {/* Held open before the call's name arrives, so the column doesn't move. */}
            <p className="min-h-4 text-ui-sm font-medium leading-4 text-ink-3" data-call-place="">
              {place ? `Call ${place}` : "\u00a0"}
            </p>
            <h1 className="mt-1.5 text-title-1 font-semibold text-balance">Ready to join?</h1>

            {here ? (
              <div className="mt-3.5 flex items-center gap-2.5 text-ui text-ink-2" data-whos-here="">
                {inCall && inCall.length > 0 ? (
                  <span className="flex">
                    {inCall.slice(0, 3).map((p, i) => (
                      <IdentityMark key={p.id} variant="avatar" size={24} id={p.id} label={p.name} className={cn("ring-2 ring-sheet", i > 0 && "-ml-1.5")} />
                    ))}
                  </span>
                ) : null}
                {(inCall && inCall.length > 0) || live ? <span className="hub-live-dot" aria-hidden /> : null}
                <span>{here}</span>
              </div>
            ) : null}

            <Devices prefs={prefs} onPick={pick} level={audioEnabled ? level : 0} />

            {nameEditable && (
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

            <Button
              size="lg"
              className="mt-4 w-full"
              disabled={nameMissing || joining}
              onClick={() => onJoin({ audioEnabled, videoEnabled, displayName: name.trim() })}
            >
              {joining ? (
                <>
                  <Loader2 className="motion-safe:animate-spin" aria-hidden />
                  Joining…
                </>
              ) : (
                joinLabel
              )}
            </Button>
            {joinError ? (
              <p role="alert" className="mt-2 text-meta text-danger-ink">Couldn&apos;t join: {joinError}</p>
            ) : null}
            {onCancel && (
              <Button variant="ghost" className="mt-1.5 w-full" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {recordingBy ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-meta text-ink-3">
                <span aria-hidden className="size-1.5 rounded-[3px] bg-destructive" />
                This call is being recorded by {recordingBy}
              </p>
            ) : null}
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
function Devices({ prefs, onPick, level }: { prefs: DevicePrefs; onPick: (kind: keyof DevicePrefs, id: string) => void; level: number }) {
  const devices = useDevices()
  const [testing, setTesting] = useState(false)
  const test = useCallback(() => {
    setTesting(true)
    void playChime(prefs.audiooutput).finally(() => setTimeout(() => setTesting(false), 1200))
  }, [prefs.audiooutput])
  const row = "flex h-10 items-center gap-2.5 px-2 text-ui-sm text-ink-2"
  return (
    <div className="mt-4 rounded-[12px] bg-sunken p-1.5 ring-1 ring-inset ring-line dark:bg-white/[0.025]" data-devices="">
      <div className={row}>
        <Mic className="size-4 text-ink-3" aria-hidden />
        Microphone
        <DeviceSelect label="Microphone" devices={devices.audioinput} value={prefs.audioinput} onChange={(id) => onPick("audioinput", id)} />
        <MicMeter level={level} />
      </div>
      <div className={row}>
        <Video className="size-4 text-ink-3" aria-hidden />
        Camera
        <DeviceSelect label="Camera" devices={devices.videoinput} value={prefs.videoinput} onChange={(id) => onPick("videoinput", id)} />
      </div>
      <div className={row}>
        <Headphones className="size-4 text-ink-3" aria-hidden />
        Speaker
        <DeviceSelect label="Speaker" devices={devices.audiooutput} value={prefs.audiooutput} onChange={(id) => onPick("audiooutput", id)} />
        <Button size="xs" variant="ghost" onClick={test} disabled={testing} aria-label="Test the speaker">
          <Volume2 className={cn(testing && "motion-safe:animate-pulse")} aria-hidden />
          {testing ? "Playing" : "Test"}
        </Button>
      </div>
    </div>
  )
}

/** A device as a ghost select: the name, truncated, with its chevron. */
function DeviceSelect({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void }) {
  const current = devices.find((d) => d.deviceId === value) ?? devices[0]
  return (
    <span className="relative ml-auto flex min-w-0 max-w-[200px] items-center">
      <select
        aria-label={label}
        value={current?.deviceId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 cursor-pointer appearance-none truncate rounded-[6px] bg-transparent py-1 pr-5 pl-1.5 text-right text-ui-sm text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
      >
        {devices.length === 0 ? <option value="">Default</option> : null}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || "Default"}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-1 text-ink-3">▾</span>
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
 * when you speak; nothing is sent anywhere.
 */
function useMicLevel(deviceId?: string): number {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
    const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
    if (!md?.getUserMedia || !AC) return
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let stopped = false
    let lastAt = 0
    md.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
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
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2))
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => undefined)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => undefined)
    }
  }, [deviceId])
  return level
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
  // Fades in when the track is ready.
  return <video ref={ref} muted playsInline className="hub-fade-in h-full w-full -scale-x-100 object-cover" />
}
