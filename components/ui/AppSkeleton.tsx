"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * ChatSkeleton — placeholder for chat / channel / group thread surfaces
 * while the initial fetch resolves. Matches the post-refactor density:
 * 48px header chrome, 36px message avatars, gap-3 px-4 py-2.5 rows.
 */
export const ChatSkeleton = () => {
    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header chrome — 48px to match chatIdDesktop / SectionTabs */}
            <div className="flex h-12 items-center gap-2.5 px-3 md:px-4 border-b border-border/60 shrink-0">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                </div>
                <div className="ml-auto flex gap-1">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                </div>
            </div>

            {/* Message stream */}
            <div className="flex-1 overflow-hidden px-2 py-3 space-y-1">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 px-2 py-2">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-baseline gap-2">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-2.5 w-10" />
                            </div>
                            <Skeleton className="h-3 w-[88%]" />
                            <Skeleton
                                className={cn(
                                    "h-3",
                                    i % 3 === 0 ? "w-[55%]" : i % 2 === 0 ? "w-[70%]" : "w-[40%]",
                                )}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Input chrome */}
            <div className="px-3 md:px-4 py-3 border-t border-border/60 shrink-0">
                <Skeleton className="h-12 w-full rounded-lg" />
            </div>
        </div>
    )
}

/**
 * GenericSkeleton — generic page-level placeholder. Used by detail pages
 * that don't have a chat-specific layout. Matches PageContainer density.
 */
export const GenericSkeleton = () => {
    return (
        <div className="p-4 md:p-6 space-y-6">
            <Skeleton className="h-7 w-48" />
            <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[92%]" />
                <Skeleton className="h-3 w-[80%]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <Skeleton className="h-28 rounded-lg" />
                <Skeleton className="h-28 rounded-lg" />
                <Skeleton className="h-28 rounded-lg" />
            </div>
        </div>
    )
}
