import { lazyView } from "@/lib/lazy/lazyView"

/** Proposing another time (calendar head 4): the form and the proposal rows, loaded where one shows or is asked for. */
export const Proposals = lazyView(() => import("@/components/calendar/rsvp/proposals"))
