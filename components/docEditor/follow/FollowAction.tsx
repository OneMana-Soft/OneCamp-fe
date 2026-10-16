"use client"

/**
 * "Notifications" in a doc's More menu (docs programme A6): how much the
 * reader hears about this page. All activity, Replies and mentions (the
 * default for its owner and editors, and anyone who commented), or Only
 * @mentions. Registered in the doc shell's More slot (./register), so it
 * renders inside the host's menu.
 */
import {
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, BellOff } from "@/lib/icons"
import { FOLLOW_MODES } from "@/services/followService"
import { useFollowChoice } from "./useFollowChoice"

export default function FollowAction({ docId }: { docId: string }) {
    const { state, saving, choose } = useFollowChoice(docId)
    // Not shown until it can be: an error reads as nothing to choose, never as a wrong choice.
    if (!state) return null

    const Icon = state.mode === "none" ? BellOff : Bell
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
                <Icon className="size-4 text-ink-3" aria-hidden />
                Notifications
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72">
                <DropdownMenuRadioGroup value={state.mode} onValueChange={(v) => void choose(v)}>
                    {FOLLOW_MODES.map((m) => (
                        <DropdownMenuRadioItem key={m.mode} value={m.mode} disabled={saving} className="flex-col items-start gap-0.5">
                            <span>
                                {m.label}
                                {m.mode === state.default ? <span className="text-ink-3"> (default)</span> : null}
                            </span>
                            <span className="text-xs text-ink-3">{m.hint}</span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}
