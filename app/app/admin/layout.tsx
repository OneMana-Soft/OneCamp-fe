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
 * The admin page's frame while the gate asks who you are (design v3, admin
 * §1.2): the section header (a 36px tile, a title and a line) and the first
 * card of rows, at the sizes the page draws them, so the page arrives into its
 * own shape. The settings nav is already in the sidebar.
 */
function AdminFrameSkeleton() {
    return (
        <div role="status" aria-label="Loading Admin" className="flex h-full min-h-0 flex-col bg-background">
            <div className="mx-auto w-full max-w-[944px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10" aria-hidden="true">
                <div className="mb-8 flex items-start gap-4">
                    <Skeleton className="size-9 shrink-0 rounded-[10px] max-sm:hidden" />
                    <div className="flex-1 space-y-2 pt-1">
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-3.5 w-72 max-w-full" />
                    </div>
                </div>
                <div className="set-card">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="set-row flex items-center gap-3">
                            <Skeleton variant="circle" className="size-8 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className={i % 2 === 0 ? "h-3.5 w-32" : "h-3.5 w-40"} />
                                <Skeleton className="h-3 w-56 max-w-full" />
                            </div>
                        </div>
                    ))}
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
