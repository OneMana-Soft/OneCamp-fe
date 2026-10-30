"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { TooltipContent } from "@/components/ui/tooltip"
import { isBusyPointer, watchScrolling } from "@/lib/ui/scrollState"

/**
 * Why a control is disabled, in the app's tooltip (18 Oct 2026): portalled to
 * the body, so no clip around the control cuts it, and kept on screen by its
 * collision handling. It opens under the pointer after the tooltips' 400 ms
 * and at once with keyboard focus; the control stays focusable
 * (aria-disabled) and names it (aria-describedby).
 *
 * The reason was a CSS ::after centred above its control (bbe10852e), and any
 * overflow clip around the control cut it: in the new-task dialog the Attach
 * tip read "a project first", and the top row of a read-only list read
 * "project's members can change it".
 *
 * Button (disabledReason) and TaskCheck draw their control themselves, at
 * once, and load this lazily beside it, so no route's first load carries a
 * tooltip for a control that may never be disabled. Its own provider, as
 * Button sits on pages without the app's.
 *
 * The control is never drawn again for its tip (22 Oct 2026). It was drawn as
 * Radix's trigger once this chunk came, a new node in the old one's place, and
 * a pointer or focus already on the old node was lost: Radix opens on
 * pointermove, and a pointer at rest sends none. The read-only list's check
 * never said why when the list was drawn again under the pointer
 * (e2e/disabledTip.spec.ts:70, batch 6b). Now Radix's trigger is the
 * control's own node (OnControl), and what reached it before the chunk is
 * answered as it lands.
 */
export default function DisabledTip({ reason, control }: { reason: string; control: Control }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <OnControl control={control} />
        </TooltipPrimitive.Trigger>
        <TooltipContent className="max-w-[240px] text-center">{reason}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

/** Radix's trigger handlers, each on the native event React's stands for (its onFocus and onBlur are focusin and focusout). */
const HANDLERS = {
  pointermove: "onPointerMove",
  pointerleave: "onPointerLeave",
  pointerdown: "onPointerDown",
  focusin: "onFocus",
  focusout: "onBlur",
  click: "onClick",
} as const
type Handler = (typeof HANDLERS)[keyof typeof HANDLERS]
type TriggerProps = Partial<Record<Handler, (e: Event) => void>> & { "aria-describedby"?: string }

/**
 * The control: TaskCheck's ref, or the id Button tags its control with
 * (data-tip-control), as a server component, which Button may be, has no refs.
 */
type Control = string | React.RefObject<HTMLElement | null>
const nodeOf = (control: Control) =>
  typeof control === "string" ? document.querySelector<HTMLElement>(`[data-tip-control="${CSS.escape(control)}"]`) : control.current

/** How soon after the tip comes a pointerenter with no pointermove still means the control was drawn under a resting pointer. */
const DRAWN_UNDER_MS = 1000
/** What Radix reads of the event it is handed: a mouse's pointer, and nothing prevented. */
const MOUSE = { pointerType: "mouse", defaultPrevented: false } as unknown as Event
const FOCUS = { defaultPrevented: false } as unknown as Event

const matches = (el: Element, selector: string) => {
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}
/** A screen with a pointer that hovers: a phone's tap leaves :hover behind, and asks for no tip. */
const hovers = () => typeof window.matchMedia !== "function" || window.matchMedia("(hover: hover)").matches

/** Makes `node` what `ref` holds, and returns how to let it go (a React 19 ref may hand back its own cleanup). */
function assign(ref: React.ForwardedRef<HTMLElement>, node: HTMLElement): () => void {
  if (typeof ref === "function") {
    const cleanup = (ref as (el: HTMLElement | null) => unknown)(node)
    return typeof cleanup === "function" ? (cleanup as () => void) : () => ref(null)
  }
  if (ref) ref.current = node
  return () => {
    if (ref) ref.current = null
  }
}

/**
 * Radix's trigger, made of the control's own node. What Radix's Trigger hands
 * its child (the ref that makes a node the trigger and the tip's anchor, its
 * handlers, aria-describedby while open) goes onto the node the control's
 * owner drew, and nothing is drawn here.
 *
 * A control drawn under a pointer at rest (its list or row drawn again) gets
 * the browser's pointerover and pointerenter, and no pointermove. That counts
 * as the pointer moving onto it, once, within DRAWN_UNDER_MS of the tip
 * coming, if the pointer hasn't moved and nothing has scrolled since and the
 * page isn't scrolling or dragging (lib/ui/scrollState). A scroll carries rows
 * under a resting pointer, and those get no tip: that is why Radix waits for
 * pointermove.
 */
const OnControl = React.forwardRef<HTMLElement, TriggerProps & { control: Control }>(function OnControl(
  { control, "aria-describedby": describedBy, ...handlers },
  ref,
) {
  const latest = React.useRef(handlers)
  const refNow = React.useRef(ref)
  React.useLayoutEffect(() => {
    latest.current = handlers
    refNow.current = ref
  })

  // The node is Radix's trigger and its tip's anchor. Radix's composed ref is a new function on each of its renders,
  // over the same refs, so the first one is kept rather than letting the node go and taking it back each time.
  React.useLayoutEffect(() => {
    const node = nodeOf(control)
    return node ? assign(refNow.current, node) : undefined
  }, [control])

  // While the tip is open, the control names it, beside whatever else describes it.
  React.useLayoutEffect(() => {
    const node = nodeOf(control)
    if (!node || !describedBy) return
    const own = node.getAttribute("aria-describedby")
    node.setAttribute("aria-describedby", own ? `${own} ${describedBy}` : describedBy)
    return () => {
      const rest = (node.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .filter((id) => id && id !== describedBy)
        .join(" ")
      if (rest) node.setAttribute("aria-describedby", rest)
      else node.removeAttribute("aria-describedby")
    }
  }, [control, describedBy])

  React.useLayoutEffect(() => {
    const node = nodeOf(control)
    if (!node) return
    const call = (name: Handler, e: Event) => latest.current[name]?.(e)
    const off: (() => void)[] = []
    const on = (target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, options)
      off.push(() => target.removeEventListener(type, fn, options))
    }
    for (const [type, name] of Object.entries(HANDLERS) as [keyof typeof HANDLERS, Handler][]) on(node, type, (e) => call(name, e))

    watchScrolling()
    const came = performance.now()
    let still = !isBusyPointer()
    const moved = () => void (still = false)
    on(document, "pointermove", moved, { capture: true, passive: true })
    on(window, "scroll", moved, { capture: true, passive: true })
    on(node, "pointerenter", (e) => {
      if (!still || (e as PointerEvent).pointerType === "touch" || isBusyPointer() || performance.now() - came > DRAWN_UNDER_MS) return
      still = false
      call("onPointerMove", e)
    })

    // Pointed at, or focused from the keys, before the tip's code came.
    if (still && hovers() && matches(node, ":hover")) call("onPointerMove", MOUSE)
    else if (document.activeElement === node && matches(node, ":focus-visible")) call("onFocus", FOCUS)
    return () => off.forEach((f) => f())
  }, [control])

  return null
})
