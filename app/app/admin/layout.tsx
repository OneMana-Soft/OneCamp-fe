"use client"

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {StatePlaceholder} from "@/components/ui/StatePlaceholder";
import {EmptyState} from "@/components/ui/empty-state";
import {Button} from "@/components/ui/button";
import {SpotError} from "@/components/ui/graphics";
import {Skeleton} from "@/components/ui/skeleton";
import {Lock, RefreshCw} from "@/lib/icons";

/**
 * The admin page's frame while the gate asks who you are: its header, the
 * menu down the side and the first rows of a section, at the sizes the page
 * draws them, so the page arrives into its own shape instead of replacing a
 * spinner in the middle of nothing.
 */
function AdminFrameSkeleton() {
    return (
        <div role="status" aria-label="Loading Admin" className="flex h-full min-h-0 flex-col bg-background">
            <div className="shrink-0 border-b border-border px-4 py-5 sm:px-6 lg:px-8" aria-hidden="true">
                <div className="mx-auto w-full max-w-6xl space-y-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-7 w-28" />
                </div>
            </div>
            <div className="px-4 py-6 sm:px-6 lg:px-8" aria-hidden="true">
                <div className="mx-auto w-full max-w-6xl lg:flex lg:items-start lg:gap-8">
                    <div className="hidden w-52 shrink-0 space-y-2 lg:block">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className={i % 3 === 0 ? "h-3 w-20" : "h-7 w-full"} />
                        ))}
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                        <Skeleton className="h-5 w-32" />
                        <div className="divide-y divide-border rounded-lg border border-border">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                    <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className={i % 2 === 0 ? "h-3.5 w-32" : "h-3.5 w-40"} />
                                        <Skeleton className="h-3 w-56 max-w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AdminGate({
                                      children,
                                  }: Readonly<{
    children: React.ReactNode;
}>) {

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    if (selfProfile.isLoading) {
        return <AdminFrameSkeleton/>
    }

    // Asked before "are you an admin": a failed request leaves no profile, and
    // the page used to answer that with "Admins only", telling an admin they
    // weren't one.
    if (selfProfile.isError && !selfProfile.data) {
        // The whole page, so its heading is the page's, under the error spot.
        return (
            <div className="flex h-full items-center justify-center">
                <EmptyState
                    illustration={<SpotError />}
                    headingLevel={1}
                    title="Couldn't load this page"
                    description="Nothing has been lost. This is usually a connection problem: try again in a moment."
                    action={
                        <Button variant="outline" size="sm" onClick={() => void selfProfile.mutate()} className="gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Try again
                        </Button>
                    }
                />
            </div>
        )
    }

    if (!selfProfile.data?.data.user_is_admin) {
        // A refusal, not a failure: nothing went wrong, so it is not drawn in
        // the danger colour with an alert icon.
        return (
            <div className="flex h-full items-center justify-center">
                <StatePlaceholder
                    type="empty"
                    icon={Lock}
                    title="Admins only"
                    description="Only workspace admins can open this page. Ask an admin if you need a change made here."
                />
            </div>
        )
    }

    return (
        <>
            {children}

        </>
    )
}
