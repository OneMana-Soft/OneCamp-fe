"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils/helpers/cn"
import { lastInputWasPointer, watchInputModality } from "@/lib/ui/inputModality"
import { watchMore } from "@/components/ui/moreMarks"
import { focusDialogItself } from "@/components/ui/overlayFocus"
import { PanelsContext, type Panel } from "@/components/ui/sheetPanels"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

/**
 * The phone's sheet (design v3, mobile C5). Every sheet declares how tall it
 * is, which is also how it behaves:
 *
 *   menu    as tall as its content, at most 92dvh, no grabber: an options
 *           menu (channel, doc, task, calendar options). It dims the page.
 *   medium  as tall as its content, at most 92dvh, with the grabber: most
 *           sheets. It dims the page.
 *   half    half the screen (50dvh, at least 20rem), with the grabber: a
 *           picker whose long list scrolls in it (the emoji picker, a time).
 *           It dims the page.
 *   large   92dvh, with the grabber, and the page behind steps back as a card
 *           (scaled to .94, rounded, dimmed; vaul scales
 *           [data-vaul-drawer-wrapper], the phone's viewport, and app/phone.css
 *           rounds and dims it): the More sheet, filters, a long form.
 *
 * The surface is the pop step at r20 (top corners) and e4, no border, over a
 * scrim of 32% ink (55% black in dark). It rises in 420ms and goes in 300ms on
 * the iOS sheet curve (app/phone.css). A sheet opened from inside another
 * (a field's own sheet in a form) is vaul's nested sheet: it leaves the page's
 * scroll lock to the one under it, which iOS lost when the top one closed, and
 * its scrim lies over that one too (app/phone.css).
 *
 * The on-screen keyboard is app/phone.css's, not vaul's: vaul's input
 * repositioning wrote a height and a bottom on the sheet and, once the keyboard
 * went, left them there (vaul #538, #650): the status sheet stayed lifted, cut
 * off at the top and scrolling (the owner, 17 Oct, on a phone). While the
 * keyboard is up every sheet stands on it, from lib/ui/visualViewport's
 * measure; once it goes nothing was written on the sheet to undo.
 */
export type SheetDetent = "menu" | "medium" | "half" | "large"

const DetentContext = React.createContext<SheetDetent>("medium")
const InSheet = React.createContext(false)

const Drawer = ({
  detent = "medium",
  shouldScaleBackground,
  repositionInputs = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { detent?: SheetDetent }) => {
  const nested = React.useContext(InSheet)
  return (
    <DetentContext.Provider value={detent}>
      <DrawerPrimitive.Root
        shouldScaleBackground={shouldScaleBackground ?? detent === "large"}
        nested={nested}
        repositionInputs={repositionInputs}
        {...props}
      />
    </DetentContext.Provider>
  )
}
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

/** What a close may run past its animation's own time before it is reported for it. */
const CLOSE_GRACE_MS = 250

const seconds = (v: string) => (v.trim().endsWith("ms") ? parseFloat(v) / 1000 : parseFloat(v)) || 0

// Open sheets, so a sheet over a sheet keeps the mark (phone.css C9 reads it).
let openSheets = 0

function markSheetOpen(): () => void {
  openSheets++
  document.documentElement.setAttribute("data-sheet", "open")
  let released = false
  return () => {
    if (released) return
    released = true
    openSheets = Math.max(0, openSheets - 1)
    if (!openSheets) document.documentElement.removeAttribute("data-sheet")
  }
}

/**
 * Radix keeps a closing sheet and its scrim in the page until their close
 * animation reports its end, and Chrome reports nothing when one is
 * interrupted (it fires no animationcancel). The scrim then stayed over the
 * page and took every tap after it (docs C1: Escape on the date sheet, under
 * load). So once a close has had its animation's time and a little more,
 * its end is reported here: Escape, a swipe and a tap outside all close
 * through this one path.
 * It also marks the page while the sheet is open (html[data-sheet]).
 */
function useCloseSettles<T extends HTMLElement>(forwarded: React.ForwardedRef<T>) {
  const [node, setNode] = React.useState<T | null>(null)
  React.useEffect(() => {
    if (!node) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let release: (() => void) | null = null
    const watch = () => {
      clearTimeout(timer)
      const open = node.getAttribute("data-state") === "open"
      if (open && !release) release = markSheetOpen()
      else if (!open && release) {
        release()
        release = null
      }
      if (node.getAttribute("data-state") !== "closed") return
      const style = getComputedStyle(node)
      const ms = (seconds(style.animationDuration) + seconds(style.animationDelay)) * 1000 + CLOSE_GRACE_MS
      timer = setTimeout(() => {
        if (!node.isConnected || node.getAttribute("data-state") !== "closed") return
        const end = new Event("animationend")
        Object.defineProperty(end, "animationName", { value: getComputedStyle(node).animationName.split(",")[0].trim() })
        node.dispatchEvent(end)
      }, ms)
    }
    const observer = new MutationObserver(watch)
    observer.observe(node, { attributes: true, attributeFilter: ["data-state"] })
    watch()
    return () => {
      observer.disconnect()
      clearTimeout(timer)
      release?.()
    }
  }, [node])
  return React.useCallback(
    (el: T | null) => {
      setNode(el)
      if (typeof forwarded === "function") forwarded(el)
      else if (forwarded) forwarded.current = el
    },
    [forwarded],
  )
}

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={useCloseSettles(ref)}
    data-v3-scrim=""
    className={cn("fixed inset-0 z-[var(--z-modal)] bg-[rgb(10_11_14/0.32)] dark:bg-[rgb(0_0_0/0.55)]", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

// A panel's header, loaded with the first panel (components/ui/sheet-panel).
const PanelHeader = lazyPiece(() => import("@/components/ui/sheet-panel"))

/** How tall each detent may be. dvh, never vh (see below). */
const DETENT_HEIGHT: Record<SheetDetent, string> = {
  menu: "max-h-[92dvh]",
  medium: "max-h-[92dvh]",
  half: "h-[max(50dvh,20rem)] max-h-[92dvh]",
  large: "h-[92dvh] max-h-[92dvh]",
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    /** The scrim's look, for a sheet that asks for its own. */
    overlayClassName?: string
    /** The grabber's look. */
    handleClassName?: string
    /**
     * Drawn on the sheet itself, outside its scrolling body: something that
     * floats over the sheet's edge (the long-press sheet's message preview,
     * above it), which the body's overflow would clip.
     */
    above?: React.ReactNode
    /**
     * The sheet's header (design v3, mobile C5: a 52px row, its title at
     * 17/590 centred), pinned over its one scroller as shadcn's drawer keeps
     * its header out of the part that scrolls: what the sheet is for stays in
     * sight while what it holds scrolls under it, the keyboard up or not.
     */
    header?: React.ReactNode
    /**
     * The sheet's actions (Save, Set status), pinned under its one scroller
     * above the home-indicator strip, as shadcn's DrawerFooter sits outside
     * its scroll region: in reach of a thumb while the rest scrolls, and on
     * the keyboard while a field has it. At the end of the scroller the
     * status sheet's Set status sat under the screen's edge on an iPhone.
     */
    footer?: React.ReactNode
  }
>(({ className, children, overlayClassName, handleClassName, above, header, footer, onEscapeKeyDown, onOpenAutoFocus, onCloseAutoFocus, onFocusCapture, ...props }, ref) => {
  const detent = React.useContext(DetentContext)
  const settles = useCloseSettles(ref)
  // Where the focus came from as it first went into the sheet: what opened it,
  // which a key that closes the sheet gives it back to.
  const opener = React.useRef<HTMLElement | null>(null)
  // The keys that close it are known for keys (lib/ui/inputModality).
  React.useEffect(() => watchInputModality(), [])
  // Its panels (components/ui/sheetPanels); focus and scroll come back as the last closes.
  const [stack, setStack] = React.useState<Panel[]>([])
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const was = React.useRef<{ focus: Element | null; scroll: number } | null>(null)
  const top = stack[stack.length - 1] ?? null
  const ops = React.useMemo(
    () => ({
      push: (p: Panel) =>
        setStack((s) => {
          if (!s.length) was.current = { focus: document.activeElement, scroll: body.current?.scrollTop ?? 0 }
          return [...s.filter((x) => x.key !== p.key), p]
        }),
      pop: (key: string) => setStack((s) => s.filter((x) => x.key !== key)),
    }),
    [],
  )
  const panels = React.useMemo(() => ({ ...ops, top, host }), [ops, top, host])
  React.useLayoutEffect(() => {
    const b = body.current
    if (host && b) {
      b.scrollTop = 0
      host.focus({ preventScroll: true })
    } else if (!top && was.current && b) {
      b.scrollTop = was.current.scroll
      if (was.current.focus instanceof HTMLElement && was.current.focus.isConnected) was.current.focus.focus({ preventScroll: true })
      was.current = null
    }
  }, [host, top])
  // The header's and footer's hairlines follow the body. A ref: the portal draws it a render after this mounts.
  const bodyRef = React.useCallback((el: HTMLDivElement | null) => {
    body.current = el
    const undo = watchMore(el)
    return () => {
      undo?.()
      body.current = null
    }
  }, [])
  const titleId = React.useId()
  return (
    <DrawerPortal>
      {/* A tap on the scrim closes the sheet and nothing else. React carries
          its click up the tree the portal came from, so the scrim of a sheet
          opened inside a row (a tree row's "⋯") opened the row's page too:
          the click stops here. Stopped, it no longer reaches the document,
          where Radix closes a sheet on a finger's tap outside (a mouse's press
          has closed it already), so the scrim is the sheet's close, as Done
          is: the dialog's own, vaul's onOpenChange, which a sheet that isn't
          dismissible refuses. It stays a layer, with no button's type. */}
      <DrawerClose asChild type={undefined} onClick={(event) => event.stopPropagation()}>
        <DrawerOverlay className={overlayClassName} />
      </DrawerClose>
      <DrawerPrimitive.Content
        ref={settles}
        data-v3-sheet=""
        data-overlay="sheet"
        // Its footer is its foot on a phone (app/overlay.css 8b), with nothing under it.
        data-overlay-holds-footer={footer ? "" : undefined}
        data-detent={detent}
        className={cn(
          // The pop surface at e4, no border; the r20 top corners are
          // app/phone.css's ([data-v3-sheet]), the sheet step.
          "fixed inset-x-0 bottom-0 z-[var(--z-modal)] flex h-auto flex-col bg-pop shadow-e4",
          // A sheet taller than the screen used to grow off the top of it.
          //
          // The element is fixed to the bottom with an automatic height, so
          // `mt-24` never applied: margin does nothing to a fixed box with no
          // top. Content simply extended past the top edge and was clipped, and
          // the rows up there could not be reached by any gesture. The More menu
          // is the one people meet, because it is the longest, but only three of
          // the twenty-nine drawers handled their own height and none capped it,
          // so this was every drawer on a short screen.
          //
          // dvh, not vh: on mobile Safari `vh` is the tall viewport, measured as
          // if the address bar were hidden, so a 92vh sheet still runs under the
          // bar when it is not.
          DETENT_HEIGHT[detent],
          // Reserve the home-indicator strip. layout.tsx sets viewportFit:"cover",
          // so a `bottom-0` sheet genuinely extends under it, and the OS owns the
          // bottom ~34px for its swipe gesture. Without this the last row of every
          // drawer (Apply/Clear in the filter drawers, the last option in every
          // options drawer) sits where the system swipe wins and the tap opens the
          // app switcher instead. One line here covers all the drawers; on a
          // phone a footer keeps the strip instead (app/overlay.css 8b).
          "pb-[env(safe-area-inset-bottom)]",
          // The sheet takes focus when it opens, to hold it inside; it is a
          // surface, not a control, so it draws no ring. After a tap on a
          // name, Chrome counted that focus as visible and outlined the whole
          // profile sheet in the accent (critic integration, 12 Oct).
          "outline-none",
          // A menu has no grabber; its first group starts 8px down.
          detent === "menu" && "pt-2",
          className
        )}
        // One layer a press: a panel, then the sheet.
        onEscapeKeyDown={(event) => {
          if (top) {
            event.preventDefault()
            top.onBack()
            return
          }
          onEscapeKeyDown?.(event)
        }}
        // It takes the focus as it opens, on itself, never its first field (a
        // tap would throw up a phone's keyboard): vaul leaves the focus where
        // it was, behind the sheet, unless autoFocus is set, and a keyboard
        // there was lost (27 Oct). A caller's own choice comes first.
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (!event.defaultPrevented) focusDialogItself(event)
        }}
        onFocusCapture={(event) => {
          const from = event.relatedTarget
          if (!opener.current && from instanceof HTMLElement && !event.currentTarget.contains(from)) opener.current = from
          onFocusCapture?.(event)
        }}
        // A key that closes it gives the focus back to what opened it; after a
        // pointer or a tap it stays put, as a menu's does (returnFocusOnlyForKeys):
        // no ring on the opener, and no field throwing up the keyboard. A
        // caller's own choice comes first.
        onCloseAutoFocus={(event) => {
          const to = opener.current
          opener.current = null
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          if (to?.isConnected && !lastInputWasPointer()) to.focus({ preventScroll: true })
        }}
        {...props}
      >
        {above}
        {/* The grabber, on a sheet that can be dragged taller or away: 36x5 in
            line-3, 6px from the top. It stays put; the content below it
            scrolls. A drawer whose own body already scrolls keeps doing so and
            this never engages. overscroll-contain stops a flick at the end of
            the list from scrolling the page underneath the sheet. */}
        {detent !== "menu" && (
          <div aria-hidden="true" data-drawer-handle="" data-v3-grabber="" className={cn("mx-auto mt-1.5 mb-1 shrink-0", handleClassName)} />
        )}
        {/* The sheet's one scroller, up and down only. Scrolling one way made
            it scroll the other too (an overflow that isn't visible turns the
            other to auto), so the status sheet's suggestions, 4px past each
            side, gave it a sideways bar beside its own. A row meant to go
            sideways scrolls itself (overflow-x-auto, overflow-y-hidden), and
            nothing in here scrolls up and down beside the body
            (e2e/phoneSheets.spec.ts). */}
        <InSheet.Provider value>
            <PanelsContext.Provider value={panels}>
              {/* Its own header keeps 8px over and under what it holds, so a
                  description clears the hairline under it while the body has
                  more above (overlay.css #4); a lone title stands where it did. */}
              {header || top ? (
                <div data-sheet-header="" data-overlay-header="" className={cn("flex min-h-13 shrink-0 flex-col items-center justify-center px-4 text-center", !top && "py-2")}>
                  {header ? <div className={top ? "hidden" : "contents"}>{header}</div> : null}
                  {top ? (
                    <React.Suspense fallback={<span className="h-11" />}>
                      <PanelHeader id={titleId} title={top.title} onBack={top.onBack} />
                    </React.Suspense>
                  ) : null}
                </div>
              ) : null}
              <div ref={bodyRef} data-sheet-body="" className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
                <div data-sheet-base="" className={top ? "hidden" : "contents"}>
                  {children}
                </div>
                {/* At its content's height: shrunk to the body, its sticky top (a time's box) scrolled away. */}
                {top ? <div key={top.key} ref={setHost} data-sheet-panel="" role="region" aria-labelledby={titleId} tabIndex={-1} className="sheet-panel-in flex shrink-0 flex-col outline-none" /> : null}
              </div>
              {/* overlay.css #4: a hairline while the body has more below. On
                  the sheet's own fill, what scrolls fades out above its top
                  edge (phone.css), not cut at a line; the body's end room
                  stays in view over it, so its last row clears the fade. Its
                  foot on a phone is every phone sheet's (overlay.css #8b: its
                  16px gutter, or the strip); pb-4 is its foot off a phone. */}
              {footer ? (
                <div data-sheet-footer="" data-overlay-footer="" className="relative shrink-0 bg-inherit px-4 pb-4 pt-3">
                  {footer}
                </div>
              ) : null}
            </PanelsContext.Provider>
        </InSheet.Provider>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = "DrawerContent"

/**
 * Centred: the v3 sheet's header has its title centred (mobile C5), as
 * shadcn's drawer centres its header on a phone. The 10 Oct primitives pass
 * set it left, the day before v3 was approved.
 */
const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, asChild, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    asChild={asChild}
    // With asChild the child is the title (a heading the sheet's content
    // already draws, as the event card's), and it keeps its own look.
    className={asChild ? className : cn("text-lg font-semibold leading-tight [text-wrap-style:balance]", className)}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground text-pretty", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
