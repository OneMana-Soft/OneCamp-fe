"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** What the organiser is about to do that guests would hear of. */
export type TellAction = "change" | "invite" | "delete";

/** "Send", or "Don't send" (guests are told in OneCamp alone: PROGRAM.md D-CAL-5). */
export type TellChoice = "send" | "none";

const COPY: Record<TellAction, { title: string; description: string }> = {
    change: {
        title: "Send an update to your guests?",
        description: "Guests see the change in OneCamp either way. Send also notifies them, and emails anyone invited by email.",
    },
    invite: {
        title: "Send the invitation?",
        description: "Guests see it in OneCamp either way. Send also notifies them, and emails anyone invited by email.",
    },
    delete: {
        title: "Tell your guests it's cancelled?",
        description: "It goes from their calendars either way. Send also notifies them, and emails anyone invited by email.",
    },
};

/**
 * "Tell guests?" (PROGRAM.md D-CAL-5): a change guests would hear of asks
 * whether to send it, as Google Calendar does. Send is chosen and focused;
 * Don't send tells them in OneCamp alone; closing goes back, and nothing
 * is saved.
 */
export function TellGuestsPrompt({ action, onDone }: { action: TellAction; onDone: (choice: TellChoice | null) => void }) {
    const copy = COPY[action];
    return (
        <Dialog open onOpenChange={(open) => !open && onDone(null)}>
            <DialogContent size="sm" data-tell-guests={action}>
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onDone("none")}>
                        Don&apos;t send
                    </Button>
                    <Button type="button" autoFocus onClick={() => onDone("send")}>
                        Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
