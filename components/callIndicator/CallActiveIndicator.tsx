import React from "react";
import { cn } from "@/lib/utils/helpers/cn";

interface CallActiveIndicatorProps {
    /** 'sm' for list/sidebar items, 'md' for detail views */
    size?: "sm" | "md";
    /** Whether to show the pulsing ring (use false in dense lists like the sidebar) */
    pulse?: boolean;
    /** "dot", the default, or the "Live" pill (hub.md C12) for a header or an agenda row. */
    variant?: "dot" | "pill";
    className?: string;
}

/**
 * A call is live here (hub.md C12): a moss dot whose ring grows and fades
 * (hub-live-dot), standing still in dense lists and for reduced motion, or
 * the "Live" pill where there is room for a word. Used across channel lists,
 * chat lists, the sidebar and the phone's home.
 */
export const CallActiveIndicator: React.FC<CallActiveIndicatorProps> = React.memo(
    ({ size = "sm", pulse = true, variant = "dot", className }) => {
        if (variant === "pill") return <LivePill pulse={pulse} className={className} />;
        return (
            <span
                aria-hidden
                className={cn("hub-live-dot", size === "md" && "size-2.5", !pulse && "after:hidden", className)}
            />
        );
    }
);

CallActiveIndicator.displayName = "CallActiveIndicator";

/**
 * The Live pill (hub.md C12): moss tint, a 6px moss dot, "Live". It pulses
 * outside the sidebar; in a dense list the dot stands still.
 */
export function LivePill({ pulse = true, className }: { pulse?: boolean; className?: string }) {
    return (
        <span
            data-live-pill=""
            className={cn("inline-flex h-[18px] items-center gap-1 rounded-[9px] bg-camp-moss-tint px-1.5 text-micro font-semibold leading-none text-camp-moss-ink", className)}
        >
            <span className={cn("hub-live-dot", !pulse && "after:hidden")} aria-hidden />
            Live
        </span>
    );
}
