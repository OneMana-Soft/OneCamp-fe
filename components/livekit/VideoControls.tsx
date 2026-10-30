"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useLocalParticipant, useMediaDeviceSelect, useRoomContext } from "@livekit/components-react"
import { supportsAudioOutputSelection } from "livekit-client"
import {
  BarChart3,
  Captions,
  CaptionsOff,
  ChevronDown,
  Disc,
  Hand,
  LayoutGrid,
  DoorOpen,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  Presentation,
  Sparkles,
  WandSparkles,
  Smile,
  SquareUser,
  Users,
  Video,
  VideoOff,
  type LucideIcon,
} from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { CALL_REACTIONS, REACTION_NAMES, type CallReaction } from "@/lib/calls/signals"
import type { CallFeedback } from "@/lib/calls/handsCore"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"
import { FEATURE_AI, useFeature } from "@/hooks/useClientConfig"
import { CALL_SURFACE, callToast } from "./callSurface"
import { useRootPlaceOf } from "./rootPlace"
import { useElapsed } from "./CallStage"
import { CONTROL_KEYS, callKeyAction, type CallAction } from "./callKeys"
import { callShortcutRows } from "./callKeyRows"
import { isMacLike } from "@/lib/keys/chord"
import { showPageKeys } from "@/lib/shortcuts/pageGroups"
import { readPushToTalk, usePushToTalk, writePushToTalk } from "./usePushToTalk"
import { deviceSwitch, publishSwitch, type DeviceSwitch } from "@/lib/calls/deviceSwitch"
import { CONTROL_LABELS, DOCK_BUTTON, DOCK_STATE_CLASS, DockButton, DockWord } from "./DockButton"
import { SCREEN_UNAVAILABLE, callMediaFailure, canShareScreen, type CallDevice, type CallFailure } from "./callErrors"
import { writeDevicePref, type DevicePrefs } from "./callDevices"
import { heldNext, heldReason } from "./callHolds"
import type { CallHold } from "@/lib/calls/holds"
import { focusHandOff } from "@/lib/ui/focusHandOff"

// The dock's buttons and words, shared with the green room (DockButton), so
// the green room's first load has them without the call's dock.
export { CONTROL_KEYS, CONTROL_LABELS, DOCK_STATE_CLASS, DockButton, type DockState } from "./DockButton"

let lastSaid: { title: string; at: number } | null = null

/** Whether these words were said in the last 4 s; records them when not. */
function saidJustNow(title: string, now: number): boolean {
  if (lastSaid && lastSaid.title === title && now - lastSaid.at < 4000) return true
  lastSaid = { title, at: now }
  return false
}

/**
 * Says why a call action failed, once: LiveKit can report one failure twice
 * (as an event and as a rejection), and two toasts for one problem read as
 * two problems. Null says nothing (the screen picker was closed).
 */
export function showCallFailure(f: CallFailure | null, now = Date.now()): void {
  if (!f || saidJustNow(f.title, now)) return
  callToast({ title: f.title, description: f.description, variant: "destructive" })
}

/** Says why a control the call holds can't be used, and what to do about it: a choice the people running it made, not a failure (meet-12). */
function sayHeld(what: CallHold, now = Date.now()): void {
  const title = heldReason(what)
  if (!saidJustNow(title, now)) callToast({ title, description: heldNext(what), tone: "info" })
}

/** One kind of device in a device menu: its heading, the devices and the one in use. */
export interface DeviceGroup {
  label: string
  devices: { deviceId: string; label: string }[]
  activeId?: string
  onPick: (id: string) => void
}

/**
 * The device a menu marks: the one in use, or, where the room names none the
 * list has (a camera that's off is "" or "default", and Chrome lists cameras
 * with no "default"), the first listed, which is the one that will start.
 * Pure.
 */
function inUse(g: Pick<DeviceGroup, "devices" | "activeId">): string {
  if (g.devices.some((d) => d.deviceId === g.activeId)) return g.activeId ?? ""
  return g.devices[0]?.deviceId ?? ""
}

/**
 * The 20 x 44 chevron segment attached to Mic and Camera, opening a device
 * menu. The microphone's menu also lists speakers where the browser can
 * choose one (CALL-BUG-21), as Meet's and Zoom's do.
 */
export function DeviceMenu({
  label,
  groups,
  off = false,
  extra,
  option,
}: {
  label: string
  groups: DeviceGroup[]
  off?: boolean
  extra?: { label: string; onSelect: () => void }
  /** A lasting choice about the device, as a checkbox under the devices (push to talk, meet-18). */
  option?: { label: string; checked: boolean; onChange: (on: boolean) => void }
}) {
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
      <DropdownMenuContent side="top" align="start" className={cn(CALL_SURFACE, "w-64")}>
        {groups.map((g, i) => (
          <React.Fragment key={g.label}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-meta text-ink-3">{g.label}</DropdownMenuLabel>
            {g.devices.length === 0 ? <DropdownMenuItem disabled>No devices found</DropdownMenuItem> : null}
            {/* A choice of one, the device in use checked: a screen reader hears which (meet-18). */}
            <DropdownMenuRadioGroup aria-label={g.label} value={inUse(g)} onValueChange={g.onPick}>
              {g.devices.map((d) => (
                <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId}>
                  <span className="truncate">{d.label || "Default"}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </React.Fragment>
        ))}
        {option ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={option.checked} onCheckedChange={(on) => option.onChange(on === true)} onSelect={(e) => e.preventDefault()}>
              {option.label}
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
        {extra ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={extra.onSelect} data-effects-entry="">
              <WandSparkles />
              {extra.label}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const Divider = () => <span aria-hidden data-dock-divider="" className="mx-0.5 hidden h-6 w-px bg-white/[0.08] @3xl:block" />

/** Leave: the dock's one danger fill. */
const LEAVE_BUTTON =
  "grid size-12 place-items-center rounded-[12px] bg-[#D1293D] text-white transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_oklab,#D1293D_92%,black)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand @3xl:flex @3xl:h-11 @3xl:w-auto @3xl:gap-1.5 @3xl:px-3.5 [&_svg]:size-4"

// The signs that stay beside your name: in the React tray, loaded with its first opening.
const FeedbackRow = dynamic(() => import("./FeedbackRow").then((m) => m.FeedbackRow), { ssr: false })

export interface CallDockProps {
  micOn: boolean
  /** Space is held to talk (push to talk): the microphone is open only until it's let go. */
  talking?: boolean
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
  /**
   * The board on the stage (calls package B), for whoever may present one
   * (lib/calls/control's boardControls): Share opens a menu, a screen or a
   * board, each saying why when it can't, and stops your board while it is
   * up. A guest has none, and their Share shares the screen as before.
   */
  board?: { present: "yes" | "held" | "busy"; busyBy?: string; presenting: boolean; onPresent: () => void; onStop: () => void }
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
  /** Who is in the call: how many, the list beside the stage, and how many wait to join (CALLS-2). */
  people?: { count: number; open: boolean; onToggle: () => void; waiting?: number }
  /** Backgrounds and sound (Media Processors), beside the stage. */
  effects?: { open: boolean; onToggle: () => void }
  /** The call's polls and questions beside the stage (calls package A); lit while something new waits there. */
  activities?: { open: boolean; onToggle: () => void; lit: boolean }
  /** Breakout rooms, for whoever runs the call (calls package C). */
  breakouts?: { open: boolean; onToggle: () => void }
  /** Docked above the dock, left-aligned with it: who waits to join (CALLS-2's KnockBar). */
  notice?: React.ReactNode
  /** Sends a reaction to everyone in the call (lib/calls/signals). */
  onReact?: (emoji: CallReaction) => void
  /** What the people running the call hold for you now (meet-12): those controls stay, dimmed, and say why. */
  held?: ReadonlySet<CallHold>
  /** Your hand (lib/calls/hands): raised or not, and the switch; absent where you can't. */
  hand?: { raised: boolean; onToggle: () => void }
  /** Your feedback beside your name, kept until you take it away, in the React tray. */
  feedback?: { current: CallFeedback | null; onSet: (f: CallFeedback | null) => void }
  /**
   * Ends the call for everyone in it: only for someone who runs it (Call
   * Control). Leave then opens a menu, Leave call or End call for everyone,
   * as Zoom's and Meet's do; for everyone else it leaves at once.
   */
  onEndForAll?: () => void
}

/**
 * Toasts stay 12px above the dock (components/ui/toast.tsx): notices sat over
 * Leave (DESIGN-BUILD-2, 17 Oct). And above the notice on it, the knock bar:
 * on a phone the first Admit's toast lay over Admit all (DESIGN-BUILD-37, 29
 * Oct). An empty notice holds no place.
 */
const dockFloor = (box: DOMRect) => (box.height ? window.innerHeight - box.top + 12 : 0)

/**
 * The control dock (C7): grouped as Zoom groups it, You (mic, camera), Share
 * (screen, captions), Together (Ask AI, chat, layout, record), then Leave on
 * its own as the only danger fill. Always visible: state must be seen. On a
 * phone (the stage's container under @3xl) it spans the bottom with Mic,
 * Camera, Ask AI, More and Leave, each with its word under it.
 */
export function CallDock(p: CallDockProps) {
  const elapsed = useElapsed(p.isRecording ? (p.recordingSince ?? null) : null)
  // The floor is the top of the dock or of the notice on it, whichever is higher.
  const [dock, setDock] = React.useState<HTMLDivElement | null>(null)
  const [notice, setNotice] = React.useState<HTMLDivElement | null>(null)
  const stack = React.useMemo(() => [dock, notice].filter((n): n is HTMLDivElement => n !== null), [dock, notice])
  useRootPlaceOf("--call-dock-floor", stack, dockFloor)
  // Ask AI only where this server has AI (the v1 edition has no AI routes).
  const aiAvailable = useFeature(FEATURE_AI)
  const hasShareGroup = Boolean(p.onToggleShare || p.onToggleCaptions)
  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={setDock}
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
          short={p.talking ? "Talking" : "Mic"}
          shortcut={CONTROL_KEYS.mic}
          state={p.micOn ? "on" : "off"}
          pressed={p.micOn}
          icon={p.micOn ? <Mic /> : <MicOff />}
          onClick={p.onToggleMic}
          menu={p.micMenu}
          {...heldControl(p.held, "microphone", p.micOn)}
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
          {...heldControl(p.held, "camera", p.cameraOn)}
        />

        {/* Share */}
        {hasShareGroup ? <Divider /> : null}
        {p.onToggleShare ? (
          <span className="hidden @3xl:flex">
            {p.board ? (
              <ShareMenu board={p.board} sharing={p.sharing} shareUnavailable={p.shareUnavailable} held={p.held} onToggleShare={p.onToggleShare} />
            ) : p.shareUnavailable ? (
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
                {...heldControl(p.held, "share", !!p.sharing)}
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
              // The name starts with the word it shows (WCAG 2.5.3): a voice user says "People".
              label={`People, ${p.people.count}${p.people.waiting ? `, ${p.people.waiting} waiting to join` : ""}`}
              short="People"
              state={p.people.open ? "active" : "on"}
              pressed={p.people.open}
              icon={<Users />}
              onClick={p.people.onToggle}
              badge={<PeopleCount count={p.people.count} waiting={p.people.waiting} />}
            />
          </span>
        ) : null}
        {p.onChatToggle ? (
          <span className="hidden @3xl:flex">
            <DockButton label="Chat" short="Chat" state={p.isChatOpen ? "active" : "on"} pressed={!!p.isChatOpen} icon={<MessageSquare />} onClick={p.onChatToggle} />
          </span>
        ) : null}
        {p.activities ? (
          <span className="hidden @3xl:flex">
            <DockButton
              // The name starts with the word it shows (WCAG 2.5.3).
              label={p.activities.lit && !p.activities.open ? "Polls and Q&A, something new" : "Polls and Q&A"}
              short="Polls"
              state={p.activities.open ? "active" : "on"}
              pressed={p.activities.open}
              icon={<BarChart3 />}
              onClick={p.activities.onToggle}
              badge={p.activities.lit && !p.activities.open ? <NewDot /> : null}
            />
          </span>
        ) : null}
        {p.breakouts ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label="Breakout rooms"
              short="Rooms"
              state={p.breakouts.open ? "active" : "on"}
              pressed={p.breakouts.open}
              icon={<DoorOpen />}
              onClick={p.breakouts.onToggle}
            />
          </span>
        ) : null}
        {p.hand ? (
          <span className="hidden @3xl:flex">
            <DockButton
              label={p.hand.raised ? "Lower your hand" : "Raise your hand"}
              short={p.hand.raised ? "Lower" : "Raise"}
              shortcut={CONTROL_KEYS.hand}
              state={p.hand.raised ? "active" : "on"}
              pressed={p.hand.raised}
              icon={<Hand />}
              onClick={p.hand.onToggle}
            />
          </span>
        ) : null}
        {p.onReact ? <ReactButton onReact={p.onReact} feedback={p.feedback} held={!!p.held?.has("react")} /> : null}
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
          {p.onEndForAll ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="Leave or end the call" data-dock-leave="" className={LEAVE_BUTTON}>
                      <PhoneOff />
                      <span className="hidden text-ui-sm font-medium @3xl:inline">Leave</span>
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Leave or end the call</TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="top" align="end" className={cn(CALL_SURFACE, "w-56")}>
                <DropdownMenuItem onClick={p.onDisconnect}>
                  <PhoneOff />
                  Leave call
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onClick={p.onEndForAll} data-end-for-all="">
                  <PhoneOff />
                  End call for everyone
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Leave call" data-dock-leave="" onClick={p.onDisconnect} className={LEAVE_BUTTON}>
                  <PhoneOff />
                  <span className="hidden text-ui-sm font-medium @3xl:inline">Leave</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Leave call</TooltipContent>
            </Tooltip>
          )}
          <span className="text-micro font-medium leading-none text-ink-2 @3xl:hidden">Leave</span>
        </span>
        {p.notice ? (
          <div className="absolute inset-x-2 bottom-full mb-2 @3xl:inset-x-auto @3xl:left-0 @3xl:w-max @3xl:max-w-[min(560px,calc(100vw-24px))]" data-dock-notice="" ref={setNotice}>
            {p.notice}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

/** How many are in the call, on People: a quiet count, not an alert; sun, +N, while anyone waits to join. */
function PeopleCount({ count, waiting }: { count: number; waiting?: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-[9px] px-1 text-3xs font-semibold leading-none tabular-nums ring-2 ring-[#1F2024]",
        // Waiting is pending, and pending is sun: the hand chip's strong sun, never a second orange.
        waiting ? "bg-[#F5B544] text-[#1F1500]" : "bg-[#3A3B41] text-[#EEEEF0]",
      )}
    >
      {waiting ? `+${waiting}` : count}
    </span>
  )
}

/**
 * A control the call holds for you, while it would turn something on: dimmed
 * in its place, still pressable, its tooltip and a press saying why (as a
 * phone's Share does). Turning it off is never held. Nothing while not held.
 */
function heldControl(held: ReadonlySet<CallHold> | undefined, what: CallHold, on: boolean) {
  if (on || !held?.has(what)) return {}
  return { "aria-disabled": true, hint: heldReason(what), onClick: () => sayHeld(what) } as const
}

/**
 * React: a tray of six above the dock. A pick goes to everyone and the tray
 * closes, as Zoom's does; Escape or a press outside closes it too. While the
 * call holds reactions the six give way to why, and the signs beside your
 * name stay.
 */
function ReactButton({ onReact, feedback, held }: { onReact: (emoji: CallReaction) => void; feedback?: CallDockProps["feedback"]; held: boolean }) {
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
        className={cn(CALL_SURFACE, "w-auto rounded-[14px] border-0 bg-[#1F2024] p-1.5 shadow-e3")}
        // The React button itself toggles; a press on it is not "outside".
        onPointerDownOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
        {held ? (
          <p className="max-w-[17rem] px-2 py-1.5 text-ui-sm text-ink-2" data-reactions-held="">
            {heldReason("react")}
          </p>
        ) : (
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
        )}
        {feedback ? <FeedbackRow current={feedback.current} onSet={feedback.onSet} onDone={() => setOpen(false)} /> : null}
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

/**
 * A menu row that can't act now, saying why: its icon and name dimmed as a
 * disabled row's are; the reason not, or it read 2.43:1 (DESIGN-BUILD-18,
 * 26 Oct).
 */
function ReasonItem({ icon: Icon, label, reason, className, ...data }: { icon: LucideIcon; label: string; reason: string; className?: string } & { [k: `data-${string}`]: string | undefined }) {
  return (
    <DropdownMenuItem disabled className={cn("data-[disabled]:opacity-100", className)} {...data}>
      <Icon className="opacity-[var(--ix-disabled)]" />
      <span className="flex min-w-0 flex-col">
        <span className="opacity-[var(--ix-disabled)]">{label}</span>
        <span className="text-meta text-ink-3">{reason}</span>
      </span>
    </DropdownMenuItem>
  )
}

/** The board's rows, in Share's menu and the phone's More: present one (or why not), and stop yours. */
function BoardItems({ board, className }: { board: NonNullable<CallDockProps["board"]>; className?: string }) {
  return (
    <>
      {board.present === "yes" ? (
        <DropdownMenuItem onClick={board.onPresent} className={className}>
          <Presentation />
          {board.presenting ? "Present another board" : "Present a board"}
        </DropdownMenuItem>
      ) : (
        <ReasonItem
          icon={Presentation}
          label="Present a board"
          reason={board.present === "held" ? heldReason("share") : `${board.busyBy ?? "Someone"} is presenting a board`}
          className={className}
        />
      )}
      {board.presenting ? (
        <DropdownMenuItem onClick={board.onStop} className={className}>
          <MonitorOff />
          Stop presenting
        </DropdownMenuItem>
      ) : null}
    </>
  )
}

/**
 * Share as a menu, for whoever may present a board (calls package B): the
 * screen or a board, each saying why when it can't, and Stop for whichever
 * of yours is up. Lit while you share either. Its key still shares the
 * screen at once.
 */
function ShareMenu({ board, sharing, shareUnavailable, held, onToggleShare }: Pick<CallDockProps, "sharing" | "shareUnavailable" | "held" | "onToggleShare"> & { board: NonNullable<CallDockProps["board"]> }) {
  const live = !!sharing || board.presenting
  return (
    <DropdownMenu>
      <DockButton
        label="Share"
        short="Share"
        state={live ? "active" : "on"}
        icon={<MonitorUp />}
        trigger={(button) => <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>}
      />
      <DropdownMenuContent side="top" align="center" className={cn(CALL_SURFACE, "mb-2 w-72 p-1")}>
        {shareUnavailable || (held?.has("share") && !sharing) ? (
          <ReasonItem icon={MonitorUp} label="Share screen" reason={shareUnavailable ? "Not available in this browser" : heldReason("share")} />
        ) : (
          <DropdownMenuItem onClick={onToggleShare}>
            {sharing ? <MonitorOff /> : <MonitorUp />}
            {sharing ? "Stop sharing" : "Share screen"}
            <kbd className="kbd ml-auto">{CONTROL_KEYS.share}</kbd>
          </DropdownMenuItem>
        )}
        <BoardItems board={board} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Something new waits behind a dock button (a poll started, a question asked): a dot at its corner. */
function NewDot() {
  return <span aria-hidden className="pointer-events-none absolute right-1 top-1 size-2.5 rounded-[5px] bg-brand ring-2 ring-[#2A2B30]" data-dock-new="" />
}

/** The phone's "More": everything the bottom bar has no room for, as 52px rows. */
function MoreMenu(p: CallDockProps) {
  const any = p.onToggleShare || p.board || p.onToggleRecording || p.onToggleCaptions || p.onLayoutChange || p.onChatToggle || p.people || p.effects || p.activities || p.breakouts
  const lit = !!p.activities?.lit && !p.activities.open
  // A row that opens a panel beside the stage hands the focus to it; any other row gives it back to More only for keys.
  const [handOff] = React.useState(focusHandOff)
  if (!any) return null
  return (
    <span className="flex flex-col items-center gap-1 @3xl:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={lit ? "More call options, something new in Polls and Q&A" : "More call options"} className={cn(DOCK_BUTTON, DOCK_STATE_CLASS.on)}>
            <MoreVertical />
            {lit ? <NewDot /> : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          className={cn(CALL_SURFACE, "mb-2 w-60 p-1")}
          onCloseAutoFocus={handOff.onCloseAutoFocus}
        >
          {p.people?.waiting ? (
            <DropdownMenuItem onClick={handOff.to(p.people.onToggle)} className="h-[52px]" data-more-waiting="">
              <Users className="text-[#F5B544]" />
              <span className="flex-1">{p.people.waiting} waiting to join</span>
              <span className="text-ui-sm font-medium text-ink-2">See who</span>
            </DropdownMenuItem>
          ) : null}
          {/* A phone with no screen capture and a board to present offers the
              board alone: a dead Share screen beside it says nothing useful. */}
          {p.onToggleShare && !(p.board && p.shareUnavailable) ? (
            p.shareUnavailable || (p.held?.has("share") && !p.sharing) ? (
              // A phone with no screen capture, or a call that holds sharing:
              // the row says why rather than doing nothing.
              <ReasonItem
                icon={MonitorUp}
                label="Share screen"
                reason={p.shareUnavailable ? "Not available in this browser" : heldReason("share")}
                className="h-[52px]"
                data-share-unavailable={p.shareUnavailable ? "" : undefined}
                data-share-held={p.shareUnavailable ? undefined : ""}
              />
            ) : (
              <DropdownMenuItem onClick={p.onToggleShare} className="h-[52px]">
                {p.sharing ? <MonitorOff /> : <MonitorUp />}
                {p.sharing ? "Stop sharing" : "Share screen"}
              </DropdownMenuItem>
            )
          ) : null}
          {p.board ? <BoardItems board={p.board} className="h-[52px]" /> : null}
          {p.onToggleCaptions ? (
            <DropdownMenuItem onClick={p.onToggleCaptions} className="h-[52px]">
              {!p.captionsOff && p.showCaptions ? <CaptionsOff /> : <Captions />}
              {captionsAction(p)}
            </DropdownMenuItem>
          ) : null}
          {p.people ? (
            <DropdownMenuItem onClick={handOff.to(p.people.onToggle)} className="h-[52px]">
              <Users />
              <span className="flex-1">People</span>
              <span className="tabular-nums text-ink-3">{p.people.count}</span>
            </DropdownMenuItem>
          ) : null}
          {p.onChatToggle ? (
            <DropdownMenuItem onClick={handOff.to(p.onChatToggle)} className="h-[52px]">
              <MessageSquare />
              Chat
            </DropdownMenuItem>
          ) : null}
          {p.activities ? (
            <DropdownMenuItem onClick={handOff.to(p.activities.onToggle)} className="h-[52px]" data-more-activities="">
              <BarChart3 />
              <span className="flex-1">Polls and Q&amp;A</span>
              {lit ? <span className="text-ui-sm font-medium text-brand-text">New</span> : null}
            </DropdownMenuItem>
          ) : null}
          {p.breakouts ? (
            <DropdownMenuItem onClick={handOff.to(p.breakouts.onToggle)} className="h-[52px]" data-more-breakouts="">
              <DoorOpen />
              Breakout rooms
            </DropdownMenuItem>
          ) : null}
          {p.hand ? (
            <DropdownMenuItem onClick={p.hand.onToggle} className="h-[52px]">
              <Hand />
              {p.hand.raised ? "Lower your hand" : "Raise your hand"}
            </DropdownMenuItem>
          ) : null}
          {p.effects ? (
            <DropdownMenuItem onClick={handOff.to(p.effects.onToggle)} className="h-[52px]">
              <WandSparkles />
              Backgrounds and sound
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

/** Whether this browser can send call audio to a chosen speaker (Safari can't). */
const speakerChoice = () => typeof window !== "undefined" && supportsAudioOutputSelection()

/**
 * A device menu for one kind, reading and switching the room's device, and
 * remembering the pick for the next call. The microphone's lists speakers
 * too, where they can be chosen (CALL-BUG-21). A switch that fails says so.
 */
function RoomDeviceMenu({
  kind,
  label,
  off,
  extra,
  option,
}: {
  kind: "audioinput" | "videoinput"
  label: string
  off: boolean
  extra?: { label: string; onSelect: () => void }
  option?: { label: string; checked: boolean; onChange: (on: boolean) => void }
}) {
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
  return <DeviceMenu label={name} off={off} groups={groups} extra={extra} option={option} />
}

interface VideoControlsProps extends Omit<CallDockProps, "micOn" | "cameraOn" | "onToggleMic" | "onToggleCamera" | "onDisconnect" | "sharing" | "onToggleShare" | "shareUnavailable"> {
  onDisconnect?: () => void
}

/**
 * A device's one switch (lib/calls/deviceSwitch), saying why when it can't
 * (CALL-BUG-1): the dock used to drop the answer, so a refused microphone
 * left the button red and the reason in the console. One switch at a time,
 * for the dock and push to talk alike: a press while the browser still asks
 * for permission waits for it, never asking twice.
 */
function useDeviceSwitch(device: CallDevice, set: (on: boolean) => Promise<unknown>): DeviceSwitch {
  return React.useMemo(() => deviceSwitch(set, (on, e) => showCallFailure(switchFailure(device, on, e))), [device, set])
}

/**
 * A device's switch as the call holds it: while held, turning it on says why
 * instead of asking the browser, and turning it off is never held. The dock's
 * control and an "asked to unmute" notice's Unmute both go through it: the
 * notice's went round the hold, and the browser's refusal then read "Leave
 * and rejoin the call" (CODE-REVIEWER-51, 26 Oct).
 */
function useHeldSwitch(held: ReadonlySet<CallHold> | undefined, what: CallHold, sw: DeviceSwitch): DeviceSwitch {
  const holds = !!held?.has(what)
  return React.useMemo(() => {
    if (!holds) return sw
    const say = () => (sayHeld(what), Promise.resolve(false))
    return { ...sw, to: (on: boolean) => (on ? say() : sw.to(false)), toggle: (shown: boolean) => ((sw.heading() ?? shown) ? sw.to(false) : say()) }
  }, [holds, what, sw])
}

/** What a device switch that failed says: why it couldn't turn on, or that it couldn't turn off. Pure. */
function switchFailure(device: CallDevice, on: boolean, e: unknown): CallFailure | null {
  return on ? callMediaFailure(device, e) : { title: `Couldn't turn off your ${device === "screen" ? "screen share" : device}`, description: "Try again." }
}

/** The dock, wired to the room: the local participant's tracks and devices, and the call's keys (callKeys). */
export function VideoControls({ onDisconnect, ...rest }: VideoControlsProps) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const aiAvailable = useFeature(FEATURE_AI)
  const [shareable] = React.useState(() => canShareScreen())

  const setMic = React.useCallback((on: boolean) => localParticipant.setMicrophoneEnabled(on), [localParticipant])
  // What the call holds for you is said, not tried: the call server would refuse it (meet-12).
  const { held } = rest
  const mic = useHeldSwitch(held, "microphone", useDeviceSwitch("microphone", setMic))
  // The microphone's one switch, holds and all, for an "asked to unmute" notice's Unmute too (unmuteToast).
  React.useEffect(() => publishSwitch(room, "microphone", mic), [room, mic])
  const camera = useHeldSwitch(held, "camera", useDeviceSwitch("camera", React.useCallback((on: boolean) => localParticipant.setCameraEnabled(on), [localParticipant])))
  const share = useHeldSwitch(held, "share", useDeviceSwitch("screen", React.useCallback((on: boolean) => localParticipant.setScreenShareEnabled(on), [localParticipant])))
  const toggleMic = React.useCallback(() => mic.toggle(isMicrophoneEnabled), [mic, isMicrophoneEnabled])
  const toggleCamera = React.useCallback(() => camera.toggle(isCameraEnabled), [camera, isCameraEnabled])
  const toggleShare = React.useCallback(() => share.toggle(isScreenShareEnabled), [share, isScreenShareEnabled])
  const leave = () => (onDisconnect ? onDisconnect() : void room.disconnect())

  // Meet's and Zoom's keys as this computer has them (callKeys' aliases).
  const [mac] = React.useState(isMacLike)
  // The call's keys in the app's keys list (?), first while the call is up.
  React.useEffect(() => showPageKeys({ title: "This call", rows: callShortcutRows(mac) }), [mac])
  // Hold Space to talk while muted (meet-18), on this device unless turned off; a keyboard's choice, so no phone shows it.
  const [talk, setTalk] = React.useState(readPushToTalk)
  const [keyboard] = React.useState(() => typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches)
  const talking = usePushToTalk(talk && keyboard && !held?.has("microphone"), isMicrophoneEnabled, mic)

  // Every key a tooltip teaches, from the one table, never while typing.
  const { onToggleCaptions, onToggleAI, onLayoutChange, layout, hand } = rest
  const actions = React.useMemo<Partial<Record<CallAction, () => void>>>(
    () => ({
      mic: () => void toggleMic(),
      camera: () => void toggleCamera(),
      share: shareable ? () => void toggleShare() : undefined,
      captions: onToggleCaptions,
      ai: aiAvailable ? onToggleAI : undefined,
      layout: onLayoutChange ? () => onLayoutChange(layout === "grid" ? "speaker" : "grid") : undefined,
      hand: hand?.onToggle,
    }),
    [toggleMic, toggleCamera, toggleShare, shareable, onToggleCaptions, aiAvailable, onToggleAI, onLayoutChange, layout, hand?.onToggle],
  )
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = callKeyAction(e, undefined, mac)
      const run = action ? actions[action] : undefined
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [actions, mac])

  return (
    <CallDock
      {...rest}
      micOn={isMicrophoneEnabled}
      talking={talking}
      cameraOn={isCameraEnabled}
      sharing={isScreenShareEnabled}
      onToggleMic={() => void toggleMic()}
      onToggleCamera={() => void toggleCamera()}
      onToggleShare={() => void toggleShare()}
      shareUnavailable={shareable ? undefined : SCREEN_UNAVAILABLE}
      onDisconnect={leave}
      micMenu={
        <RoomDeviceMenu
          kind="audioinput"
          label="Microphone"
          off={!isMicrophoneEnabled}
          extra={rest.effects ? { label: "Noise reduction…", onSelect: rest.effects.onToggle } : undefined}
          option={
            keyboard
              ? {
                  label: "Hold Space to talk",
                  checked: talk,
                  onChange: (on) => {
                    setTalk(on)
                    writePushToTalk(on)
                  },
                }
              : undefined
          }
        />
      }
      cameraMenu={<RoomDeviceMenu kind="videoinput" label="Camera" off={!isCameraEnabled} extra={rest.effects ? { label: "Background effects…", onSelect: rest.effects.onToggle } : undefined} />}
    />
  )
}
