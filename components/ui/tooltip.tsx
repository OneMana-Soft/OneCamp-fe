"use client"

import * as React from "react"
import type * as Radix from "@radix-ui/react-tooltip"
import { Slot } from "@radix-ui/react-slot"

import { isTouchScreen } from "@/lib/ui/touchScreen"
import { useLongPress } from "@/hooks/useLongPress"
import { lazyChunk } from "@/lib/loadChunk"
import type { Ev, Shown, Tip } from "./tooltipBridge"

// By input: a mouse waits 400ms (300ms skip), keys show it, a touch screen a long press. Closed, only the trigger
// draws (H2, 5 Nov); Radix comes on idle or with a mouse or keys, on its node (tooltipBridge); a mouse or a focus waits for it.
const Skips = React.createContext<Tip["p"]>({})

const TooltipProvider = ({ delayDuration: d, skipDelayDuration: s, disableHoverableContent: h, children }: Radix.TooltipProviderProps) => (
  <Skips.Provider value={React.useMemo(() => ({ d, s, h }), [d, s, h])}>{children}</Skips.Provider>
)

const chunk = lazyChunk(() => import("./tooltipBridge"))
let code: typeof import("./tooltipBridge") | null = null
export const warmTooltip = () => chunk.use(() => undefined).then((c) => (code ||= c))
const warm = () => void warmTooltip()
let idle = 0
const onIdle = () => void (idle++ || ("requestIdleCallback" in window ? requestIdleCallback(warm, { timeout: 3000 }) : setTimeout(warm, 1500)))

const TipOf = React.createContext<Tip | null>(null)

const Tooltip = ({ children, delayDuration = 400, open, defaultOpen = false, onOpenChange, ...props }: Radix.TooltipProps) => {
  const [own, setOwn] = React.useState(defaultOpen)
  const [joined, setJoined] = React.useState(false)
  const [shown, show] = React.useState<Shown>(["closed"])
  const m = React.useRef<Tip["m"]>({ hand: {}, due: null }).current
  const isOpen = open ?? own
  if (isOpen && !joined) setJoined(true)
  m.live = joined
  m.open = isOpen
  const set = (next: boolean) => {
    if (open === undefined) setOwn(next)
    onOpenChange?.(next)
  }
  const latest = React.useRef(set)
  React.useEffect(() => {
    latest.current = set
  })
  React.useEffect(onIdle, [])
  const press = useLongPress(React.useCallback(() => latest.current(true), []), { threshold: 500 })
  const settle = () => {
    clearTimeout(m.timer)
    m.timer = window.setTimeout(() => !m.open && !m.entered && !m.focused && setJoined(false), 200)
  }
  React.useEffect(() => {
    if (joined && !isOpen) settle()
    return () => clearTimeout(m.timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, isOpen])
  const tip: Tip = {
    live: joined,
    shown,
    show,
    el: press.ref,
    m,
    join: (due) => {
      if (m.live || isTouchScreen()) return
      m.due = [...due, Date.now()]
      setJoined(true)
    },
    settle,
    root: { ...props, delayDuration, open: isOpen, onOpenChange: (next) => (next && isTouchScreen() ? undefined : set(next)) },
    p: React.useContext(Skips),
  }
  return <TipOf.Provider value={tip}>{children}</TipOf.Provider>
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, Radix.TooltipTriggerProps>(({ asChild, ...props }, ref) => {
  const tip = React.useContext(TipOf)!
  const { m, el } = tip
  const refs = React.useCallback(
    (node: HTMLButtonElement | null) => {
      el.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [el, ref],
  )
  const on = <T extends React.SyntheticEvent>(name: Ev, mine?: (e: T) => unknown) => (e: T) => {
    ;(props[name] as ((e: React.SyntheticEvent) => void) | undefined)?.(e)
    if (e.defaultPrevented) return
    mine?.(e)
    m.hand[name]?.(e)
  }
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-state={tip.shown[0]}
      aria-describedby={tip.shown[1]}
      {...props}
      ref={refs}
      onPointerMove={on("onPointerMove", (e: React.PointerEvent) => e.pointerType !== "touch" && ((m.entered = true), tip.join(["onPointerMove", e])))}
      onPointerLeave={on("onPointerLeave", () => {
        m.entered = false
        m.due = null
        tip.settle()
      })}
      onPointerDown={on("onPointerDown", () => {
        m.down = true
        document.addEventListener("pointerup", () => (m.down = false), { once: true })
      })}
      onFocus={on("onFocus", (e) => m.down || ((m.focused = true), tip.join(["onFocus", e])))}
      onBlur={on("onBlur", () => ((m.focused = false), (m.due = null), tip.settle()))}
      onClick={on("onClick", () => (m.due = null))}
    />
  )
})
TooltipTrigger.displayName = "TooltipTrigger"

const TooltipContent = React.forwardRef<HTMLDivElement, Radix.TooltipContentProps>((props, ref) => {
  const tip = React.useContext(TipOf)
  return tip && !tip.live ? null : <Late tip={tip} props={props} to={ref} />
})
TooltipContent.displayName = "TooltipContent"

function Late({ tip, props, to }: { tip: Tip | null; props: Radix.TooltipContentProps; to: React.ForwardedRef<HTMLDivElement> }) {
  const [c, set] = React.useState(code)
  React.useEffect(() => void (c || warmTooltip().then((x) => x && set(x))), [c])
  return c && <c.TooltipChip tip={tip} {...props} ref={to} />
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
