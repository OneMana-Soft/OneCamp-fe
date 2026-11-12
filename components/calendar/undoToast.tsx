"use client";

import { ToastAction } from "@/components/ui/toast";

/** A moved event's Undo, in a chunk of its own: the toast's code stays off the calendar's first load and its panels. */
export const undoAction = (onUndo: () => void) => (
    <ToastAction altText="Undo the move" onClick={onUndo}>
        Undo
    </ToastAction>
);

/** Any other action a calendar toast offers, from the same chunk: a restored event's Show. */
export const toastAction = (label: string, altText: string, onClick: () => void) => (
    <ToastAction altText={altText} onClick={onClick}>
        {label}
    </ToastAction>
);
