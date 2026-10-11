"use client"

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AlertTriangle, ChevronDown, Info, WifiOff, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The tones a notice can take (design v3, shell T2), in the order they win a
 * place when more than two want one: danger, offline, warning, info, brand.
 */
const TONE = {
  danger: { cls: "notice-danger", icon: AlertTriangle, rank: 0 },
  offline: { cls: "notice-warning", icon: WifiOff, rank: 1 },
  warning: { cls: "notice-warning", icon: AlertTriangle, rank: 2 },
  info: { cls: "notice-info", icon: Info, rank: 3 },
  brand: { cls: "notice-brand", icon: null, rank: 4 },
} as const

export type NoticeTone = keyof typeof TONE

/** How many notices show before the rest fold into "+N more notices". */
export const NOTICES_SHOWN = 2

interface StackApi {
  register: (id: string, rank: number) => () => void
  isShown: (id: string) => boolean
  order: (id: string) => number
}

const StackContext = createContext<StackApi | null>(null)

/**
 * The notices at the top of the sheet, as one family (shell T2). Each notice
 * still decides for itself whether it is needed; the stack decides which of
 * them show: at most two, the most urgent first, and the rest behind a "+N
 * more notices" row that opens them. Five banners (offline, email off, the
 * disk, an import, the demo note) once stacked to a sixth of the screen.
 *
 * It sits inside the sheet, above the page: notices push the work down once,
 * when they arrive, and never cover it.
 */
/**
 * shown: how many notices show before the rest fold into "+N more". Two in
 * the sheet (shell T2); one on a phone, where 390px can spare one strip
 * (design v3, mobile C10), the most urgent by rank.
 */
export function NoticeStack({ children, shown = NOTICES_SHOWN }: { children: ReactNode; shown?: number }) {
  const [entries, setEntries] = useState<{ id: string; rank: number; seq: number }[]>([])
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  const register = useCallback((id: string, rank: number) => {
    const s = seq.current++
    setEntries((prev) => [...prev.filter((e) => e.id !== id), { id, rank, seq: s }])
    return () => setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const sorted = useMemo(() => [...entries].sort((a, b) => a.rank - b.rank || a.seq - b.seq), [entries])
  const api = useMemo<StackApi>(
    () => ({
      register,
      isShown: (id) => {
        const at = sorted.findIndex((e) => e.id === id)
        return at === -1 || open || at < shown
      },
      order: (id) => Math.max(0, sorted.findIndex((e) => e.id === id)),
    }),
    [register, sorted, open, shown],
  )
  const hidden = Math.max(0, sorted.length - shown)

  return (
    <StackContext.Provider value={api}>
      <div data-notice-stack="" className="flex shrink-0 flex-col">
        {children}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            style={{ order: 999 }}
            className="notice-more flex h-7 items-center gap-1 border-b border-line pl-4 text-left text-2xs font-medium text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            {open ? "Fewer notices" : `+${hidden} more ${hidden === 1 ? "notice" : "notices"}`}
            <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
    </StackContext.Provider>
  )
}

/** The workspace mark at 16px, for the brand tone (the demo, an upgrade). */
function NoticeMark() {
  return (
    <span className="notice-mark" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" strokeWidth="4" />
      </svg>
    </span>
  )
}

/**
 * A notice's one action: a 26px secondary button ("Set up email", "Free
 * space", "Got it"). Pass className to a Link to make it look the same.
 */
export const noticeActionClass =
  "notice-action inline-flex h-[26px] shrink-0 [@media(pointer:coarse)]:h-11 items-center whitespace-nowrap rounded-[7px] bg-raised px-2.5 font-medium text-ink shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"

/**
 * One line across the top of the sheet that says something about the whole
 * app: email that can't go out, a filling disk, an import that finished, the
 * network gone (design v3, shell T2; mock M4). 40px at least, 13px words with
 * a bold lead phrase, one action, and a 26px dismiss (44px under a finger).
 *
 * In a NoticeStack it takes its place by urgency, and shows only if it is
 * among the two that do. Outside one it simply shows.
 */
export function NoticeBar({
  tone = "info",
  role = "status",
  lead,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  icon,
}: {
  tone?: NoticeTone
  role?: "status" | "alert"
  /** The fact, in bold ink: "Email is off." */
  lead?: ReactNode
  children?: ReactNode
  /** One secondary action (a button or link with noticeActionClass). */
  action?: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  /** A leading mark in place of the tone's icon (an import's spot). */
  icon?: ReactNode
}) {
  const t = TONE[tone]
  const id = useId()
  const stack = useContext(StackContext)
  const register = stack?.register
  useLayoutEffect(() => (register ? register(id, t.rank) : undefined), [register, id, t.rank])
  if (stack && !stack.isShown(id)) return null
  const Icon = t.icon
  return (
    <div
      data-notice={tone}
      role={role}
      style={stack ? { order: stack.order(id) } : undefined}
      className={cn("notice flex min-h-10 items-center gap-2.5 border-b border-line py-1.5 pl-4 text-xs text-ink-2", onDismiss || action ? "pr-4 sm:pr-2" : "pr-4", t.cls)}
    >
      {icon ?? (Icon ? <Icon className="notice-icon size-3.5 shrink-0" aria-hidden="true" /> : <NoticeMark />)}
      <div className="min-w-0 flex-1 py-0.5">
        {lead && <b className="font-semibold text-ink">{lead}</b>}
        {lead && children ? " " : null}
        {children}
      </div>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "inline-flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-ink-3 transition-colors hover:bg-hover hover:text-ink [@media(pointer:coarse)]:size-11",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
