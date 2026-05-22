import React from "react";
import { cn } from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";

interface CallActiveIndicatorProps {
    /** 'sm' for list/sidebar items, 'md' for detail views */
    size?: "sm" | "md";
    /** Whether to show the pulsing animation (use false in dense lists like sidebar) */
    pulse?: boolean;
    className?: string;
}

/**
 * Pulsing green dot indicator for active calls.
 * Used across channel lists, chat lists, sidebar, and mobile home.
 */
export const CallActiveIndicator: React.FC<CallActiveIndicatorProps> = React.memo(
    ({ size = "sm", pulse = true, className }) => {
        const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

        return (
            <span className={cn("relative inline-flex shrink-0", className)}>
                {pulse && (
                    <span
                        className={cn(
                            "animate-ping absolute inline-flex rounded-full opacity-75",
                            statusColors.online.ping,
                            dotSize
                        )}
                    />
                )}
                <span
                    className={cn(
                        "relative inline-flex rounded-full",
                        statusColors.online.solid,
                        dotSize
                    )}
                />
            </span>
        );
    }
);

CallActiveIndicator.displayName = "CallActiveIndicator";
