"use client";

import { lazyView } from "@/lib/lazy/lazyView";
import { useAsk } from "@/hooks/useAsk";
import type { TellAction, TellChoice } from "@/components/calendar/tellGuestsDialog";

export type { TellAction, TellChoice };

/** The "Tell guests?" dialog, a chunk of its own, fetched when it is first asked. */
export const TellGuestsView = lazyView(() => import("@/components/calendar/tellGuestsDialog"));

/**
 * Asks whether guests are sent a change (D-CAL-5), as a promise: "send",
 * "none" for Don't send, or null when it was closed, which saves nothing.
 */
export function useTellGuests() {
    return useAsk<TellAction, TellChoice>((action, done) => <TellGuestsView.View render={(m) => <m.TellGuestsPrompt action={action} onDone={done} />} fallback={null} />);
}
