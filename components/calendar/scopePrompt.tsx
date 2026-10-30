"use client";

import { lazyView } from "@/lib/lazy/lazyView";
import { useAsk } from "@/hooks/useAsk";
import type { RepeatScope } from "@/lib/calendar/repeat";
import type { ScopeAction } from "@/components/calendar/scopePromptDialog";

export type { ScopeAction };

// The prompt's dialog is a chunk of its own, never the route's: the calendar
// fetches it when the page is idle, so the question never waits for it.
export const ScopePromptView = lazyView(() => import("@/components/calendar/scopePromptDialog"));

/**
 * Asks the scope of a change to one instance of a repeating event (PROGRAM.md
 * D-CAL-6), as a promise: the scope chosen, or null when the prompt was
 * closed, which changes nothing. The host renders `prompt` where it renders
 * its dialogs.
 */
export function useScopePrompt() {
    return useAsk<ScopeAction, RepeatScope>((action, done) => <ScopePromptView.View render={(m) => <m.ScopePrompt action={action} onDone={done} />} fallback={null} />);
}
