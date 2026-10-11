"use client"

import * as React from "react"
import { useLocalParticipant, useMediaDeviceSelect, useRoomContext } from "@livekit/components-react"
import {
  Captions,
  CaptionsOff,
  ChevronDown,
  Disc,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  Sparkles,
  SquareUser,
  Video,
  VideoOff,
} from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"
import { springPop } from "@/lib/celebrate"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_AI } from "@/hooks/useClientConfig"
import { formatElapsed } from "./callLevels"

/**
 * The words every control says, shared with the green room (PreJoin), so a
 * control never changes its name between the two screens.
 */
export const CONTROL_LABELS = {
  mute: "Mute",
  unmute: "Unmute",
  cameraOff: "Turn camera off",
  cameraOn: "Turn camera on",
} as const

/** The keys the tooltips teach. VideoControls answers M and V. */
export const CONTROL_KEYS = { mic: "M", camera: "V", share: "⇧S", captions: "C", ai: "J", layout: "L" } as const

export type DockState = "on" | "off" | "active"

/**
 * A dock button's look per state (C7). Off is a circle as well as a colour:
 * the radius morphs from 12 to 22 on the M3 emphasized curve, so the state
 * never rests on colour alone. Active toggles invert to a light chip.
 */
export const DOCK_STATE_CLASS: Record<DockState, string> = {
  on: "rounded-[12px] bg-[#2A2B30] text-[#EEEEF0] hub-hl-top hover:bg-[#34353B]",
  off: "rounded-[22px] bg-[#3A1518] text-[#FF8086] hover:bg-[#45191D]",
  active: "rounded-[12px] bg-[#EEEEF0] text-[#0B0C0E] hover:bg-white",
}

const DOCK_BUTTON =
  "relative grid size-12 shrink-0 place-items-center transition-[border-radius,background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40 @3xl:size-11 [&_svg]:size-5"

interface DockButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string
  /** The short word under the button on a phone. */
  short?: string
  shortcut?: string
  state?: DockState
  icon: React.ReactNode
  /** A device menu, as the attached chevron segment. */
  menu?: React.ReactNode
  pressed?: boolean
  badge?: React.ReactNode
}

/** One dock control: 44px, a 20px icon, its state as shape and colour, its name and key in the tooltip. */
export function DockButton({ label, short, shortcut, state = "on", icon, menu, pressed, badge, className, onClick, ...rest }: DockButtonProps) {
  const iconRef = React.useRef<HTMLSpanElement>(null)
  return (
    <span className="flex flex-col items-center gap-1" data-dock-control="">
      <span className="relative flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-pressed={pressed}
              data-dock-state={state}
              className={cn(DOCK_BUTTON, DOCK_STATE_CLASS[state], menu && "@3xl:rounded-r-none", className)}
              onClick={(e) => {
                // The icon springs on a toggle; never on load.
                springPop(iconRef.current)
                onClick?.(e)
              }}
              {...rest}
            >
              <span ref={iconRef} className="grid place-items-center">
                {icon}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-1.5">
            {label}
            {shortcut ? <kbd className="kbd">{shortcut}</kbd> : null}
          </TooltipContent>
        </Tooltip>
        {menu ? <span className="hidden @3xl:flex">{menu}</span> : null}
        {badge}
      </span>
      {short ? <span className="text-micro font-medium leading-none text-ink-2 @3xl:hidden">{short}</span> : null}
    </span>
  )
}

/** The 20 x 44 chevron segment attached to Mic and Camera, opening a device menu. */
export function DeviceMenu({
  label,
  devices,
  activeId,
  onPick,
  off = false,
}: {
  label: string
  devices: { deviceId: string; label: string }[]
  activeId?: string
  onPick: (id: string) => void
  off?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Choose a ${label.toLowerCase()}`}
          className={cn(
            "grid h-11 w-5 place-items-center rounded-r-[12px] bg-[#24252A] text-[#A8ABB1] transition-colors hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-3",
            off && "rounded-r-[22px] bg-[#2E1215]",
          )}
        >
          <ChevronDown />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="text-meta text-ink-3">{label}</DropdownMenuLabel>
        {devices.length === 0 ? <DropdownMenuItem disabled>No devices found</DropdownMenuItem> : null}
        {devices.map((d) => (
          <DropdownMenuItem key={d.deviceId} onClick={() => onPick(d.deviceId)} className={cn(d.deviceId === activeId && "font-medium")}>
            <span className="truncate">{d.label || "Default"}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const Divider = () => <span aria-hidden data-dock-divider="" className="mx-0.5 hidden h-6 w-px bg-white/[0.08] @3xl:block" />

export interface CallDockProps {
  micOn: boolean
  cameraOn: boolean
  sharing?: boolean
  onToggleMic: () => void
  onToggleCamera: () => void
  onToggleShare?: () => void
  micMenu?: React.ReactNode
  cameraMenu?: React.ReactNode
  onDisconnect: () => void
  onChatToggle?: () => void
  isChatOpen?: boolean
  layout?: "grid" | "speaker"
  onLayoutChange?: (layout: "grid" | "speaker") => void
  /** Present only for someone allowed to record: Record is hidden otherwise. */
  onToggleRecording?: () => void
  isRecording?: boolean
  isRecordingLoading?: boolean
  recordingSince?: number | null
  onToggleCaptions?: () => void
  showCaptions?: boolean
  onToggleAI?: () => void
  isAIOpen?: boolean
  aiUnreadCount?: number
}

/**
 * The control dock (C7): grouped as Zoom groups it, You (mic, camera), Share
 * (screen, captions), Together (Ask AI, chat, layout, record), then Leave on
 * its own as the only danger fill. Always visible: state must be seen. On a
 * phone (the stage's container under @3xl) it spans the bottom with Mic,
 * Camera, Ask AI, More and Leave, each with its word under it.
 */
export function CallDock(p: CallDockProps) {
  const elapsed = useRecordingClock(p.isRecording ? (p.recordingSince ?? null) : null)
  const hasShareGroup = Boolean(p.onToggleShare || p.onToggleCaptions)
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Call controls"
        data-call-dock=""
        className={cn(
          "absolute inset-x-0 bottom-0 z-[var(--z-fixed)] flex items-start justify-around gap-1 border-t border-white/[0.06] bg-[#131416] px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]",
          "@3xl:inset-x-auto @3xl:bottom-4 @3xl:left-1/2 @3xl:-translate-x-1/2 @3xl:items-center @3xl:justify-center @3xl:gap-1.5 @3xl:rounded-[16px] @3xl:border-0 @3xl:bg-[#1F2024] @3xl:p-1.5 @3xl:shadow-e3",
        )}
      >
        {/* You */}
        <DockButton
          label={p.micOn ? CONTROL_LABELS.mute : CONTROL_LABELS.unmute}
          short="Mic"
          shortcut={CONTROL_KEYS.mic}
          state={p.micOn ? "on" : "off"}
          pressed={p.micOn}
          icon={p.micOn ? <Mic /> : <MicOff />}
          onClick={p.onToggleMic}
          menu={p.micMenu}
        />
        <DockButton
          label={p.cameraOn ? CONTROL_LABELS.cameraOff : CONTROL_LABELS.cameraOn}
          short="Camera"
          shortcut={CONTROL_KEYS.camera}
          state={p.cameraOn ? "on" : "off"}
          pressed={p.cameraOn}
          icon={p.cameraOn ? <Video /> : <VideoOff />}
          onClick={p.onToggleCamera}
          menu={p.cameraMenu}
        />

        {/* Share */}
        {hasShareGroup ? <Divider /> : null}
        {p.onToggleShare ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={p.sharing ? "Stop sharing" : "Share screen"}
              shortcut={CONTROL_KEYS.share}
              state={p.sharing ? "active" : "on"}
              pressed={!!p.sharing}
              icon={p.sharing ? <MonitorOff /> : <MonitorUp />}
              onClick={p.onToggleShare}
            />
          </span>
        ) : null}
        {p.onToggleCaptions ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={p.showCaptions ? "Hide captions" : "Show captions"}
              shortcut={CONTROL_KEYS.captions}
              state={p.showCaptions ? "active" : "on"}
              pressed={!!p.showCaptions}
              icon={p.showCaptions ? <CaptionsOff /> : <Captions />}
              onClick={p.onToggleCaptions}
            />
          </span>
        ) : null}

        {/* Together */}
        <Divider />
        {p.onToggleAI ? (
          <FeatureGate feature={FEATURE_AI}>
            <DockButton
              label={p.isAIOpen ? "Hide OneCamp AI" : "Ask AI"}
              short="Ask AI"
              shortcut={CONTROL_KEYS.ai}
              state={p.isAIOpen ? "active" : "on"}
              pressed={!!p.isAIOpen}
              icon={<Sparkles />}
              onClick={p.onToggleAI}
              badge={
                !p.isAIOpen && (p.aiUnreadCount ?? 0) > 0 ? (
                  <span className="pointer-events-none absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-[9px] bg-brand px-1 text-3xs font-semibold leading-none text-brand-foreground ring-2 ring-[#1F2024]">
                    {(p.aiUnreadCount ?? 0) > 9 ? "9+" : p.aiUnreadCount}
                  </span>
                ) : null
              }
            />
          </FeatureGate>
        ) : null}
        {p.onChatToggle ? (
          <span className="hidden @3xl:flex">
            <DockButton label="Chat" state={p.isChatOpen ? "active" : "on"} pressed={!!p.isChatOpen} icon={<MessageSquare />} onClick={p.onChatToggle} />
          </span>
        ) : null}
        {p.onLayoutChange ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={p.layout === "grid" ? "Switch to speaker view" : "Switch to grid view"}
              shortcut={CONTROL_KEYS.layout}
              icon={p.layout === "grid" ? <LayoutGrid /> : <SquareUser />}
              onClick={() => p.onLayoutChange?.(p.layout === "grid" ? "speaker" : "grid")}
            />
          </span>
        ) : null}
        {p.onToggleRecording ? (
          <span className="hidden @3xl:flex">
            <RecordButton recording={!!p.isRecording} loading={!!p.isRecordingLoading} elapsed={elapsed} onClick={p.onToggleRecording} />
          </span>
        ) : null}
        <MoreMenu {...p} />

        {/* Leave */}
        <Divider />
        <span className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Leave call"
                data-dock-leave=""
                onClick={p.onDisconnect}
                className="grid size-12 place-items-center rounded-[12px] bg-[#D1293D] text-white transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_oklab,#D1293D_92%,black)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand @3xl:flex @3xl:h-11 @3xl:w-auto @3xl:gap-1.5 @3xl:px-3.5 [&_svg]:size-4"
              >
                <PhoneOff />
                <span className="hidden text-ui-sm font-medium @3xl:inline">Leave</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Leave call</TooltipContent>
          </Tooltip>
          <span className="text-micro font-medium leading-none text-ink-2 @3xl:hidden">Leave</span>
        </span>
      </div>
    </TooltipProvider>
  )
}

/** Record: a disc, a spinner while it starts, then a steady dot and the elapsed time in mono. */
function RecordButton({ recording, loading, elapsed, onClick }: { recording: boolean; loading: boolean; elapsed: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={recording ? "Stop recording" : "Record"}
          aria-pressed={recording}
          disabled={loading}
          onClick={onClick}
          className={cn(DOCK_BUTTON, DOCK_STATE_CLASS.on, recording && "flex w-auto gap-2 px-3 font-mono text-meta @3xl:w-auto")}
        >
          {loading ? (
            <Loader2 className="motion-safe:animate-spin" />
          ) : recording ? (
            <>
              <span aria-hidden className="size-2 rounded-[4px] bg-[#F2555A]" />
              <span className="tabular-nums">{elapsed || "0:00"}</span>
            </>
          ) : (
            <Disc />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{recording ? "Stop recording" : "Record"}</TooltipContent>
    </Tooltip>
  )
}

/** The phone's "More": everything the bottom bar has no room for, as 52px rows. */
function MoreMenu(p: CallDockProps) {
  const any = p.onToggleShare || p.onToggleRecording || p.onToggleCaptions || p.onLayoutChange || p.onChatToggle
  if (!any) return null
  return (
    <span className="flex flex-col items-center gap-1 @3xl:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More call options" className={cn(DOCK_BUTTON, DOCK_STATE_CLASS.on)}>
            <MoreVertical />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="mb-2 w-60 p-1">
          {p.onToggleShare ? (
            <DropdownMenuItem onClick={p.onToggleShare} className="h-[52px]">
              {p.sharing ? <MonitorOff /> : <MonitorUp />}
              {p.sharing ? "Stop sharing" : "Share screen"}
            </DropdownMenuItem>
          ) : null}
          {p.onToggleCaptions ? (
            <DropdownMenuItem onClick={p.onToggleCaptions} className="h-[52px]">
              {p.showCaptions ? <CaptionsOff /> : <Captions />}
              {p.showCaptions ? "Hide captions" : "Show captions"}
            </DropdownMenuItem>
          ) : null}
          {p.onChatToggle ? (
            <DropdownMenuItem onClick={p.onChatToggle} className="h-[52px]">
              <MessageSquare />
              Chat
            </DropdownMenuItem>
          ) : null}
          {p.onLayoutChange ? (
            <DropdownMenuItem onClick={() => p.onLayoutChange?.(p.layout === "grid" ? "speaker" : "grid")} className="h-[52px]">
              {p.layout === "grid" ? <LayoutGrid /> : <SquareUser />}
              {p.layout === "grid" ? "Switch to speaker view" : "Switch to grid view"}
            </DropdownMenuItem>
          ) : null}
          {p.onToggleRecording ? (
            <DropdownMenuItem onClick={p.onToggleRecording} className="h-[52px]">
              <Disc />
              {p.isRecording ? "Stop recording" : "Record call"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-micro font-medium leading-none text-ink-2">More</span>
    </span>
  )
}

function useRecordingClock(since: number | null): string {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (since === null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [since])
  return since === null ? "" : formatElapsed(now - since)
}

/** A device menu for one kind, reading and switching the room's device. */
function RoomDeviceMenu({ kind, label, off }: { kind: MediaDeviceKind; label: string; off: boolean }) {
  const room = useRoomContext()
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, room })
  return <DeviceMenu label={label} off={off} devices={devices} activeId={activeDeviceId} onPick={(id) => void setActiveMediaDevice(id)} />
}

interface VideoControlsProps extends Omit<CallDockProps, "micOn" | "cameraOn" | "onToggleMic" | "onToggleCamera" | "onDisconnect" | "sharing" | "onToggleShare"> {
  onDisconnect?: () => void
}

/** The dock, wired to the room: the local participant's tracks and devices, and the M and V keys. */
export function VideoControls({ onDisconnect, ...rest }: VideoControlsProps) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()

  const toggleMic = React.useCallback(() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled), [localParticipant, isMicrophoneEnabled])
  const toggleCamera = React.useCallback(() => void localParticipant.setCameraEnabled(!isCameraEnabled), [localParticipant, isCameraEnabled])
  const toggleShare = () => void localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
  const leave = () => (onDisconnect ? onDisconnect() : void room.disconnect())

  // M and V, as the tooltips say, never while typing.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key === "m" || e.key === "M") toggleMic()
      else if (e.key === "v" || e.key === "V") toggleCamera()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleMic, toggleCamera])

  return (
    <CallDock
      {...rest}
      micOn={isMicrophoneEnabled}
      cameraOn={isCameraEnabled}
      sharing={isScreenShareEnabled}
      onToggleMic={toggleMic}
      onToggleCamera={toggleCamera}
      onToggleShare={toggleShare}
      onDisconnect={leave}
      micMenu={<RoomDeviceMenu kind="audioinput" label="Microphone" off={!isMicrophoneEnabled} />}
      cameraMenu={<RoomDeviceMenu kind="videoinput" label="Camera" off={!isCameraEnabled} />}
    />
  )
}
