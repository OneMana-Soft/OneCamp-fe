import { NotificationType } from "@/types/channel"
import { Bell, BellOff, LoaderCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import * as React from "react"
import { useMedia } from "@/context/MediaQueryContext"
import { cn } from "@/lib/utils/helpers/cn"

interface NotificationBellProps {
    notificationType: string
    isLoading: boolean
    onNotCLick: () => void
}

export const NotificationBell = ({
    notificationType,
    isLoading,
    onNotCLick,
}: NotificationBellProps) => {
    const { isMobile, isDesktop } = useMedia()

    if (!notificationType) return null

    const ariaLabel = (() => {
        switch (notificationType) {
            case NotificationType.NotificationAll:
                return "All notifications enabled. Click to change."
            case NotificationType.NotificationBlock:
                return "Notifications muted. Click to change."
            case NotificationType.NotificationMention:
                return "Mentions only. Click to change."
            default:
                return "Notification settings"
        }
    })()

    const renderIcon = () => {
        if (isLoading) return <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />

        switch (notificationType) {
            case NotificationType.NotificationAll:
                return <Bell className="h-[18px] w-[18px]" />
            case NotificationType.NotificationBlock:
                return <BellOff className="h-[18px] w-[18px]" />
            case NotificationType.NotificationMention:
                return (
                    <div className="relative">
                        <Bell className="h-[18px] w-[18px]" />
                        <span
                            className={cn(
                                "absolute -top-1 -right-1.5 px-1 rounded-full",
                                "text-[9px] font-bold leading-tight bg-background text-foreground",
                                "ring-1 ring-border",
                            )}
                            aria-hidden
                        >
                            @
                        </span>
                    </div>
                )
            default:
                return null
        }
    }

    if (isDesktop) {
        return (
            <Button
                variant="ghost"
                size="icon"
                disabled={isLoading}
                onClick={onNotCLick}
                aria-label={ariaLabel}
            >
                {renderIcon()}
            </Button>
        )
    }

    if (isMobile) {
        return (
            <button
                type="button"
                onClick={onNotCLick}
                disabled={isLoading}
                aria-label={ariaLabel}
                className={cn(
                    "p-2 rounded-md text-foreground",
                    "transition-colors duration-100",
                    "active:bg-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    "disabled:opacity-50 disabled:pointer-events-none",
                )}
            >
                {renderIcon()}
            </button>
        )
    }

    return null
}
