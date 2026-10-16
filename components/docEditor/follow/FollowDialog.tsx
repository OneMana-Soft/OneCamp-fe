"use client"

/**
 * "Notifications" from the phone's doc sheet (QA DSA-06): the More menu's
 * submenu as a sheet of its own, the same three choices, chosen at a tap.
 */
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { FOLLOW_MODES } from "@/services/followService"
import { cn } from "@/lib/utils/helpers/cn"
import { useFollowChoice } from "./useFollowChoice"
import { MenuCheck } from "@/components/ui/menuCheck"

export default function FollowDialog({ docId, onClose }: { docId: string; onClose(): void }) {
    const { state, saving, choose } = useFollowChoice(docId)
    return (
        <ResponsiveDialog
            title="Notifications"
            description="How much you hear about this doc."
            onClose={onClose}
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div role="radiogroup" aria-label="Notifications" className="flex flex-col pb-2" data-follow-choices="">
                {FOLLOW_MODES.map((m) => {
                    const on = state?.mode === m.mode
                    return (
                        <button
                            key={m.mode}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={!state || saving}
                            onClick={() => void choose(m.mode)}
                            data-press="row"
                            className={cn("flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 text-left disabled:opacity-60", on && "bg-hover")}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-ui text-ink">
                                    {m.label}
                                    {m.mode === state?.default ? <span className="text-ink-3"> (default)</span> : null}
                                </span>
                                <span className="block text-meta text-ink-3">{m.hint}</span>
                            </span>
                            <MenuCheck checked={on} className="text-ink" />
                        </button>
                    )
                })}
            </div>
        </ResponsiveDialog>
    )
}
