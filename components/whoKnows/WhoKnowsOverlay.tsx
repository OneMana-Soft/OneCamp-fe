"use client"

import * as React from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { OverlayBody, OverlayFooter, OverlayHeader, useSheetMode } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { Settings2, UserRoundSearch } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { whoKnowsKey } from "@/lib/whoKnows/key"
import { answerLabel, type WhoKnowsAnswer } from "@/lib/whoKnows/whoKnows"
import { WHO_KNOWS_SETTING_HREF, WhoKnowsList } from "./WhoKnowsList"

/** How many people the panel asks for (the server's MaxLimit is 20). */
export const PANEL_LIMIT = 12

/**
 * Who knows about some words, in full: a popover beside its button, or on a
 * phone (and a short touch screen) a sheet, its header and action pinned and
 * its body the one scroller (design/drawers-v3), as the Connected panel is.
 */
export default function WhoKnowsOverlay({
  words,
  anchor,
  onClose,
}: {
  words: string
  anchor: React.RefObject<HTMLButtonElement | null>
  onClose(): void
}) {
  const sheet = useSheetMode()
  const titleId = React.useId()
  const { data, isError, isLoading, mutate } = useFetch<{ data?: WhoKnowsAnswer }>(whoKnowsKey(words, PANEL_LIMIT), undefined, { revalidateOnFocus: false, keepPreviousData: true }, OWN_ERRORS)
  const [retrying, setRetrying] = React.useState(false)
  const answer = data?.data
  const heading = "Who knows"
  const subject = `About “${words}”`

  const body = (
    <WhoKnowsList
      words={words}
      answer={answer}
      error={isError}
      loading={isLoading}
      retrying={retrying}
      onRetry={() => {
        setRetrying(true)
        void mutate().finally(() => setRetrying(false))
      }}
      onNavigate={onClose}
    />
  )

  const footer = (
    <Button asChild variant="secondary" className="w-full gap-2">
      <IntentLink href={WHO_KNOWS_SETTING_HREF} onClick={onClose} data-who-knows-setting="">
        <Settings2 className="size-4" aria-hidden="true" />
        Your Who knows setting
      </IntentLink>
    </Button>
  )

  const head = (
    <div className="flex min-w-0 items-center gap-2.5 text-left">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] bg-sunken text-ink-2">
        <UserRoundSearch className="size-4" />
      </span>
      <div className="min-w-0">
        <p id={titleId} className="truncate text-ui font-semibold text-ink">
          {heading}
        </p>
        <p className="truncate text-meta text-ink-3">{subject}</p>
      </div>
    </div>
  )

  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {answerLabel(answer, words)}
    </p>
  )

  if (sheet) {
    return (
      <Drawer open onOpenChange={(open) => !open && onClose()} detent="large">
        <DrawerContent
          aria-describedby={undefined}
          data-who-knows-panel=""
          header={
            <div className="w-full">
              <DrawerTitle className="sr-only">{`${heading}: ${subject}`}</DrawerTitle>
              {head}
            </div>
          }
          footer={<div className="[&>*]:h-11">{footer}</div>}
        >
          <div className="px-4 pb-2">
            {live}
            {body}
          </div>
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
        data-who-knows-panel=""
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          anchor.current?.focus()
        }}
        className={cn("flex w-[384px] flex-col gap-0 p-0", "max-h-[min(600px,var(--radix-popover-content-available-height))]")}
      >
        <OverlayHeader className="px-4 pb-3 pt-3.5">{head}</OverlayHeader>
        <OverlayBody className="flex-1 overflow-y-auto px-3 pb-2">
          {live}
          {body}
        </OverlayBody>
        <OverlayFooter className="border-t border-line px-4 py-3">{footer}</OverlayFooter>
      </PopoverContent>
    </Popover>
  )
}
