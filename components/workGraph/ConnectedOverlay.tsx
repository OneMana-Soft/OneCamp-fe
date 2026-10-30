"use client"

import * as React from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { OverlayBody, OverlayFooter, OverlayHeader, useSheetMode } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Waypoints } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { titleOf, type GraphRootKind } from "@/lib/workGraph/workGraph"
import { ConnectedList } from "./ConnectedList"
import { ConnectionFinder } from "./ConnectionFinder"

type View = "list" | "find"

/**
 * The Connected panel's surface: a popover beside its button, or on a phone
 * (and a short touch screen) a sheet, its header and actions pinned and its
 * body the one scroller (design/drawers-v3). Two views share it: what this
 * is connected to, and "How is this connected to…", pushed in its place
 * with Back, so there is one surface and one scrim.
 */
export default function ConnectedOverlay({
  kind,
  id,
  title,
  anchor,
  onClose,
  onNavigate = onClose,
}: {
  kind: GraphRootKind
  id: string
  title?: string
  anchor: React.RefObject<HTMLButtonElement | null>
  onClose(): void
  onNavigate?: () => void
}) {
  const sheet = useSheetMode()
  const [view, setView] = React.useState<View>("list")
  const [rootTitle, setRootTitle] = React.useState(title ?? "")
  const [hidden, setHidden] = React.useState(false)
  const titleId = React.useId()
  const heading = view === "list" ? "Connected" : "How is this connected to…"
  const subject = rootTitle ? titleOf({ kind, title: rootTitle }) : ""

  const body =
    view === "list" ? (
      <ConnectedList kind={kind} id={id} onRoot={setRootTitle} onHidden={setHidden} onNavigate={onNavigate} />
    ) : (
      <ConnectionFinder kind={kind} id={id} subject={subject} onNavigate={onNavigate} />
    )

  const footer =
    view === "list" && hidden ? null : view === "list" ? (
      // Secondary: the list is what people come for; orange stays for a page's one action.
      <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => setView("find")} data-connected-find="">
        <Waypoints className="size-4" aria-hidden="true" />
        How is this connected to…
      </Button>
    ) : (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setView("list")}>
        Back to connected
      </Button>
    )

  const back =
    view === "find" ? (
      <button
        type="button"
        onClick={() => setView("list")}
        data-interactive="icon"
        className="-ml-1.5 inline-flex size-8 items-center justify-center rounded-md text-ink-2 outline-none transition-colors duration-[140ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Back to what's connected"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
    ) : (
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] bg-sunken text-ink-2">
        <Waypoints className="size-4" />
      </span>
    )

  const head = (
    <div className="flex min-w-0 items-center gap-2.5 text-left">
      {back}
      <div className="min-w-0">
        <p id={titleId} className="truncate text-ui font-semibold text-ink">
          {heading}
        </p>
        {subject ? <p className="truncate text-meta text-ink-3">{subject}</p> : null}
      </div>
    </div>
  )

  if (sheet) {
    return (
      <Drawer open onOpenChange={(open) => !open && onClose()} detent="large">
        <DrawerContent
          aria-describedby={undefined}
          data-connected-panel={kind}
          header={
            <div className="w-full">
              <DrawerTitle className="sr-only">{heading}</DrawerTitle>
              {head}
            </div>
          }
          footer={footer ? <div className="[&>*]:h-11">{footer}</div> : undefined}
        >
          <div className="px-4 pb-2">{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor as React.RefObject<HTMLButtonElement>} />
      <PopoverContent
        align="end"
        sideOffset={6}
        role="dialog"
        aria-labelledby={titleId}
        data-connected-panel={kind}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          anchor.current?.focus()
        }}
        className={cn("flex w-[384px] flex-col gap-0 p-0", "max-h-[min(600px,var(--radix-popover-content-available-height))]")}
      >
        <OverlayHeader className="px-4 pb-3 pt-3.5">{head}</OverlayHeader>
        <OverlayBody className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">{body}</OverlayBody>
        {footer ? <OverlayFooter className="border-t border-line px-4 py-3">{footer}</OverlayFooter> : null}
      </PopoverContent>
    </Popover>
  )
}
