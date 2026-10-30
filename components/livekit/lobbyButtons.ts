import { cn } from "@/lib/utils/helpers/cn"

// The lobby's buttons on the call's dark surface (CALLS-2), for the People
// panel's list and the bar above the dock alike: one primary, the brand fill
// (Admit all when more than one waits, Admit when one does); a neutral
// secondary (Admit beside others, See who); a ghost (Deny, Not now). As the
// approvals card has them: one orange action in sight, never three.
const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-2.5 text-ui-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3.5"

export const LOBBY_PRIMARY = cn(BUTTON, "bg-brand text-brand-foreground hover:bg-brand/90 active:bg-brand/80")
export const LOBBY_SECONDARY = cn(BUTTON, "bg-white/[0.08] text-[#EEEEF0] hover:bg-white/[0.12] active:bg-white/[0.16]")
export const LOBBY_GHOST = cn(BUTTON, "text-ink-2 hover:bg-white/[0.06] hover:text-[#EEEEF0] active:bg-white/[0.10]")
