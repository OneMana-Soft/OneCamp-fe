"use client";

import { ToastAction } from "@/components/ui/toast";

/** A moved event's Undo, in a chunk of its own: the toast's code stays off the calendar's first load. */
export const undoAction = (onUndo: () => void) => (
    <ToastAction altText="Undo the move" onClick={onUndo}>
        Undo
    </ToastAction>
);
