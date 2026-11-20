"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { RepeatScope } from "@/lib/calendar/repeat";

export type ScopeAction = "change" | "rooms" | "delete" | "answer";

const COPY: Record<ScopeAction, { title: string; description: string; confirm: string }> = {
    change: { title: "Change a repeating event", description: "Which events should this change?", confirm: "Save" },
    rooms: { title: "Change a repeating event", description: "A series books its rooms for every event. Which events should this change?", confirm: "Save" },
    delete: { title: "Delete a repeating event", description: "Which events should go to the trash?", confirm: "Delete" },
    answer: { title: "Answer a repeating event", description: "Which events is your answer for?", confirm: "Send" },
};

const SCOPES: { value: RepeatScope; label: string }[] = [
    { value: "this", label: "This event" },
    { value: "following", label: "This and following events" },
    { value: "all", label: "All events" },
];

/**
 * The scope prompt (PROGRAM.md D-CAL-6): a change to one instance of a
 * repeating event, a drag or a delete, asks what it is for. "This event" is
 * chosen and focused, so Enter keeps the change to the one instance; closing
 * it changes nothing. A guest's answer (calendar A2) is for this event or all
 * of them: an answer has no "and following". A change to its rooms (gcal-6)
 * is for this and following events or all of them: a series books its rooms
 * for every event, so "This event" isn't offered, and the first offered is
 * picked.
 */
export function ScopePrompt({ action, onDone }: { action: ScopeAction; onDone: (scope: RepeatScope | null) => void }) {
    const copy = COPY[action];
    const scopes = action === "answer" ? SCOPES.filter((s) => s.value !== "following") : action === "rooms" ? SCOPES.filter((s) => s.value !== "this") : SCOPES;
    const [scope, setScope] = useState<RepeatScope>(scopes[0].value);
    return (
        <Dialog open onOpenChange={(open) => !open && onDone(null)}>
            <DialogContent size="sm" data-scope-prompt={action} onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>
                <form
                    id="scope-prompt"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onDone(scope);
                    }}
                >
                    <RadioGroup value={scope} onValueChange={(v) => setScope(v as RepeatScope)} aria-label="Which events" className="gap-3">
                        {scopes.map((s) => (
                            <div key={s.value} className="flex items-center gap-2.5">
                                <RadioGroupItem value={s.value} id={`scope-${s.value}`} autoFocus={s.value === scopes[0].value} />
                                <Label htmlFor={`scope-${s.value}`} className="font-normal">
                                    {s.label}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                </form>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onDone(null)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="scope-prompt" variant={action === "delete" ? "destructive" : "default"}>
                        {copy.confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
