import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * How deleting a message is confirmed, wherever Delete is chosen (C20, SD-5):
 * in place, saying it goes for everyone and can't be undone, with the
 * surface's own Cancel and Delete. A computer's More menu and a phone's sheet
 * both draw this; a thread's reply opened a dialog half a second after its
 * menu had already asked, and toasted when it was done.
 */
export function DeleteConfirm({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div role="group" aria-label="Delete this message?" data-delete-confirm="" className={cn("animate-fade-in", className)}>
            <p className="text-ui-sm font-medium text-ink">Delete for everyone?</p>
            <p className="mt-0.5 text-meta text-ink-3">It can&apos;t be undone.</p>
            <div className="mt-2 flex justify-end gap-1.5">{children}</div>
        </div>
    )
}
