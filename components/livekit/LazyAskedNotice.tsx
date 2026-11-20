"use client"

import { Button } from "@/components/ui/button"
import { lazyPart } from "@/lib/lazy/lazyPart"
import type { AskedNoticeProps } from "./AskedNotice"
import { callNoticeCard } from "./callNoticeCard"

/** Its code couldn't come: the guest is still held, so it says so, with Try again and Leave call. */
function Unavailable({ mark, title, data, onLeave, retry }: AskedNoticeProps & { retry: () => void }) {
  return (
    <div role="alert" data-part-failed="" {...data} className={callNoticeCard}>
      <p className="flex items-center gap-2 font-medium">
        {mark}
        {title}
      </p>
      <p className="mt-1 text-[#A8ABB1]">This notice didn&apos;t load. Check your connection, then try again.</p>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onLeave} className="text-danger-ink hover:text-danger-ink">
          Leave call
        </Button>
        <Button size="sm" variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  )
}

/**
 * The notice that asks first (zoom-09): a guest's alone, so its one import()
 * is here, imported by the guest's call page alone (GuestMeeting) and handed
 * to the call as asked. An import() inside the call built a copy of it, and of
 * the dialog it draws with, for every kind of page that holds a call, though
 * no member ever opens it (callBuildsOnceGuard). Its code comes the first time
 * a notice asks (lazyPart, already on the page for the call itself).
 */
export const LazyAskedNotice = lazyPart<AskedNoticeProps>(() => import("./AskedNotice").then((m) => m.default), { failed: Unavailable }).Part
