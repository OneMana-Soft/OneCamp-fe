"use client"

import * as React from "react"
import { useLocalParticipant, useMediaDeviceSelect, useRoomContext } from "@livekit/components-react"
import { supportsAudioOutputSelection } from "livekit-client"
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
  Smile,
  SquareUser,
  Users,
  Video,
  VideoOff,
} from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { CALL_REACTIONS, REACTION_NAMES, type CallReaction } from "@/lib/calls/signals"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"
import { springPop } from "@/lib/spring"
import { FEATURE_AI, useFeature } from "@/hooks/useClientConfig"
import { toast } from "@/hooks/use-toast"
import { formatElapsed } from "./callLevels"
import { CONTROL_KEYS, callKeyAction, type CallAction } from "./callKeys"
import { SCREEN_UNAVAILABLE, callMediaFailure, canShareScreen, type CallDevice, type CallFailure } from "./callErrors"
import { writeDevicePref, type DevicePrefs } from "./callDevices"

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

/** The keys the tooltips teach, from the one table the handlers answer (callKeys). */
export { CONTROL_KEYS }

let lastFailure: { title: string; at: number } | null = null

/**
 * Says why a call action failed, once: LiveKit can report one failure twice
 * (as an event and as a rejection), and two toasts for one problem read as
 * two problems. Null says nothing (the screen picker was closed).
 */
export function showCallFailure(f: CallFailure | null, now = Date.now()): void {
  if (!f) return
  if (lastFailure && lastFailure.title === f.title && now - lastFailure.at < 4000) return
  lastFailure = { title: f.title, at: now }
  toast({ title: f.title, description: f.description, variant: "destructive" })
}

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
  "relative grid size-12 shrink-0 place-items-center transition-[border-radius,background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 @3xl:size-11 [&_svg]:size-5"

interface DockButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string
  /** The short word under the button: on a phone, and on a stage of 1280 px or more. */
  short?: string
  shortcut?: string
  state?: DockState
  icon: React.ReactNode
  /** A device menu, as the attached chevron segment. */
  menu?: React.ReactNode
  pressed?: boolean
  badge?: React.ReactNode
  /** The tooltip's words in place of the name and key: why the control can't work here. */
  hint?: string
}

/**
 * A control's word under it: on a phone, where the bar has room for five,
 * and again on a stage of 1280 px or more, as Zoom's says each control's name.
 * Between those widths the tooltip says it.
 */
function DockWord({ children }: { children: React.ReactNode }) {
  return (
    <span data-dock-word="" className="text-micro font-medium leading-none text-ink-2 @3xl:hidden @7xl:block">
      {children}
    </span>
  )
}

/** One dock control: 44px, a 20px icon, its state as shape and colour, its name and key in the tooltip. */
export function DockButton({ label, short, shortcut, state = "on", icon, menu, pressed, badge, hint, className, onClick, ...rest }: DockButtonProps) {
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
            {hint ?? label}
            {shortcut && !hint ? <kbd className="kbd">{shortcut}</kbd> : null}
          </TooltipContent>
        </Tooltip>
        {menu ? <span className="hidden @3xl:flex">{menu}</span> : null}
        {badge}
      </span>
      {short ? <DockWord>{short}</DockWord> : null}
    </span>
  )
}

/** One kind of device in a device menu: its heading, the devices and the one in use. */
export interface DeviceGroup {
  label: string
  devices: { deviceId: string; label: string }[]
  activeId?: string
  onPick: (id: string) => void
}

/**
 * The 20 x 44 chevron segment attached to Mic and Camera, opening a device
 * menu. The microphone's menu also lists speakers where the browser can
 * choose one (CALL-BUG-21), as Meet's and Zoom's do.
 */
export function DeviceMenu({ label, groups, off = false }: { label: string; groups: DeviceGroup[]; off?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "grid h-11 w-5 place-items-center rounded-r-[12px] bg-[#24252A] text-[#A8ABB1] transition-colors hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-3",
            off && "rounded-r-[22px] bg-[#2E1215]",
          )}
        >
          <ChevronDown />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {groups.map((g, i) => (
          <React.Fragment key={g.label}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-meta text-ink-3">{g.label}</DropdownMenuLabel>
            {g.devices.length === 0 ? <DropdownMenuItem disabled>No devices found</DropdownMenuItem> : null}
            {g.devices.map((d) => (
              <DropdownMenuItem key={d.deviceId} onClick={() => g.onPick(d.deviceId)} className={cn(d.deviceId === g.activeId && "font-medium")}>
                <span className="truncate">{d.label || "Default"}</span>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
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
  /**
   * Why Share can't work here (CALL-BUG-19): a phone or tablet browser has
   * no screen capture. The control stays, dimmed, and says so when pressed,
   * rather than doing nothing.
   */
  shareUnavailable?: string
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
  /** Captions are off for the whole call, so the control turns them on for everyone (CALL-BUG-2). */
  captionsOff?: boolean
  onToggleAI?: () => void
  isAIOpen?: boolean
  aiUnreadCount?: number
  /** Who is in the call: how many, and the list beside the stage. */
  people?: { count: number; open: boolean; onToggle: () => void }
  /** Sends a reaction to everyone in the call (lib/calls/signals). */
  onReact?: (emoji: CallReaction) => void
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
  // Ask AI only where this server has AI (the v1 edition has no AI routes).
  const aiAvailable = useFeature(FEATURE_AI)
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
            {p.shareUnavailable ? (
              // Dimmed but still pressable: the tooltip, and a toast on a
              // touch screen that has no hover, say why.
              <DockButton
                label="Share screen"
                short="Share"
                aria-disabled
                icon={<MonitorUp />}
                onClick={() => showCallFailure({ title: p.shareUnavailable!, description: "Share from a computer instead." })}
                hint={p.shareUnavailable}
              />
            ) : (
              <DockButton
                label={p.sharing ? "Stop sharing" : "Share screen"}
                short="Share"
                shortcut={CONTROL_KEYS.share}
                state={p.sharing ? "active" : "on"}
                pressed={!!p.sharing}
                icon={p.sharing ? <MonitorOff /> : <MonitorUp />}
                onClick={p.onToggleShare}
              />
            )}
          </span>
        ) : null}
        {p.onToggleCaptions ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={captionsAction(p)}
              short="Captions"
              shortcut={CONTROL_KEYS.captions}
              state={!p.captionsOff && p.showCaptions ? "active" : "on"}
              pressed={!p.captionsOff && !!p.showCaptions}
              icon={!p.captionsOff && p.showCaptions ? <CaptionsOff /> : <Captions />}
              onClick={p.onToggleCaptions}
            />
          </span>
        ) : null}

        {/* Together */}
        <Divider />
        {p.onToggleAI && aiAvailable ? (
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
        ) : null}
        {p.people ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={`Participants, ${p.people.count}`}
              short="People"
              state={p.people.open ? "active" : "on"}
              pressed={p.people.open}
              icon={<Users />}
              onClick={p.people.onToggle}
              badge={<PeopleCount count={p.people.count} />}
            />
          </span>
        ) : null}
        {p.onChatToggle ? (
          <span className="hidden @3xl:flex">
            <DockButton label="Chat" short="Chat" state={p.isChatOpen ? "active" : "on"} pressed={!!p.isChatOpen} icon={<MessageSquare />} onClick={p.onChatToggle} />
          </span>
        ) : null}
        {p.onReact ? <ReactButton onReact={p.onReact} /> : null}
        {p.onLayoutChange ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={p.layout === "grid" ? "Switch to speaker view" : "Switch to grid view"}
              short="Layout"
              shortcut={CONTROL_KEYS.layout}
              icon={p.layout === "grid" ? <LayoutGrid /> : <SquareUser />}
              onClick={() => p.onLayoutChange?.(p.layout === "grid" ? "speaker" : "grid")}
            />
          </span>
        ) : null}
        {p.onToggleRecording ? (
          <span className="hidden flex-col items-center gap-1 @3xl:flex">
            <RecordButton recording={!!p.isRecording} loading={!!p.isRecordingLoading} elapsed={elapsed} onClick={p.onToggleRecording} />
            <DockWord>Record</DockWord>
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

/** How many are in the call, on People: a quiet count, not an alert. */
function PeopleCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-[9px] bg-[#3A3B41] px-1 text-3xs font-semibold leading-none tabular-nums text-[#EEEEF0] ring-2 ring-[#1F2024]"
    >
      {count}
    </span>
  )
}

/**
 * React: a tray of six above the dock. A pick goes to everyone and the tray
 * closes, as Zoom's does; Escape or a press outside closes it too.
 */
function ReactButton({ onReact }: { onReact: (emoji: CallReaction) => void }) {
  const [open, setOpen] = React.useState(false)
  const anchor = React.useRef<HTMLSpanElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span ref={anchor} className="flex">
          <DockButton
            label="React"
            short="React"
            state={open ? "active" : "on"}
            aria-haspopup="dialog"
            aria-expanded={open}
            icon={<Smile />}
            onClick={() => setOpen((o) => !o)}
          />
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        sideOffset={10}
        className="w-auto rounded-[14px] border-0 bg-[#1F2024] p-1.5 shadow-e3"
        // The React button itself toggles; a press on it is not "outside".
        onPointerDownOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
        <div role="group" aria-label="Reactions" className="flex gap-1">
          {CALL_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={REACTION_NAMES[emoji]}
              onClick={() => {
                onReact(emoji)
                setOpen(false)
              }}
              className="grid size-11 place-items-center rounded-[10px] text-2xl leading-none transition-[background-color,transform] duration-150 hover:bg-[#34353B] active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * What the captions control does now: turn them on for the whole call, or
 * show or hide them on this screen once they are on. Pure.
 */
export function captionsAction(p: Pick<CallDockProps, "captionsOff" | "showCaptions">): string {
  if (p.captionsOff) return "Turn on captions"
  return p.showCaptions ? "Hide captions" : "Show captions"
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
          // Starting: it keeps its tooltip (a disabled button shows none).
          aria-disabled={loading || undefined}
          onClick={loading ? undefined : onClick}
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
  const any = p.onToggleShare || p.onToggleRecording || p.onToggleCaptions || p.onLayoutChange || p.onChatToggle || p.people
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
            p.shareUnavailable ? (
              // A phone has no screen capture: the row says so rather than doing nothing.
              <DropdownMenuItem disabled className="h-[52px]" data-share-unavailable="">
                <MonitorUp />
                <span className="flex min-w-0 flex-col">
                  <span>Share screen</span>
                  <span className="text-meta text-ink-3">Not available in this browser</span>
                </span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={p.onToggleShare} className="h-[52px]">
                {p.sharing ? <MonitorOff /> : <MonitorUp />}
                {p.sharing ? "Stop sharing" : "Share screen"}
              </DropdownMenuItem>
            )
          ) : null}
          {p.onToggleCaptions ? (
            <DropdownMenuItem onClick={p.onToggleCaptions} className="h-[52px]">
              {!p.captionsOff && p.showCaptions ? <CaptionsOff /> : <Captions />}
              {captionsAction(p)}
            </DropdownMenuItem>
          ) : null}
          {p.people ? (
            <DropdownMenuItem onClick={p.people.onToggle} className="h-[52px]">
              <Users />
              <span className="flex-1">Participants</span>
              <span className="tabular-nums text-ink-3">{p.people.count}</span>
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

/** Whether this browser can send call audio to a chosen speaker (Safari can't). */
const speakerChoice = () => typeof window !== "undefined" && supportsAudioOutputSelection()

/**
 * A device menu for one kind, reading and switching the room's device, and
 * remembering the pick for the next call. The microphone's lists speakers
 * too, where they can be chosen (CALL-BUG-21). A switch that fails says so.
 */
function RoomDeviceMenu({ kind, label, off }: { kind: "audioinput" | "videoinput"; label: string; off: boolean }) {
  const room = useRoomContext()
  const input = useMediaDeviceSelect({ kind, room })
  const output = useMediaDeviceSelect({ kind: "audiooutput", room })
  const [canPickSpeaker] = React.useState(speakerChoice)
  const pick = (k: keyof DevicePrefs, select: (id: string) => Promise<void>, what: string) => (id: string) => {
    select(id)
      .then(() => writeDevicePref(k, id))
      .catch(() => showCallFailure({ title: `Couldn't switch to that ${what}`, description: "It may have been unplugged. Choose another." }))
  }
  const groups: DeviceGroup[] = [
    { label, devices: input.devices, activeId: input.activeDeviceId, onPick: pick(kind, input.setActiveMediaDevice, label.toLowerCase()) },
  ]
  if (kind === "audioinput" && canPickSpeaker) {
    groups.push({ label: "Speaker", devices: output.devices, activeId: output.activeDeviceId, onPick: pick("audiooutput", output.setActiveMediaDevice, "speaker") })
  }
  const name = groups.length > 1 ? `Choose a ${label.toLowerCase()} or speaker` : `Choose a ${label.toLowerCase()}`
  return <DeviceMenu label={name} off={off} groups={groups} />
}

interface VideoControlsProps extends Omit<CallDockProps, "micOn" | "cameraOn" | "onToggleMic" | "onToggleCamera" | "onDisconnect" | "sharing" | "onToggleShare" | "shareUnavailable"> {
  onDisconnect?: () => void
}

/**
 * Turns a device on or off and says why when it can't (CALL-BUG-1): the
 * dock used to drop the answer, so a refused microphone left the button red
 * and the reason in the console. One press at a time: a second press while
 * the browser is still asking for permission would queue a second request.
 */
function useDeviceToggle(device: CallDevice, enabled: boolean, set: (on: boolean) => Promise<unknown>) {
  const busy = React.useRef(false)
  return React.useCallback(async () => {
    if (busy.current) return
    busy.current = true
    const next = !enabled
    try {
      await set(next)
    } catch (e) {
      showCallFailure(next ? callMediaFailure(device, e) : { title: `Couldn't turn off your ${device === "screen" ? "screen share" : device}`, description: "Try again." })
    } finally {
      busy.current = false
    }
  }, [device, enabled, set])
}

/** The dock, wired to the room: the local participant's tracks and devices, and the call's keys (callKeys). */
export function VideoControls({ onDisconnect, ...rest }: VideoControlsProps) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const aiAvailable = useFeature(FEATURE_AI)
  const [shareable] = React.useState(() => canShareScreen())

  const toggleMic = useDeviceToggle("microphone", isMicrophoneEnabled, React.useCallback((on: boolean) => localParticipant.setMicrophoneEnabled(on), [localParticipant]))
  const toggleCamera = useDeviceToggle("camera", isCameraEnabled, React.useCallback((on: boolean) => localParticipant.setCameraEnabled(on), [localParticipant]))
  const toggleShare = useDeviceToggle("screen", isScreenShareEnabled, React.useCallback((on: boolean) => localParticipant.setScreenShareEnabled(on), [localParticipant]))
  const leave = () => (onDisconnect ? onDisconnect() : void room.disconnect())

  // Every key a tooltip teaches, from the one table, never while typing.
  const { onToggleCaptions, onToggleAI, onLayoutChange, layout } = rest
  const actions = React.useMemo<Partial<Record<CallAction, () => void>>>(
    () => ({
      mic: () => void toggleMic(),
      camera: () => void toggleCamera(),
      share: shareable ? () => void toggleShare() : undefined,
      captions: onToggleCaptions,
      ai: aiAvailable ? onToggleAI : undefined,
      layout: onLayoutChange ? () => onLayoutChange(layout === "grid" ? "speaker" : "grid") : undefined,
    }),
    [toggleMic, toggleCamera, toggleShare, shareable, onToggleCaptions, aiAvailable, onToggleAI, onLayoutChange, layout],
  )
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = callKeyAction(e)
      const run = action ? actions[action] : undefined
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [actions])

  return (
    <CallDock
      {...rest}
      micOn={isMicrophoneEnabled}
      cameraOn={isCameraEnabled}
      sharing={isScreenShareEnabled}
      onToggleMic={() => void toggleMic()}
      onToggleCamera={() => void toggleCamera()}
      onToggleShare={() => void toggleShare()}
      shareUnavailable={shareable ? undefined : SCREEN_UNAVAILABLE}
      onDisconnect={leave}
      micMenu={<RoomDeviceMenu kind="audioinput" label="Microphone" off={!isMicrophoneEnabled} />}
      cameraMenu={<RoomDeviceMenu kind="videoinput" label="Camera" off={!isCameraEnabled} />}
    />
  )
}
