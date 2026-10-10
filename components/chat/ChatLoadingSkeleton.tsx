import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A conversation loading, in the message row's own measures (baseMessageCard):
 * 16px in, a 36px avatar 12px from the words, a 20px name line and a 22px
 * line of text, 6px above and below, so a row is the loaded row's 54px,
 * under the room the date line takes (32px). It
 * was 48px circles on a 92px pitch, so every message jumped as they landed.
 */
export const ChatLoadingSkeleton = () => {
    return (
        <div data-message-skeleton="" role="status" aria-label="Loading messages" className="flex flex-col w-full h-full overflow-hidden pt-8">
            {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} aria-hidden="true" className="flex w-full gap-3 px-4 py-1.5">
                    <Skeleton className="mt-0.5 h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <div className="flex h-5 items-center gap-2">
                            <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-24" : "w-20")} />
                            <Skeleton className="h-3 w-12" />
                        </div>
                        <div className="flex h-[22px] items-center">
                            <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-[70%]" : i % 2 === 0 ? "w-[55%]" : "w-[40%]")} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
